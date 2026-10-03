import { readFileSync } from "node:fs";
import path from "node:path";
import type { ScannedProduct } from "./catalog";
import { DATA_DIR } from "./db";
import { parseModelJson } from "./json";
import { ensureAgent, runTurn, type AgentSpec, type SessionState, type ToolHandler } from "./zoowork";

// Vision runs on a ZooWork agent: the frames reach the model as base64 images in the result of
// the get_frames custom tool (verified by scripts/test-zoowork.ts on the Anthropic model path).
const VISION_AGENT: AgentSpec = {
  role: "vision",
  name: "shelfie-vision",
  model: "litellm/claude-sonnet-5-5",
  instructions:
    "You are Shelfie's back-office assistant for small stores. You read shelf photos and " +
    "turn what store owners say into data. When a task asks for JSON, reply with that JSON " +
    "object only: no prose, no code fences.",
  tools: [
    {
      name: "get_frames",
      description: "Returns the frames of the current shelf video as images, frame 0 first.",
      input_schema: { type: "object", properties: {} },
      timeoutMs: 60_000,
    },
  ],
};

const globalForVision = globalThis as unknown as { visionAgent?: Promise<string> };

function visionAgentId(): Promise<string> {
  globalForVision.visionAgent ??= ensureAgent(VISION_AGENT).catch((err) => {
    globalForVision.visionAgent = undefined;
    throw err;
  });
  return globalForVision.visionAgent;
}

// Placeholders rather than a sample product, so the model is not primed to "see" it.
const PRODUCT_FORMAT = `{"name":"<name>","description":"<description>","category":"<category>","price_usd":<number or null>,"location":"<location>","best_frame":<frame number>,"confidence":<0 to 1>}`;

const PRODUCT_RULES = `- name: specific and recognizable, as a shopper would say it.
- description: one or two sentences for shoppers: what it is, material, design, who it suits.
- category: one or two words, e.g. Mugs, Postcards, Magnets, Apparel, Bags, Books, Toys, Home decor, Snacks.
- price_usd: only a price you can read on a tag or sign for that product, otherwise null. Never guess prices.
- location: where it sits, e.g. "middle shelf, right".
- best_frame: the frame number where the product is clearest.
- confidence: 0 to 1, how sure you are this is a real, distinct product.`;

function scanPrompt(frameCount: number): string {
  return `These frames are from one continuous video of a small store's shelves. Call get_frames to see them: ${frameCount} frames, numbered 0 to ${frameCount - 1} in the order returned.
List every DISTINCT product. The same product in several frames is ONE product.
For each, write a short shopper-facing description (what it is, material, design, who it suits).
${PRODUCT_RULES}
Return JSON only, in this shape: {"products":[${PRODUCT_FORMAT}]}`;
}

function rescanPrompt(frameCount: number, catalog: CatalogEntry[]): string {
  return `Here is the store's current catalog for one shelf, and new frames of that same shelf. Call get_frames to see the ${frameCount} new frames, numbered 0 to ${frameCount - 1}.
For each catalog product, return whether it appears in the new frames: "seen" or "not_seen". Use not_seen only when the product is absent from every frame.
Then list any NEW products that are not in the catalog, in the scan format below. Never list a catalog product as new.
${PRODUCT_RULES}
Return JSON only, in this shape: {"updates":[{"id":<catalog id>,"status":"seen" or "not_seen"}],"new_products":[${PRODUCT_FORMAT}]}
Catalog: ${JSON.stringify(catalog)}`;
}

export interface CatalogEntry {
  id: number;
  name: string;
  description: string;
  location: string;
}

export interface RescanResult {
  updates: { id: number; status: "seen" | "not_seen" }[];
  new_products: ScannedProduct[];
}

function framesTool(frames: string[]): ToolHandler {
  return async (name) => {
    if (name !== "get_frames") throw new Error(`Unknown tool ${name}`);
    return frames.map((frame) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: "image/jpeg" as const,
        data: readFileSync(path.join(DATA_DIR, frame)).toString("base64"),
      },
    }));
  };
}

/** One vision turn in a fresh session; on unparseable output, asks once more in the same session. */
async function askJson(prompt: string, onTool?: ToolHandler): Promise<{ value: unknown; raw: string }> {
  const agentId = await visionAgentId();
  const session: SessionState = {};
  const raw = await runTurn(agentId, session, prompt, onTool);
  try {
    return { value: parseModelJson(raw), raw };
  } catch {
    const retry = await runTurn(
      agentId,
      session,
      "Your last reply was not valid JSON. Reply again with only the JSON object.",
      onTool,
    );
    return { value: parseModelJson(retry), raw: retry };
  }
}

function toScannedProduct(value: unknown, frameCount: number): ScannedProduct | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const name = typeof v.name === "string" ? v.name.trim() : "";
  if (!name) return null;
  const rawPrice = typeof v.price_usd === "string" ? Number(v.price_usd.replace(/[$,\s]/g, "")) : v.price_usd;
  const price = typeof rawPrice === "number" && rawPrice > 0 ? Math.round(rawPrice * 100) / 100 : null;
  const frame = Number.isInteger(v.best_frame) ? (v.best_frame as number) : 0;
  const confidence = typeof v.confidence === "number" ? Math.min(1, Math.max(0, v.confidence)) : 0.5;
  return {
    name,
    description: typeof v.description === "string" ? v.description.trim() : "",
    category: typeof v.category === "string" ? v.category.trim() : "",
    price_usd: price,
    location: typeof v.location === "string" ? v.location.trim() : "",
    best_frame: frame >= 0 && frame < frameCount ? frame : 0,
    confidence,
  };
}

export function normalizeScan(value: unknown, frameCount: number): ScannedProduct[] {
  const list = (value as { products?: unknown })?.products;
  if (!Array.isArray(list)) throw new Error("Vision reply has no products list");
  return list.map((p) => toScannedProduct(p, frameCount)).filter((p): p is ScannedProduct => p !== null);
}

export function normalizeRescan(value: unknown, frameCount: number, catalogIds: number[]): RescanResult {
  const v = (value ?? {}) as { updates?: unknown; new_products?: unknown };
  if (!Array.isArray(v.updates)) throw new Error("Vision reply has no updates list");
  const updates: RescanResult["updates"] = [];
  for (const u of v.updates as { id?: unknown; status?: unknown }[]) {
    const id = Number(u?.id);
    if (catalogIds.includes(id)) updates.push({ id, status: u.status === "not_seen" ? "not_seen" : "seen" });
  }
  const newProducts = Array.isArray(v.new_products)
    ? v.new_products.map((p) => toScannedProduct(p, frameCount)).filter((p): p is ScannedProduct => p !== null)
    : [];
  return { updates, new_products: newProducts };
}

export async function scanFrames(frames: string[]): Promise<{ products: ScannedProduct[]; raw: string }> {
  const { value, raw } = await askJson(scanPrompt(frames.length), framesTool(frames));
  return { products: normalizeScan(value, frames.length), raw };
}

export async function rescanFrames(
  frames: string[],
  catalog: CatalogEntry[],
): Promise<{ result: RescanResult; raw: string }> {
  const { value, raw } = await askJson(rescanPrompt(frames.length, catalog), framesTool(frames));
  return { result: normalizeRescan(value, frames.length, catalog.map((c) => c.id)), raw };
}

/** Maps a spoken phrase like "the Alcatraz tote is twenty-two" to one unpriced product. */
export async function matchSpokenPrice(
  transcript: string,
  unpriced: { id: number; name: string }[],
): Promise<{ product_id: number | null; price_usd: number | null }> {
  const { value } = await askJson(
    `A store owner said: "${transcript}"
They were giving the price of one of these products, which have no price yet: ${JSON.stringify(unpriced)}
Which product did they mean, and what price in US dollars? Spoken numbers like "twenty-two" mean 22; "twelve ninety-nine" means 12.99.
Return JSON only: {"product_id": <id from the list, or null if unclear>, "price_usd": <number, or null if unclear>}`,
  );
  const v = (value ?? {}) as { product_id?: unknown; price_usd?: unknown };
  const id = Number(v.product_id);
  const price = Number(v.price_usd);
  return {
    product_id: unpriced.some((p) => p.id === id) ? id : null,
    price_usd: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null,
  };
}
