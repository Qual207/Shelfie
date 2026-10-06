import { nowIso, type Db } from "./db";
import { STORE_INFO } from "./store-info";
import { seenAgo } from "./time";

export type PriceSource = "tag" | "owner_typed" | "owner_voice";

export interface Product {
  id: number;
  scan_id: number | null;
  name: string;
  description: string;
  category: string;
  price_usd: number | null;
  price_source: PriceSource | null;
  location: string;
  frame_path: string | null;
  confidence: number;
  status: "pending" | "approved";
  on_shelf: number;
  off_shelf_at: string | null;
  last_seen_at: string;
  created_at: string;
  /** Product cropped out of its best frame (relative to data/), once imaging has run. */
  crop_path: string | null;
  /** Display photo: the refined crop when refinement succeeded, else the crop. */
  image_path: string | null;
  /** VLM check of the crop: null = not checked yet. */
  check_status: "verified" | "corrected" | "not_product" | null;
  check_note: string | null;
  /** When the photo pipeline finished for this product; null while it is pending. */
  imaged_at: string | null;
  imaging_attempts: number;
}

/** A product as the vision model reports it (scan format). */
export interface ScannedProduct {
  name: string;
  description: string;
  category: string;
  price_usd: number | null;
  location: string;
  best_frame: number;
  confidence: number;
}

export function listProducts(db: Db): Product[] {
  return db.prepare("SELECT * FROM products ORDER BY created_at, id").all() as Product[];
}

export function getProductRow(db: Db, id: number): Product | undefined {
  return db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined;
}

export function insertScannedProducts(
  db: Db,
  scanId: number,
  products: ScannedProduct[],
  frames: string[],
  seenAt: string,
): void {
  const insert = db.prepare(`
    INSERT INTO products (scan_id, name, description, category, price_usd, price_source,
      location, frame_path, confidence, status, on_shelf, last_seen_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?)
  `);
  db.transaction(() => {
    for (const p of products) {
      insert.run(
        scanId, p.name, p.description, p.category, p.price_usd, p.price_usd === null ? null : "tag",
        p.location, frames[p.best_frame] ?? frames[0] ?? null, p.confidence, seenAt, nowIso(),
      );
    }
  })();
}

// ---- Store agent tools (executed by agents/store-agent.ts against this database) ----

const STOP_WORDS = new Set(
  "a an and are at for from gift gifts her him i in is it its looking loves me my of on or something that the their them they this to under with".split(" "),
);

function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

function shopperView(p: Product, now: Date) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    price_usd: p.price_usd,
    on_shelf: p.on_shelf === 1,
    ...(p.on_shelf === 1 ? {} : { gone_from_shelf_since: seenAgo(p.off_shelf_at ?? p.last_seen_at, now) }),
    last_seen: seenAgo(p.last_seen_at, now),
    last_seen_at: p.last_seen_at,
  };
}

/**
 * Keyword + category match over approved products. The catalog is small, so every approved
 * product within budget comes back, best matches first, and the model picks. Products that
 * are no longer on the shelf are included with on_shelf: false.
 */
export function searchCatalog(
  db: Db,
  args: { query?: string; max_price_usd?: number; category?: string },
  now = new Date(),
) {
  const terms = keywords(`${args.query ?? ""} ${args.category ?? ""}`);
  const max = typeof args.max_price_usd === "number" ? args.max_price_usd : undefined;
  const approved = db
    .prepare("SELECT * FROM products WHERE status = 'approved'")
    .all() as Product[];

  const scored = approved
    .filter((p) => max === undefined || (p.price_usd !== null && p.price_usd <= max))
    .map((p) => {
      const haystack = `${p.name} ${p.category} ${p.description}`.toLowerCase();
      const score = terms.filter((t) => haystack.includes(t)).length;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score || b.p.on_shelf - a.p.on_shelf);

  return {
    results: scored.slice(0, 15).map(({ p, score }) => ({ ...shopperView(p, now), match_score: score })),
    note:
      max === undefined
        ? "All approved products, best keyword matches first."
        : `Approved products priced at or under $${max}, best keyword matches first. Unpriced products are excluded.`,
  };
}

export function getProduct(db: Db, productId: number, now = new Date()) {
  const p = getProductRow(db, productId);
  if (!p || p.status !== "approved") throw new Error(`No product with id ${productId}`);
  return { ...shopperView(p, now), location: p.location };
}

export function placeHold(
  db: Db,
  args: { product_id: number; customer_name: string; until_time: string },
) {
  const p = getProductRow(db, args.product_id);
  if (!p || p.status !== "approved") throw new Error(`No product with id ${args.product_id}`);
  if (p.on_shelf !== 1) {
    throw new Error(`${p.name} is no longer on the shelf (last seen ${seenAgo(p.last_seen_at)}), so it cannot be held.`);
  }
  if (!args.customer_name?.trim()) throw new Error("customer_name is required");
  if (!args.until_time?.trim()) throw new Error("until_time is required");

  const { lastInsertRowid } = db
    .prepare("INSERT INTO holds (product_id, customer_name, until_time, created_at) VALUES (?, ?, ?, ?)")
    .run(p.id, args.customer_name.trim(), args.until_time.trim(), nowIso());
  return {
    hold_id: Number(lastInsertRowid),
    product: p.name,
    price_usd: p.price_usd,
    customer_name: args.customer_name.trim(),
    until_time: args.until_time.trim(),
    confirmation: `${p.name} is held for ${args.customer_name.trim()} until ${args.until_time.trim()} at ${STORE_INFO.name}.`,
  };
}

export function storeInfo() {
  return STORE_INFO;
}

export function logQuestion(db: Db, fromAgent: string, text: string, productIds: number[]): void {
  db.prepare(
    "INSERT INTO questions (from_agent, text, proposed_product_ids_json, created_at) VALUES (?, ?, ?, ?)",
  ).run(fromAgent, text, JSON.stringify(productIds), nowIso());
}
