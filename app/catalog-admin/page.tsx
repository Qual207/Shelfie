"use client";

import { useState } from "react";
import type { RescanDiff } from "@/lib/scans";
import { Capture } from "@/components/capture";
import { api, json, mediaUrl, useAppState } from "@/components/client";
import { ProductCard } from "@/components/product-card";
import { Elapsed, ErrorBanner } from "@/components/status";

export default function CatalogAdminPage() {
  const { state, error: pollError } = useAppState();
  const [shelfChoice, setShelfChoice] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<{ scanId: number; diff: RescanDiff } | null>(null);
  const [applying, setApplying] = useState(false);

  const products = state?.products ?? [];
  const shelves = [...new Set(products.filter((p) => p.status === "approved").map((p) => p.shelf ?? ""))].filter(Boolean);
  const shelf = shelfChoice ?? state?.scans.find((s) => shelves.includes(s.shelf))?.shelf ?? shelves[0] ?? "";
  const rescans = state?.scans.filter((s) => s.kind === "rescan" && s.diff) ?? [];
  const activeScan = state?.scans.find((s) => s.id === active?.scanId);
  const onShelf = products.filter((p) => p.status === "approved" && p.on_shelf === 1).length;
  const gone = products.filter((p) => p.status === "approved" && p.on_shelf !== 1).length;
  const review = products.filter((p) => p.status === "pending").length;

  async function rescan(form: FormData) {
    form.append("shelf", shelf);
    setStartedAt(Date.now());
    setError(null);
    setActive(null);
    try {
      setActive(await api<{ scanId: number; diff: RescanDiff }>("/api/rescan", { method: "POST", body: form }, 240_000));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStartedAt(null);
    }
  }

  async function apply() {
    if (!active) return;
    setApplying(true);
    setError(null);
    try {
      await api("/api/rescan/apply", json({ scanId: active.scanId }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ErrorBanner message={pollError} />
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">Catalog</h1>
        <p className="text-lg text-muted mt-1">
          <b className="text-ink">{onShelf}</b> on the shelf · <b className="text-ink">{gone}</b> gone · <b className="text-ink">{review}</b> need review
        </p>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,4fr)_minmax(0,9fr)] gap-8 items-start">
        <section className="flex flex-col gap-4 lg:sticky lg:top-6 bg-white rounded-2xl border border-line p-5">
          <h2 className="text-2xl font-bold">Rescan a shelf</h2>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Shelf</span>
            <select value={shelf} onChange={(e) => setShelfChoice(e.target.value)} className="border border-line rounded-lg px-3 py-2 text-lg bg-white">
              {shelves.length === 0 && <option value="">Approve a scanned shelf first</option>}
              {shelves.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <Capture busy={startedAt !== null || !shelf} onCapture={rescan} />
          {startedAt !== null && (
            <div className="rounded-xl border-2 border-accent p-4 text-lg font-semibold">
              Comparing with the catalog… <Elapsed since={startedAt} />
            </div>
          )}
          {error && <p className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-800 font-medium">{error}</p>}
          {active && <DiffPanel diff={active.diff} applied={Boolean(activeScan?.applied_at)} applying={applying} onApply={apply} />}
          {rescans.length > 0 && (
            <label className="flex flex-col gap-1 text-sm text-muted pt-2 border-t border-line">
              Recorded rescans
              <select
                value=""
                onChange={(e) => {
                  const s = rescans.find((r) => r.id === Number(e.target.value));
                  if (s?.diff) setActive({ scanId: s.id, diff: s.diff });
                }}
                className="border border-line rounded-lg px-2 py-1 text-base text-ink bg-white"
              >
                <option value="">Open a previous rescan…</option>
                {rescans.map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.id} {s.shelf} · {new Date(s.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · {s.diff!.gone.length} gone, {s.diff!.new_products.length} new{s.applied_at ? " · applied" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        <section className="flex flex-col gap-8">
          {[...new Set(products.map((p) => p.shelf ?? "Unsorted"))].map((name) => (
            <div key={name} className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold">{name}</h2>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {products.filter((p) => (p.shelf ?? "Unsorted") === name).map((p) => (
                  <ProductCard key={p.id} product={p} review={p.status === "pending"} />
                ))}
              </div>
            </div>
          ))}
          {products.length === 0 && <p className="text-lg text-muted">The catalog is empty. Scan a shelf first.</p>}
        </section>
      </div>
    </div>
  );
}

function DiffPanel({ diff, applied, applying, onApply }: { diff: RescanDiff; applied: boolean; applying: boolean; onApply: () => void }) {
  const nothing = diff.gone.length + diff.back.length + diff.new_products.length === 0;
  return (
    <div className="flex flex-col gap-4">
      <DiffList title="Gone from shelf" tone="text-red-700" items={diff.gone} />
      <DiffList title="Back on shelf" tone="text-emerald-700" items={diff.back} />
      <DiffList title="New" tone="text-accent" items={diff.new_products.map((p, i) => ({ id: -i - 1, name: p.name, frame_path: p.frame_path }))} />
      <p className="text-muted">{diff.seen} catalog product{diff.seen === 1 ? "" : "s"} still on the shelf{nothing ? ". No changes." : "."}</p>
      <button
        onClick={onApply}
        disabled={applied || applying}
        className="py-3 rounded-xl text-xl font-bold text-white bg-accent hover:bg-accent-dark disabled:bg-emerald-600 disabled:opacity-100"
      >
        {applied ? "Applied ✓" : applying ? "Applying…" : "Apply"}
      </button>
    </div>
  );
}

function DiffList({ title, tone, items }: { title: string; tone: string; items: { id: number; name: string; frame_path: string | null }[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className={`text-lg font-bold ${tone}`}>{title}</h3>
      <ul className="flex flex-col gap-2 mt-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            {item.frame_path && (
              // eslint-disable-next-line @next/next/no-img-element -- frames are served from data/
              <img src={mediaUrl(item.frame_path)} alt="" className="w-16 h-12 rounded object-cover" />
            )}
            <span className="text-lg font-semibold">{item.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
