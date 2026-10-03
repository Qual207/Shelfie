import { describe, expect, it } from "vitest";
import { listProducts } from "../lib/catalog";
import { applyRescan, computeDiff, createScan, rescanDiff, shelfCatalog } from "../lib/scans";
import { normalizeRescan, normalizeScan } from "../lib/vision";
import { seededDb } from "./helpers";

const SHELF = [
  { name: "Golden Gate history mug", price: 18 },
  { name: "SF history postcard set", price: 12 },
  { name: "Cable car magnet", price: 6 },
];

const newProduct = {
  name: "Alcatraz enamel mug",
  description: "Enamel camp mug.",
  category: "Mugs",
  price_usd: 22,
  location: "right",
  best_frame: 1,
  confidence: 0.9,
};

describe("normalizeScan / normalizeRescan", () => {
  it("cleans model output: drops nameless items, clamps fields, keeps missing prices null", () => {
    const products = normalizeScan(
      {
        products: [
          { name: " Mug ", price_usd: "$12.99", best_frame: 40, confidence: 3 },
          { name: "Tote", price_usd: null, best_frame: 2 },
          { description: "no name" },
        ],
      },
      10,
    );
    expect(products).toEqual([
      { name: "Mug", description: "", category: "", price_usd: 12.99, location: "", best_frame: 0, confidence: 1 },
      { name: "Tote", description: "", category: "", price_usd: null, location: "", best_frame: 2, confidence: 0.5 },
    ]);
  });

  it("keeps only updates for catalog ids", () => {
    const result = normalizeRescan(
      { updates: [{ id: 1, status: "not_seen" }, { id: "2", status: "seen" }, { id: 99, status: "seen" }], new_products: [newProduct] },
      5,
      [1, 2],
    );
    expect(result.updates).toEqual([{ id: 1, status: "not_seen" }, { id: 2, status: "seen" }]);
    expect(result.new_products).toHaveLength(1);
  });
});

describe("rescan diff and apply", () => {
  function setup() {
    const { db, ids } = seededDb(SHELF);
    // A product on another shelf must never be touched by a mini-shelf rescan.
    const otherScan = createScan(db, "initial", "Store shelves", null);
    db.prepare(
      "INSERT INTO products (scan_id, name, status, on_shelf, last_seen_at, created_at) VALUES (?, 'Fog City hoodie', 'approved', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
    ).run(otherScan);
    const rescanId = createScan(db, "rescan", "Mini shelf", null);
    const result = {
      updates: [
        { id: ids["Golden Gate history mug"], status: "not_seen" as const },
        { id: ids["SF history postcard set"], status: "seen" as const },
        { id: ids["Cable car magnet"], status: "seen" as const },
      ],
      new_products: [newProduct],
    };
    db.prepare("UPDATE scans SET frames_json = ?, raw_result_json = ? WHERE id = ?").run(
      JSON.stringify(["frames/9/frame-00.jpg", "frames/9/frame-01.jpg"]), JSON.stringify(result), rescanId,
    );
    return { db, ids, rescanId, result };
  }

  it("scopes the catalog to the rescanned shelf", () => {
    const { db } = setup();
    expect(shelfCatalog(db, "Mini shelf").map((p) => p.name)).toEqual(SHELF.map((p) => p.name));
  });

  it("shows the removed mug as gone and the new item as new", () => {
    const { db, result } = setup();
    const diff = computeDiff(shelfCatalog(db, "Mini shelf"), result, ["frames/9/frame-00.jpg", "frames/9/frame-01.jpg"]);
    expect(diff.gone.map((g) => g.name)).toEqual(["Golden Gate history mug"]);
    expect(diff.seen).toBe(2);
    expect(diff.new_products[0]).toMatchObject({ name: "Alcatraz enamel mug", frame_path: "frames/9/frame-01.jpg" });
  });

  it("applies: gone off the shelf, seen refreshed, new pending, other shelves untouched", () => {
    const { db, ids, rescanId } = setup();
    applyRescan(db, rescanId);
    const byName = Object.fromEntries(listProducts(db).map((p) => [p.name, p]));
    const rescanAt = (db.prepare("SELECT created_at FROM scans WHERE id = ?").get(rescanId) as { created_at: string }).created_at;
    expect(byName["Golden Gate history mug"]).toMatchObject({ on_shelf: 0, off_shelf_at: rescanAt });
    expect(byName["SF history postcard set"].on_shelf).toBe(1);
    expect(byName["Alcatraz enamel mug"]).toMatchObject({ status: "pending", on_shelf: 1, price_source: "tag" });
    expect(byName["Fog City hoodie"]).toMatchObject({ on_shelf: 1, last_seen_at: "2026-01-01T00:00:00Z" });
    expect(ids["Golden Gate history mug"]).toBeGreaterThan(0);
    expect(() => applyRescan(db, rescanId)).toThrow(/already applied/);
  });

  it("recomputes a stored rescan's diff against the current catalog", () => {
    const { db, rescanId } = setup();
    const scan = db.prepare("SELECT * FROM scans WHERE id = ?").get(rescanId) as Parameters<typeof rescanDiff>[1];
    expect(rescanDiff(db, scan)?.gone).toHaveLength(1);
  });
});
