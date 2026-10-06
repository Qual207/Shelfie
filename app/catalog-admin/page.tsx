"use client";

import Link from "next/link";
import { useState } from "react";
import type { RescanDiff } from "@/lib/scans";
import { Capture } from "@/components/capture";
import { api, json, mediaUrl, useAppState } from "@/components/client";
import { ProductCard } from "@/components/product-card";
import { Page } from "@/components/page";
import { PhotoProgress } from "@/components/photo-progress";
import { ResetDialog } from "@/components/reset-dialog";
import { ErrorBanner, Working } from "@/components/status";

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
    <Page
      title="Catalog"
      intro={
        <>
          <b className="text-ink">{onShelf}</b> on the shelf, <b className="text-ink">{gone}</b> gone,{" "}
          <b className="text-ink">{review}</b> waiting for review. This is what the store agent can sell.
        </>
      }
      actions={
        <>
          <Link href="/catalog" target="_blank" className="btn">
            View agent-readable page
          </Link>
          <ResetDialog trigger="button" />
        </>
      }
    >
      <ErrorBanner message={pollError} />
      <PhotoProgress products={state?.products ?? []} />
      <div className="grid lg:grid-cols-[minmax(0,4fr)_minmax(0,10fr)] gap-8 items-start">
        <section className="panel p-5 flex flex-col gap-4 lg:sticky lg:top-6" aria-labelledby="rescan-title">
          <div>
            <h2 id="rescan-title" className="text-xl">
              Rescan a shelf
            </h2>
            <p className="text-sm text-muted mt-1">Film it again to see what sold, what came back and what is new.</p>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">Shelf</span>
            <select value={shelf} onChange={(e) => setShelfChoice(e.target.value)} className="field">
              {shelves.length === 0 && <option value="">Approve a scanned shelf first</option>}
              {shelves.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <Capture busy={startedAt !== null || !shelf} onCapture={rescan} />
          {startedAt !== null && <Working since={startedAt}>Comparing with the catalog</Working>}
          {error && <p className="notice notice-error">{error}</p>}
          {active && <DiffPanel diff={active.diff} applied={Boolean(activeScan?.applied_at)} applying={applying} onApply={apply} />}
          {rescans.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm text-muted pt-3 border-t border-line">
              Earlier rescans
              <select
                value=""
                onChange={(e) => {
                  const s = rescans.find((r) => r.id === Number(e.target.value));
                  if (s?.diff) setActive({ scanId: s.id, diff: s.diff });
                }}
                className="field text-base text-ink"
              >
                <option value="">Open an earlier rescan…</option>
                {rescans.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shelf} at {new Date(s.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}: {s.diff!.gone.length} gone, {s.diff!.new_products.length} new{s.applied_at ? " (applied)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        <section className="flex flex-col gap-9" aria-label="Products by shelf">
          {[...new Set(products.map((p) => p.shelf ?? "Unsorted"))].map((name) => {
            const items = products.filter((p) => (p.shelf ?? "Unsorted") === name);
            return (
              <div key={name} className="flex flex-col gap-4">
                <h2 className="text-2xl flex items-baseline gap-3">
                  {name}
                  <span className="text-base font-normal text-muted" style={{ fontVariationSettings: "normal" }}>
                    {items.length} products
                  </span>
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
                  {items.map((p) => (
                    <ProductCard key={p.id} product={p} review={p.status === "pending"} />
                  ))}
                </div>
              </div>
            );
          })}
          {state && products.length === 0 && (
            <div className="panel p-8 flex flex-wrap items-center gap-4">
              <p className="text-lg text-muted flex-1">The catalog is empty. Scan a shelf to fill it.</p>
              <Link href="/scan" className="btn btn-primary">
                Scan a shelf
              </Link>
            </div>
          )}
        </section>
      </div>
    </Page>
  );
}

function DiffPanel({ diff, applied, applying, onApply }: { diff: RescanDiff; applied: boolean; applying: boolean; onApply: () => void }) {
  const nothing = diff.gone.length + diff.back.length + diff.new_products.length === 0;
  return (
    <div className="flex flex-col gap-4 pt-3 border-t border-line">
      <DiffList title="Gone from shelf" tone="bg-brick" items={diff.gone} />
      <DiffList title="Back on shelf" tone="bg-leaf" items={diff.back} />
      <DiffList title="New on the shelf" tone="bg-tag" items={diff.new_products.map((p, i) => ({ id: -i - 1, name: p.name, frame_path: p.frame_path }))} />
      <p className="text-sm text-muted">{diff.seen} catalog product{diff.seen === 1 ? "" : "s"} still on the shelf{nothing ? ". No changes." : "."}</p>
      <button onClick={onApply} disabled={applied || applying} className="btn btn-primary btn-lg">
        {applied ? "Applied to the catalog" : applying ? "Applying…" : "Apply to the catalog"}
      </button>
    </div>
  );
}

function DiffList({ title, tone, items }: { title: string; tone: string; items: { id: number; name: string; frame_path: string | null }[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="font-semibold flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${tone}`} aria-hidden />
        {title}
      </h3>
      <ul className="flex flex-col gap-2 mt-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            {item.frame_path && (
              // eslint-disable-next-line @next/next/no-img-element -- frames are served from data/
              <img src={mediaUrl(item.frame_path)} alt="" className="w-16 h-12 rounded object-cover" />
            )}
            <span className="font-medium">{item.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
