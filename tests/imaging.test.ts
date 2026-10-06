import { describe, expect, it } from "vitest";
import { applyVerdict, cropRect, normalizeVerdict } from "../lib/imaging";

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
  const product = { name: "Folded White Graphic T-Shirts", description: "Graphic tees.", category: "Apparel" };
  const corrected = normalizeVerdict({
    status: "corrected",
    name: "Folded Cream Shirts",
    description: "A stack of folded cream shirts.",
    category: "Apparel",
    note: "No graphic is visible.",
    visible_text: "",
  });

  it("rejects replies without a valid status", () => {
    expect(() => normalizeVerdict({ status: "maybe" })).toThrow();
    expect(normalizeVerdict({ status: "verified" })).toMatchObject({ name: "", visible_text: "" });
  });

  it("applies a correction while the product is pending", () => {
    const patch = applyVerdict({ ...product, status: "pending" }, corrected, null);
    expect(patch).toMatchObject({ name: "Folded Cream Shirts", description: "A stack of folded cream shirts.", check_status: "corrected" });
    expect(patch.check_note).toContain("Corrected from “Folded White Graphic T-Shirts”");
  });

  it("only suggests a correction once the owner approved the product", () => {
    const patch = applyVerdict({ ...product, status: "approved" }, corrected, null);
    expect(patch).toMatchObject({ name: product.name, description: product.description });
    expect(patch.check_note).toContain("Suggested name: “Folded Cream Shirts”");
  });

  it("shows a retouch only when the compare step found it faithful", () => {
    const verified = normalizeVerdict({ status: "verified", note: "Matches." });
    const p = { ...product, status: "approved" as const };
    expect(applyVerdict(p, verified, { path: "products/1-retouched.jpg", faithful: true, note: "" }).image_path).toBe("products/1-retouched.jpg");
    const rejected = applyVerdict(p, verified, { path: "products/1-retouched.jpg", faithful: false, note: "It invented a logo." });
    expect(rejected.image_path).toBeNull();
    expect(rejected.check_note).toContain("It invented a logo.");
  });
});
