import { describe, expect, it } from "vitest";
import { cropRect } from "../lib/imaging";

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
