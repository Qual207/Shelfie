import { openDb, type Db } from "../lib/db";
import { createScan } from "../lib/scans";

/** In-memory database with one approved shelf of products; returns the db and product ids by name. */
export function seededDb(
  products: { name: string; price: number | null; onShelf?: boolean; category?: string; description?: string }[],
  shelf = "Mini shelf",
): { db: Db; ids: Record<string, number>; scanId: number } {
  const db = openDb(":memory:");
  const scanId = createScan(db, "initial", shelf, null);
  const insert = db.prepare(`
    INSERT INTO products (scan_id, name, description, category, price_usd, frame_path, status, on_shelf, last_seen_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)
  `);
  const ids: Record<string, number> = {};
  const now = new Date().toISOString();
  for (const p of products) {
    const { lastInsertRowid } = insert.run(
      scanId, p.name, p.description ?? "", p.category ?? "", p.price, `frames/1/${p.name}.jpg`, p.onShelf === false ? 0 : 1, now, now,
    );
    ids[p.name] = Number(lastInsertRowid);
  }
  return { db, ids, scanId };
}
