import { describe, expect, it } from "vitest";
import { getProduct, placeHold, searchCatalog } from "../lib/catalog";
import { seededDb } from "./helpers";

const SHELF = [
  { name: "Golden Gate history mug", price: 18, category: "Mugs", description: "Vintage 1937 opening-day illustration and a short SF history." },
  { name: "SF history postcard set", price: 12, category: "Postcards", description: "Vintage-style postcards of historic San Francisco." },
  { name: "1906 Earthquake photo history book", price: 32, category: "Books", description: "Photo history of the 1906 earthquake." },
  { name: "Sea lion plush", price: 15, category: "Toys", description: "Soft plush for kids." },
  { name: "Alcatraz tote", price: null, category: "Bags", description: "Canvas tote." },
];

describe("searchCatalog", () => {
  it("ranks keyword matches first and enforces the budget", () => {
    const { db } = seededDb(SHELF);
    const { results } = searchCatalog(db, { query: "gift for my mom who loves SF history", max_price_usd: 25 });
    const names = results.map((r) => r.name);
    expect(names.slice(0, 2).sort()).toEqual(["Golden Gate history mug", "SF history postcard set"]);
    expect(names).not.toContain("1906 Earthquake photo history book"); // over budget
    expect(names).not.toContain("Alcatraz tote"); // no price, can't promise it fits
  });

  it("returns gone products flagged and ranks the on-shelf alternative first", () => {
    const { db } = seededDb(SHELF.map((p) => ({ ...p, onShelf: p.name !== "Golden Gate history mug" })));
    const { results } = searchCatalog(db, { query: "SF history", max_price_usd: 25 });
    const mug = results.find((r) => r.name === "Golden Gate history mug")!;
    expect(mug).toMatchObject({ on_shelf: false, gone_from_shelf_since: "just now" });
    expect(results[0].name).toBe("SF history postcard set");
    expect(results[0].last_seen).toBe("just now");
  });

  it("excludes pending products", () => {
    const { db, ids } = seededDb(SHELF);
    db.prepare("UPDATE products SET status = 'pending' WHERE id = ?").run(ids["Sea lion plush"]);
    expect(searchCatalog(db, { query: "plush" }).results.map((r) => r.name)).not.toContain("Sea lion plush");
  });
});

describe("placeHold", () => {
  it("records a hold for an on-shelf product", () => {
    const { db, ids } = seededDb(SHELF);
    const hold = placeHold(db, { product_id: ids["Golden Gate history mug"], customer_name: "Alex", until_time: "6 PM" });
    expect(hold.confirmation).toContain("held for Alex until 6 PM");
    expect(db.prepare("SELECT COUNT(*) AS n FROM holds").get()).toEqual({ n: 1 });
  });

  it("refuses a product that is no longer on the shelf", () => {
    const { db, ids } = seededDb(SHELF.map((p) => ({ ...p, onShelf: false })));
    expect(() => placeHold(db, { product_id: ids["Golden Gate history mug"], customer_name: "Sam", until_time: "6 PM" })).toThrow(
      /no longer on the shelf/,
    );
  });
});

describe("getProduct", () => {
  it("returns one approved product and rejects unknown ids", () => {
    const { db, ids } = seededDb(SHELF);
    expect(getProduct(db, ids["Sea lion plush"]).price_usd).toBe(15);
    expect(() => getProduct(db, 9999)).toThrow();
  });
});
