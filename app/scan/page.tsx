"use client";

import { useEffect, useRef, useState } from "react";
import { Capture } from "@/components/capture";
import { api, json, mediaUrl, useAppState } from "@/components/client";
import { Page } from "@/components/page";
import { ProductCard } from "@/components/product-card";
import { VoicePrice } from "@/components/voice-price";
import { ErrorBanner, Working } from "@/components/status";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

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
      setNotice(`Found ${res.count} products on “${shelfName}”. Review them on the right.`);
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
    <Page
      title="Scan a shelf"
      intro="Film the shelf. Shelfie names, describes and prices every product it can see, then you review them."
      actions={<VoicePrice disabled={!state?.products.some((p) => p.price_usd === null)} />}
    >
      <ErrorBanner message={pollError} />
      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,9fr)] gap-8 items-start">
        <section className="panel p-5 flex flex-col gap-5 lg:sticky lg:top-6" aria-label="New scan">
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">Shelf name</span>
            <input
              value={shelf}
              onChange={(e) => setShelf(e.target.value)}
              placeholder={shelves[0] ?? "Store shelves"}
              list="shelves"
              className="field text-lg"
            />
            <datalist id="shelves">{shelves.map((s) => <option key={s} value={s} />)}</datalist>
            <span className="text-sm text-muted">Rescans compare against products from the shelf with this name.</span>
          </label>
          <Capture busy={startedAt !== null} onCapture={submit} />
          {startedAt !== null && <Working since={startedAt}>Reading the shelf with ZooWork vision</Working>}
          {error && <p className="notice notice-error">{error}</p>}
          {notice && <p className="notice notice-ok">{notice}</p>}
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

        <section className="flex flex-col gap-4" aria-label="Review">
          <div className="flex flex-wrap items-center gap-3">
            {initialScans.length > 0 ? (
              <label className="flex items-center gap-3">
                <span className="font-semibold">Scan</span>
                <select value={scan?.id} onChange={(e) => setSelected(Number(e.target.value))} className="field w-auto font-semibold">
                  {initialScans.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shelf}, {when(s.created_at)} ({s.product_count} products)
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-lg text-muted">No scans yet. Upload a shelf video or record one to start.</p>
            )}
            {pending.length > 0 && (
              <button onClick={approveAll} className="btn btn-primary ml-auto">
                Approve all {pending.length}
              </button>
            )}
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} review />
            ))}
          </div>
        </section>
      </div>
    </Page>
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
    return <p className="notice notice-error">This video format can&apos;t play in the browser. Convert it to MP4 (see SETUP.md).</p>;
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
        className="w-full rounded-lg bg-ink max-h-[60vh]"
      />
      <div className="flex gap-2" role="group" aria-label="Playback speed">
        {[1, 2].map((r) => (
          <button key={r} onClick={() => setRate(r)} aria-pressed={rate === r} className={`btn py-1 ${rate === r ? "btn-primary" : ""}`}>
            {r}x
          </button>
        ))}
      </div>
    </div>
  );
}
