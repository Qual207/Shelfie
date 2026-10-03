// Replaces the catalog with a JSON fixture, for testing without a store video.
// Usage: pnpm seed [fixture.json]   (default: fixtures/seed-catalog.json)
import { readFileSync } from "node:fs";
import { getDb, nowIso } from "@/lib/db";
import { createScan } from "@/lib/scans";

interface Fixture {
  shelves: {
    shelf: string;
    products: {
      name: string;
      description: string;
      category: string;
      price_usd: number | null;
      location: string;
      status: "pending" | "approved";
    }[];
  }[];
}

const file = process.argv[2] ?? "fixtures/seed-catalog.json";
const fixture = JSON.parse(readFileSync(file, "utf8")) as Fixture;
const db = getDb();
const insert = db.prepare(`
  INSERT INTO products (scan_id, name, description, category, price_usd, price_source, location,
    confidence, status, on_shelf, last_seen_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?)
`);

db.transaction(() => {
  db.exec("DELETE FROM holds; DELETE FROM questions; DELETE FROM products; DELETE FROM scans;");
  for (const { shelf, products } of fixture.shelves) {
    const scanId = createScan(db, "initial", shelf, null);
    for (const p of products) {
      insert.run(
        scanId, p.name, p.description, p.category, p.price_usd, p.price_usd === null ? null : "tag",
        p.location, p.status, nowIso(), nowIso(),
      );
    }
  }
})();

const count = fixture.shelves.reduce((n, s) => n + s.products.length, 0);
console.log(`Seeded ${count} products on ${fixture.shelves.length} shelves from ${file}.`);
