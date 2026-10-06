import { readFileSync } from "node:fs";
import path from "node:path";
import { placeHold } from "./catalog";
import { nowIso, type Db } from "./db";
import { logMessage, logSearch, type Role } from "./history";
import { createScan } from "./scans";

export const SAMPLE_CATALOG = path.join(process.cwd(), "fixtures", "seed-catalog.json");

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

/** Replaces the catalog (and its holds and questions) with a JSON fixture. Returns the product count. */
export function seedCatalog(db: Db, file: string = SAMPLE_CATALOG): number {
  const fixture = JSON.parse(readFileSync(file, "utf8")) as Fixture;
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
  return fixture.shelves.reduce((n, s) => n + s.products.length, 0);
}

/**
 * Adds two SAMPLE shopper conversations (one hold, one search with no match) so /insights can be
 * tried without live Band sessions. Invented for testing; never present them as real history.
 */
export function seedSampleConversations(db: Db): void {
  const products = db
    .prepare("SELECT id, name FROM products WHERE status = 'approved' AND on_shelf = 1 ORDER BY id")
    .all() as { id: number; name: string }[];
  if (products.length < 2) throw new Error("Approve at least two products (or load the sample catalog) first.");
  const [first, second] = products;

  let t = Date.now() - 3 * 3_600_000;
  const say = (from: Role, to: Role, text: string) => {
    t += 4000;
    const sender = from === "shopper" ? "shopper-agent" : from === "store" ? "presidio-souvenirs" : "Alex";
    logMessage(db, { room: "sample-1", from, to, sender, text }, new Date(t).toISOString());
  };

  say("requester", "shopper", "Find a gift for my mom who loves SF history, under $25. Hold it for pickup at 6.");
  say("shopper", "store", "Looking for an SF history gift under $25 for a mother. What do you have?");
  logSearch(db, { query: "SF history gift", max_price_usd: 25, matches: 2, productIds: [first.id, second.id] });
  say("store", "shopper", `1. ${first.name}. 2. ${second.name}. Both last seen just now.`);
  say("shopper", "store", `Please hold ${first.name} for Alex until 6 PM.`);
  placeHold(db, { product_id: first.id, customer_name: "Alex", until_time: "6 PM" });
  say("store", "shopper", `${first.name} is held for Alex until 6 PM.`);
  say("shopper", "requester", `I picked ${first.name}: it is an everyday keepsake and fits the budget. Held until 6 PM.`);

  t += 600_000;
  say("requester", "shopper", "Anything with dinosaurs for a 5 year old, under $10?");
  say("shopper", "store", "Dinosaur gift for a 5 year old, under $10?");
  logSearch(db, { query: "dinosaur toy", max_price_usd: 10, matches: 0, productIds: [] });
  say("store", "shopper", "Nothing dinosaur-themed is on the shelf right now.");
  say("shopper", "requester", "The store has nothing for dinosaurs, so I did not buy anything.");
}
