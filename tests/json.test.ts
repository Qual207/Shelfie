import { describe, expect, it } from "vitest";
import { parseModelJson } from "../lib/json";

describe("parseModelJson", () => {
  it("parses plain JSON", () => {
    expect(parseModelJson('{"products":[]}')).toEqual({ products: [] });
  });

  it("strips code fences and surrounding prose", () => {
    const reply = 'Here you go:\n```json\n{"to":"store","message":"hi"}\n```\nDone.';
    expect(parseModelJson(reply)).toEqual({ to: "store", message: "hi" });
  });

  it("throws when there is no JSON object", () => {
    expect(() => parseModelJson("I could not see any products.")).toThrow();
  });

  it("throws on malformed JSON so the caller can retry", () => {
    expect(() => parseModelJson('{"products": [}')).toThrow();
  });
});
