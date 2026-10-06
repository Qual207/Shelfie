"use client";

import { useState } from "react";
import type { StateProduct } from "@/app/api/state/route";
import { seenAgo } from "@/lib/time";
import { api, json, mediaUrl } from "./client";
import { Price } from "./price";

const SOURCE_LABEL = { tag: "read from tag", owner_typed: "typed by owner", owner_voice: "said by owner" };

export function ProductCard({ product, review }: { product: StateProduct; review: boolean }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
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

  // Retouched photo first, then the crop from the video, then the whole frame.
  const retouched = !showOriginal && product.image_path;
  const photo = (retouched ? product.image_path : product.crop_path) ?? product.frame_path;
  const cutOut = Boolean(retouched || product.crop_path);
  const photoPending = product.frame_path && !product.imaged_at && product.imaging_attempts < 3;
  return (
    <article className={`panel overflow-hidden flex flex-col ${gone ? "bg-paper" : ""}`}>
      <div className={`aspect-[4/3] relative ${cutOut ? "specimen" : "bg-paper"}`}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- photos are served from data/, not optimizable static assets
          <img
            src={mediaUrl(photo)}
            alt={retouched ? `${product.name}, retouched from the shelf video` : product.name}
            className={`w-full h-full ${cutOut ? "object-contain p-3" : "object-cover"} ${gone ? "grayscale opacity-60" : ""}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center px-6 text-center text-muted">{product.category || "No photo"}</div>
        )}
        <StatusBadge product={product} />
        {product.image_path && (
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            aria-pressed={showOriginal}
            className="absolute bottom-2 right-2 bg-surface/95 border border-line rounded-full px-3 py-0.5 text-sm font-semibold hover:border-muted"
          >
            {showOriginal ? "Show retouched" : "Show video photo"}
          </button>
        )}
        {photoPending && (
          <span className="absolute bottom-2 left-2 bg-surface/95 border border-line rounded-full px-3 py-0.5 text-sm text-muted" role="status">
            Checking photo…
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        {editing ? (
          <EditForm product={product} busy={busy} onSave={update} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg leading-snug">{product.name}</h3>
              {product.price_usd !== null && <Price usd={product.price_usd} className={`text-xl ${gone ? "opacity-50" : ""}`} />}
            </div>
            <p className="text-sm">
              {product.category && <span className="font-semibold">{product.category}</span>}
              {product.category && (product.shelf || product.location) && <span className="text-muted">, </span>}
              <span className="text-muted">{[product.shelf, product.location].filter(Boolean).join(", ")}</span>
            </p>
            <p className="leading-snug text-[0.95rem]">{product.description}</p>
            <PhotoCheck product={product} />
            {product.price_usd === null && <PriceEntry busy={busy} onSave={(price_usd) => update({ price_usd })} />}
            <p className="text-sm text-muted mt-auto pt-1">
              Last seen {seenAgo(product.last_seen_at)}
              {product.check_status === "verified" && ". Matches its photo"}
              {review && product.price_source && `. Price ${SOURCE_LABEL[product.price_source]}`}
            </p>
            {review && (
              <div className="flex flex-wrap gap-2 pt-1">
                {product.status === "pending" && (
                  <button disabled={busy} onClick={() => update({ status: "approved" })} className="btn btn-primary flex-1 py-1.5">
                    Approve
                  </button>
                )}
                <button disabled={busy} onClick={() => setEditing(true)} className="btn py-1.5 px-3">
                  Edit
                </button>
                <button disabled={busy} onClick={remove} className="btn py-1.5 px-3 text-brick">
                  Delete
                </button>
              </div>
            )}
          </>
        )}
        {error && <p className="text-brick text-sm font-medium">{error}</p>}
      </div>
    </article>
  );
}

/** What the photo check found, when it found something the owner should know. */
function PhotoCheck({ product }: { product: StateProduct }) {
  if (product.check_status !== "corrected" && product.check_status !== "not_product") return null;
  const flagged = product.check_status === "not_product";
  return (
    <p className={`text-sm leading-snug border-l-2 pl-3 py-0.5 ${flagged ? "border-brick text-[#7a2a1b]" : "border-tag text-ink"}`}>
      <b>{flagged ? "Doesn't look like a single product. " : "Checked against the photo. "}</b>
      {product.check_note}
    </p>
  );
}

function StatusBadge({ product }: { product: StateProduct }) {
  const [label, dot] =
    product.status === "pending"
      ? ["Needs review", "bg-tag"]
      : product.on_shelf === 1
        ? ["On shelf", "bg-leaf"]
        : ["Gone from shelf", "bg-brick"];
  return (
    <span className="absolute top-3 left-3 flex items-center gap-1.5 bg-surface/95 border border-line rounded-full pl-2 pr-3 py-0.5 text-sm font-semibold">
      <span className={`w-2.5 h-2.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

function PriceEntry({ busy, onSave }: { busy: boolean; onSave: (price: number) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (Number(value) > 0) onSave(Number(value));
      }}
    >
      <span className="tag text-sm font-bold whitespace-nowrap" style={{ fontVariationSettings: "normal" }}>Price needed</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        placeholder="$"
        aria-label="Price in US dollars"
        className="field w-24 shrink-0 py-1"
      />
      <button disabled={busy || !(Number(value) > 0)} className="btn btn-primary py-1">
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
  const field = "field py-1.5";
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name, category, description, price_usd: price.trim() === "" ? null : Number(price) });
      }}
    >
      <input className={`${field} font-semibold`} value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
      <input className={field} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" aria-label="Category" />
      <textarea className={field} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Description" />
      <input className={field} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price (USD)" inputMode="decimal" aria-label="Price in US dollars" />
      <div className="flex gap-2">
        <button disabled={busy} className="btn btn-primary flex-1">Save changes</button>
        <button type="button" onClick={onCancel} className="btn">Cancel</button>
      </div>
    </form>
  );
}
