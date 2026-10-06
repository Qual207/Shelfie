import { describe, expect, it } from "vitest";
import { applyVerdict, cropRect, normalizeDuplicates, normalizeName, normalizeVerdict, pickKeeper, unionGroups } from "../lib/imaging";

describe("cropRect", () => {
  it("converts a 0-1000 box to padded fractions", () => {
    const r = cropRect([200, 100, 600, 500], 0)!;
    expect(r.x).toBeCloseTo(0.1);
    expect(r.y).toBeCloseTo(0.2);
    expect(r.w).toBeCloseTo(0.4);
    expect(r.h).toBeCloseTo(0.4);
  });

  it("pads and clamps to the frame", () => {
    const r = cropRect([0, 0, 1000, 500], 0.1)!;
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.h).toBe(1);
    expect(r.w).toBeCloseTo(0.55);
  });

  it("rejects malformed or tiny boxes", () => {
    expect(cropRect("nope")).toBeNull();
    expect(cropRect([1, 2, 3])).toBeNull();
    expect(cropRect([500, 500, 505, 505])).toBeNull();
  });
});

describe("photo check", () => {
  const product = { name: "Folded White Graphic T-Shirts", description: "Graphic tees.", category: "Apparel", crop_path: "products/1.jpg" };
  const corrected = normalizeVerdict({
    status: "corrected",
    name: "Folded Cream Shirts",
    description: "A stack of folded cream shirts.",
    category: "Apparel",
    note: "No graphic is visible.",
  });

  it("rejects replies without a valid status and maps older statuses", () => {
    expect(() => normalizeVerdict({ status: "maybe" })).toThrow();
    expect(normalizeVerdict({ status: "not_product" }).status).toBe("no_match");
    expect(normalizeVerdict({ status: "relabel" }).status).toBe("corrected");
    expect(normalizeVerdict({ status: "verified", licensed: true }).licensed).toBe(true);
    expect(normalizeVerdict({ status: "verified", licensed: "yes" }).licensed).toBe(false);
  });

  it("relabels a wrong listing, approved or not, without a warning", () => {
    const patch = applyVerdict(product, corrected, null);
    expect(patch).toMatchObject({ name: "Folded Cream Shirts", description: "A stack of folded cream shirts.", crop_path: "products/1.jpg" });
    expect(patch.check_note).toContain("Renamed from “Folded White Graphic T-Shirts”");
  });

  it("removes the photo when it doesn't show the product", () => {
    const patch = applyVerdict(product, normalizeVerdict({ status: "no_match" }), { path: "products/1-retouched.jpg", faithful: true, note: "" });
    expect(patch).toMatchObject({ name: product.name, crop_path: null, image_path: null, check_status: "no_match" });
  });

  it("shows a retouch only when the compare step found it faithful", () => {
    const verified = normalizeVerdict({ status: "verified" });
    expect(applyVerdict(product, verified, { path: "products/1-retouched.jpg", faithful: true, note: "" }).image_path).toBe("products/1-retouched.jpg");
    const rejected = applyVerdict(product, verified, { path: "products/1-retouched.jpg", faithful: false, note: "It invented a logo." });
    expect(rejected.image_path).toBeNull();
    expect(rejected.crop_path).toBe("products/1.jpg");
  });
});

describe("duplicate listings", () => {
  const item = (id: number, extra: Partial<Parameters<typeof pickKeeper>[0][number]> = {}) => ({
    id, name: `Item ${id}`, description: "", status: "pending" as const, price_usd: null, crop_path: null, image_path: null, ...extra,
  });

  it("keeps the approved, priced listing with the best photo", () => {
    expect(pickKeeper([item(1), item(2, { status: "approved" }), item(3, { image_path: "x.jpg" })]).id).toBe(2);
    expect(pickKeeper([item(4, { crop_path: "a.jpg" }), item(5, { price_usd: 12 })]).id).toBe(5);
    expect(pickKeeper([item(7), item(6)]).id).toBe(6);
  });

  it("matches names regardless of case and punctuation", () => {
    expect(normalizeName("Yoda Tiki Mug (Green)")).toBe(normalizeName("yoda tiki mug, green"));
    expect(normalizeName("Caps (Left Display)")).not.toBe(normalizeName("Caps (Right Display)"));
  });

  it("cleans model groups and joins overlapping ones", () => {
    expect(normalizeDuplicates({ duplicates: [[1, 2], [2, 3], [9, 4], [5], "x"] }, [1, 2, 3, 4, 5])).toEqual([[1, 2]]);
    expect(unionGroups([[1, 2], [3, 4], [2, 3], [7, 8]]).map((g) => g.sort())).toEqual([[1, 2, 3, 4], [7, 8]]);
  });
});
