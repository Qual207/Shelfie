import { describe, expect, it } from "vitest";
import { computeAnalytics } from "../lib/analytics";
import { placeHold } from "../lib/catalog";
import { logMessage, logSearch } from "../lib/history";
import { normalizeReport } from "../lib/insights";
import { seededDb } from "./helpers";

const SHELF = [
  { name: "Golden Gate history mug", price: 18 },
  { name: "SF history postcard set", price: 12 },
  { name: "Sea lion plush", price: 15 },
];

const BASE = Date.parse("2026-10-03T10:00:00.000Z");
const at = (s: number) => new Date(BASE + s * 1000).toISOString();

function say(db: ReturnType<typeof seededDb>["db"], room: string, from: "requester" | "shopper" | "store", to: "requester" | "shopper" | "store", text: string, at: string) {
  logMessage(db, { room, from, to, sender: from, text }, at);
}

describe("computeAnalytics", () => {
  it("turns logged conversations into outcomes, product stats and unmet demand", () => {
    const { db, ids } = seededDb(SHELF);

    // Request 1: store offers mug + postcards, shopper picks the mug, hold placed.
    say(db, "r1", "requester", "shopper", "Gift for my mom, loves SF history, under $25", at(0));
    say(db, "r1", "shopper", "store", "Looking for an SF history gift under $25.", at(2));
    say(db, "r1", "store", "shopper", "1. Golden Gate history mug $18 2. SF history postcard set $12", at(8));
    say(db, "r1", "shopper", "store", "Please hold the Golden Gate history mug for Alex.", at(10));
    placeHold(db, { product_id: ids["Golden Gate history mug"], customer_name: "Alex", until_time: "6 PM" });
    db.prepare("UPDATE holds SET created_at = ?").run(at(11)); // placeHold stamps the real clock
    say(db, "r1", "store", "shopper", "Held the Golden Gate history mug for Alex.", at(14));
    say(db, "r1", "shopper", "requester", "Got the mug for $18.", at(16));

    // Request 2: nothing fits, shopper reports back, no hold.
    say(db, "r1", "requester", "shopper", "Something with dinosaurs under $10", at(3600));
    say(db, "r1", "shopper", "store", "Dinosaur item under $10?", at(3602));
    say(db, "r1", "store", "shopper", "Nothing like that on the shelf.", at(3605));
    say(db, "r1", "shopper", "requester", "The store has no dinosaur items.", at(3607));
    logSearch(db, { query: "dinosaur", max_price_usd: 10, matches: 0, productIds: [] });
    logSearch(db, { query: "SF history gift", max_price_usd: 25, matches: 2, productIds: [] });

    const a = computeAnalytics(db);
    expect(a.kpis).toMatchObject({ requests: 2, held: 1, no_sale: 1, in_progress: 0, hold_rate: 0.5 });
    expect(a.kpis.held_value_usd).toBe(18);
    expect(a.kpis.avg_store_reply_s).toBeCloseTo((6 + 4 + 3) / 3);

    const mug = a.products.find((p) => p.name === "Golden Gate history mug")!;
    const cards = a.products.find((p) => p.name === "SF history postcard set")!;
    expect(mug).toMatchObject({ recommended: 1, held: 1 });
    expect(cards.outranked_by).toEqual({ "Golden Gate history mug": 1 });

    expect(a.unmet).toEqual([{ query: "dinosaur", count: 1, max_price_usd: 10 }]);
    expect(a.budgets.find((b) => b.label === "$10–19")).toMatchObject({ demand: 1, catalog: 3 });
  });

  it("is empty-safe", () => {
    const { db } = seededDb(SHELF);
    expect(computeAnalytics(db).kpis).toMatchObject({ requests: 0, hold_rate: null });
  });
});

describe("normalizeReport", () => {
  it("keeps well-formed items and defaults the rest", () => {
    const r = normalizeReport({
      headline: " Mugs win ",
      went_well: [{ title: "Mug sells", detail: "d", evidence: "e" }, { detail: "no title" }],
      recommendations: [{ action: "Restock mugs", why: "w", impact: "bogus" }],
    });
    expect(r.headline).toBe("Mugs win");
    expect(r.went_well).toHaveLength(1);
    expect(r.lost_sales).toEqual([]);
    expect(r.recommendations[0].impact).toBe("medium");
  });
  it("rejects a reply with no headline", () => {
    expect(() => normalizeReport({})).toThrow();
  });
});
