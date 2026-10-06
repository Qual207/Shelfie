import { readFileSync } from "node:fs";
import path from "node:path";
import type { ScannedProduct } from "./catalog";
import { DATA_DIR } from "./db";
import { FRAMES_PER_PAGE } from "./sampling";
import { askJson, ensureAgent, type AgentSpec, type ToolHandler } from "./zoowork";

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
      description: `Returns the images for the current task in order, ${FRAMES_PER_PAGE} per page. Call it with page 0, then 1, and so on, until you have seen every image the task mentions.`,
      input_schema: {
        type: "object",
        properties: { page: { type: "integer", description: "0 for the first images, 1 for the next, …" } },
      },
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
  return `These frames are from one continuous video of a small store's shelves: ${frameCount} frames, numbered 0 to ${frameCount - 1} in the order returned. To see them all, ${pagesHint(frameCount)}.
List every DISTINCT product. The camera moves, so the same product shows up in several frames: list it ONCE, with the frame where it is clearest. Never list the same item twice under different names.
For each, write a short shopper-facing description (what it is, material, design, who it suits).
${PRODUCT_RULES}
Return JSON only, in this shape: {"products":[${PRODUCT_FORMAT}]}`;
}

function rescanPrompt(frameCount: number, catalog: CatalogEntry[]): string {
  return `Here is the store's current catalog for one shelf, and new frames of that same shelf. There are ${frameCount} new frames, numbered 0 to ${frameCount - 1}; to see them all, ${pagesHint(frameCount)}.
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

/** How to page through n images, for the prompt: "call get_frames with page 0 (images 0-11) and page 1 (12-19)". */
export function pagesHint(n: number, tool = "get_frames"): string {
  const pages = Math.ceil(n / FRAMES_PER_PAGE);
  if (pages <= 1) return `call ${tool} once (page 0)`;
  const parts = Array.from({ length: pages }, (_, p) => `page ${p} (images ${p * FRAMES_PER_PAGE}-${Math.min(n, (p + 1) * FRAMES_PER_PAGE) - 1})`);
  return `call ${tool} with ${parts.join(", ")}`;
}

/** A custom-tool handler that returns these images (paths relative to data/) in order, one page per call. */
export function imageTool(toolName: string, files: string[]): ToolHandler {
  return async (name, input) => {
    if (name !== toolName) throw new Error(`Unknown tool ${name}`);
    const page = Number.isInteger(input.page) ? (input.page as number) : 0;
    const slice = files.slice(page * FRAMES_PER_PAGE, (page + 1) * FRAMES_PER_PAGE);
    if (slice.length === 0) return [{ type: "text" as const, text: `There are only ${files.length} images; page ${page} is empty.` }];
    return slice.map((file) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: file.endsWith(".png") ? ("image/png" as const) : ("image/jpeg" as const),
        data: readFileSync(path.join(DATA_DIR, file)).toString("base64"),
      },
    }));
  };
}

const framesTool = (frames: string[]) => imageTool("get_frames", frames);

/** One JSON turn on the vision agent (Sonnet). Images reach it through the get_frames tool. */
export async function askVision(prompt: string, onTool?: ToolHandler) {
  return askJson(await visionAgentId(), prompt, onTool);
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
  const { value, raw } = await askVision(scanPrompt(frames.length), framesTool(frames));
  return { products: normalizeScan(value, frames.length), raw };
}

export async function rescanFrames(
  frames: string[],
  catalog: CatalogEntry[],
): Promise<{ result: RescanResult; raw: string }> {
  const { value, raw } = await askVision(rescanPrompt(frames.length, catalog), framesTool(frames));
  return { result: normalizeRescan(value, frames.length, catalog.map((c) => c.id)), raw };
}

/** Maps a spoken phrase like "the Alcatraz tote is twenty-two" to one unpriced product. */
export async function matchSpokenPrice(
  transcript: string,
  unpriced: { id: number; name: string }[],
): Promise<{ product_id: number | null; price_usd: number | null }> {
  const { value } = await askVision(
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
