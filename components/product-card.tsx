"use client";

import { useState } from "react";
import type { StateProduct } from "@/app/api/state/route";
import { seenAgo } from "@/lib/time";
import { api, json, mediaUrl } from "./client";

const SOURCE_LABEL = { tag: "read from tag", owner_typed: "typed by owner", owner_voice: "said by owner" };

export function ProductCard({ product, review }: { product: StateProduct; review: boolean }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gone = product.status === "approved" && product.on_shelf !== 1;

  async function update(body: object) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/products/${product.id}`, { ...json(body), method: "PATCH" });
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${product.name}"?`)) return;
    setBusy(true);
    try {
      await api(`/api/products/${product.id}`, { method: "DELETE" });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <article className={`bg-white rounded-2xl border border-line overflow-hidden flex flex-col ${gone ? "opacity-60" : ""}`}>
      <div className="aspect-[4/3] bg-zinc-100 relative">
        {product.frame_path ? (
          // eslint-disable-next-line @next/next/no-img-element -- frames are served from data/, not optimizable static assets
          <img src={mediaUrl(product.frame_path)} alt={product.name} className={`w-full h-full object-cover ${gone ? "grayscale" : ""}`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl text-zinc-300">▦</div>
        )}
        <StatusBadge product={product} />
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        {editing ? (
          <EditForm product={product} busy={busy} onSave={update} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xl font-bold leading-tight">{product.name}</h3>
              {product.price_usd !== null && <span className="text-xl font-bold">${product.price_usd.toFixed(2)}</span>}
            </div>
            <p className="text-muted text-sm">
              {[product.category, product.shelf, product.location].filter(Boolean).join(" · ")}
            </p>
            <p className="leading-snug">{product.description}</p>
            {product.price_usd === null ? (
              <PriceEntry busy={busy} onSave={(price_usd) => update({ price_usd })} />
            ) : (
              review && product.price_source && <p className="text-sm text-muted">Price {SOURCE_LABEL[product.price_source]}</p>
            )}
            <p className="text-sm text-muted mt-auto">Last seen {seenAgo(product.last_seen_at)}</p>
            {review && (
              <div className="flex gap-2 pt-1">
                {product.status === "pending" && (
                  <button disabled={busy} onClick={() => update({ status: "approved" })} className="flex-1 bg-accent hover:bg-accent-dark text-white font-semibold rounded-lg py-2 disabled:opacity-50">
                    Approve
                  </button>
                )}
                <button disabled={busy} onClick={() => setEditing(true)} className="px-4 border border-line rounded-lg font-semibold hover:bg-zinc-50">
                  Edit
                </button>
                <button disabled={busy} onClick={remove} className="px-4 border border-line rounded-lg font-semibold text-red-700 hover:bg-red-50">
                  Delete
                </button>
              </div>
            )}
          </>
        )}
        {error && <p className="text-red-700 text-sm font-medium">{error}</p>}
      </div>
    </article>
  );
}

function StatusBadge({ product }: { product: StateProduct }) {
  const [label, style] =
    product.status === "pending"
      ? ["Needs review", "bg-ink text-white"]
      : product.on_shelf === 1
        ? ["On shelf", "bg-emerald-600 text-white"]
        : ["Gone from shelf", "bg-red-600 text-white"];
  return <span className={`absolute top-3 left-3 px-3 py-1 rounded-full text-sm font-semibold ${style}`}>{label}</span>;
}

function PriceEntry({ busy, onSave }: { busy: boolean; onSave: (price: number) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (Number(value) > 0) onSave(Number(value));
      }}
    >
      <span className="px-2 py-1 rounded-md bg-amber-100 text-amber-900 text-sm font-bold whitespace-nowrap">Price needed</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        placeholder="$"
        className="w-20 border border-line rounded-md px-2 py-1"
      />
      <button disabled={busy || !(Number(value) > 0)} className="px-3 py-1 rounded-md bg-ink text-white font-semibold disabled:opacity-40">
        Set
      </button>
    </form>
  );
}

function EditForm({
  product,
  busy,
  onSave,
  onCancel,
}: {
  product: StateProduct;
  busy: boolean;
  onSave: (body: object) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState(product.category);
  const [description, setDescription] = useState(product.description);
  const [price, setPrice] = useState(product.price_usd?.toString() ?? "");
  const field = "w-full border border-line rounded-md px-2 py-1";
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name, category, description, price_usd: price.trim() === "" ? null : Number(price) });
      }}
    >
      <input className={`${field} font-bold`} value={name} onChange={(e) => setName(e.target.value)} />
      <input className={field} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" />
      <textarea className={field} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      <input className={field} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price (USD)" inputMode="decimal" />
      <div className="flex gap-2">
        <button disabled={busy} className="flex-1 bg-ink text-white font-semibold rounded-lg py-2 disabled:opacity-50">Save</button>
        <button type="button" onClick={onCancel} className="px-4 border border-line rounded-lg font-semibold">Cancel</button>
      </div>
    </form>
  );
}
