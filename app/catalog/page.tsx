import type { Product } from "@/lib/catalog";
import { getDb } from "@/lib/db";
import { STORE_INFO } from "@/lib/store-info";
import { seenAgo } from "@/lib/time";

// Plain, almost text-only catalog for agents that browse HTML.
export const dynamic = "force-dynamic";

export default function CatalogPage() {
  const products = getDb()
    .prepare("SELECT * FROM products WHERE status = 'approved' AND on_shelf = 1 ORDER BY category, name")
    .all() as Product[];
  return (
    <article className="max-w-3xl mx-auto px-6 py-10 font-serif text-lg leading-relaxed">
      <h1 className="text-3xl font-bold">{STORE_INFO.name}</h1>
      <p>
        {STORE_INFO.address}. {STORE_INFO.hours}.
      </p>
      <p>
        {products.length} products on the shelf as of {new Date().toLocaleString("en-US")}. Prices in US dollars. In-store pickup only.
      </p>
      <ul className="list-disc pl-6 mt-4">
        {products.map((p) => (
          <li key={p.id} id={`product-${p.id}`} className="mb-3">
            <b>{p.name}</b>, {p.price_usd === null ? "price on request" : `$${p.price_usd.toFixed(2)}`}. {p.category}. {p.description}{" "}
            Last seen on the shelf {seenAgo(p.last_seen_at)}.
          </li>
        ))}
      </ul>
    </article>
  );
}
