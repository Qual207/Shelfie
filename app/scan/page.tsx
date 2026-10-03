"use client";

import { useEffect, useRef, useState } from "react";
import { Capture } from "@/components/capture";
import { api, json, mediaUrl, useAppState } from "@/components/client";
import { ProductCard } from "@/components/product-card";
import { VoicePrice } from "@/components/voice-price";
import { Elapsed, ErrorBanner } from "@/components/status";

export default function ScanPage() {
  const { state, error: pollError } = useAppState();
  const [shelf, setShelf] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const initialScans = state?.scans.filter((s) => s.kind === "initial") ?? [];
  const shelves = [...new Set(state?.scans.map((s) => s.shelf))];
  const scan = initialScans.find((s) => s.id === selected) ?? initialScans[0];
  const products = state?.products.filter((p) => p.scan_id === scan?.id) ?? [];
  const pending = products.filter((p) => p.status === "pending");

  async function submit(form: FormData) {
    const shelfName = shelf.trim() || shelves[0] || "Store shelves";
    form.append("shelf", shelfName);
    setStartedAt(Date.now());
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ scanId: number; count: number }>("/api/scan", { method: "POST", body: form }, 240_000);
      setSelected(res.scanId);
      setNotice(`${res.count} products found on “${shelfName}”. Review them below.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStartedAt(null);
    }
  }

  async function approveAll() {
    try {
      await Promise.all(pending.map((p) => api(`/api/products/${p.id}`, { ...json({ status: "approved" }), method: "PATCH" })));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ErrorBanner message={pollError} />
      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] gap-8 items-start">
        <section className="flex flex-col gap-5 lg:sticky lg:top-6">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">Scan a shelf</h1>
            <p className="text-lg text-muted mt-1">Film the shelf. Shelfie names, describes and prices every product it sees.</p>
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Shelf</span>
            <input
              value={shelf}
              onChange={(e) => setShelf(e.target.value)}
              placeholder={shelves[0] ?? "Store shelves"}
              list="shelves"
              className="border border-line rounded-lg px-3 py-2 text-lg bg-white"
            />
            <datalist id="shelves">{shelves.map((s) => <option key={s} value={s} />)}</datalist>
          </label>
          <Capture busy={startedAt !== null} onCapture={submit} />
          {startedAt !== null && (
            <div className="rounded-xl bg-white border-2 border-accent p-4 text-lg font-semibold">
              Reading the shelf with ZooWork vision… <Elapsed since={startedAt} />
            </div>
          )}
          {error && <p className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-800 font-medium">{error}</p>}
          {notice && <p className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-900 font-medium">{notice}</p>}
          {scan?.video_path && <VideoPlayer src={mediaUrl(scan.video_path)} />}
          {scan && !scan.video_path && scan.frames.length > 0 && (
            <div className="grid grid-cols-5 gap-1">
              {scan.frames.map((f) => (
                // eslint-disable-next-line @next/next/no-img-element -- frames are served from data/
                <img key={f} src={mediaUrl(f)} alt="" className="rounded aspect-[4/3] object-cover" />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {initialScans.length > 0 ? (
              <select
                value={scan?.id}
                onChange={(e) => setSelected(Number(e.target.value))}
                className="text-lg font-semibold border border-line rounded-lg px-3 py-2 bg-white"
              >
                {initialScans.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shelf} · {new Date(s.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {s.product_count} products
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-lg text-muted">No scans yet. Upload a shelf video to start.</p>
            )}
            {pending.length > 0 && (
              <button onClick={approveAll} className="px-4 py-2 rounded-lg border-2 border-ink font-semibold hover:bg-white">
                Approve all {pending.length}
              </button>
            )}
            <div className="ml-auto">
              <VoicePrice disabled={!state?.products.some((p) => p.price_usd === null)} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} review />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function VideoPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [rate, setRate] = useState(2);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (ref.current) ref.current.playbackRate = rate;
  }, [rate, src]);
  if (failed) {
    return <p className="rounded-xl bg-amber-50 border border-amber-200 p-4">This video format can&apos;t play in the browser. Convert it to MP4 (see README).</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <video
        ref={ref}
        src={src}
        controls
        muted
        playsInline
        onLoadedMetadata={() => ref.current && (ref.current.playbackRate = rate)}
        onError={() => setFailed(true)}
        className="w-full rounded-xl bg-black max-h-[60vh]"
      />
      <div className="flex gap-2">
        {[1, 2].map((r) => (
          <button key={r} onClick={() => setRate(r)} className={`px-3 py-1 rounded-md font-semibold ${rate === r ? "bg-ink text-white" : "border border-line"}`}>
            {r}x
          </button>
        ))}
      </div>
    </div>
  );
}
