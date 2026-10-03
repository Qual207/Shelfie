import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { DATA_DIR, type Db } from "./db";
import { imageTool } from "./vision";
import { askJson, ensureAgent, type AgentSpec } from "./zoowork";

const run = promisify(execFile);

// Object detection on ZooWork's image model: Gemini returns box_2d boxes natively.
const IMAGING_AGENT: AgentSpec = {
  role: "imaging",
  name: "shelfie-imaging",
  model: "litellm/gemini-3-flash-preview",
  instructions:
    "You locate products in store shelf photos and return bounding boxes. " +
    "Reply with the requested JSON object only: no prose, no code fences.",
  tools: [
    {
      name: "get_images",
      description: "Returns the photo for the current task.",
      input_schema: { type: "object", properties: {} },
      timeoutMs: 60_000,
    },
  ],
};

const globalForImaging = globalThis as unknown as { imagingAgent?: Promise<string>; cropping?: Promise<void> };

function imagingAgentId(): Promise<string> {
  globalForImaging.imagingAgent ??= ensureAgent(IMAGING_AGENT).catch((err) => {
    globalForImaging.imagingAgent = undefined;
    throw err;
  });
  return globalForImaging.imagingAgent;
}

type Box = [number, number, number, number]; // ymin, xmin, ymax, xmax on a 0-1000 scale

/** Valid box → crop rectangle as fractions of the frame, padded a little and clamped. */
export function cropRect(box: unknown, pad = 0.06): { x: number; y: number; w: number; h: number } | null {
  if (!Array.isArray(box) || box.length !== 4 || !box.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return null;
  }
  const [ymin, xmin, ymax, xmax] = (box as Box).map((n) => Math.min(1000, Math.max(0, n)) / 1000);
  if (xmax - xmin < 0.02 || ymax - ymin < 0.02) return null;
  const px = (xmax - xmin) * pad;
  const py = (ymax - ymin) * pad;
  const x = Math.max(0, xmin - px);
  const y = Math.max(0, ymin - py);
  return { x, y, w: Math.min(1, xmax + px) - x, h: Math.min(1, ymax + py) - y };
}

async function detect(frame: string, products: { id: number; name: string; location: string }[]) {
  const { value } = await askJson(
    await imagingAgentId(),
    `Call get_images to see one photo of a store shelf. Find each of these products in it: ${JSON.stringify(products)}
For each one you can see, give a tight bounding box around the whole product (a group of the same item counts as one box).
Return JSON only: {"boxes":[{"id":<product id>,"box_2d":[ymin,xmin,ymax,xmax]}]} with coordinates from 0 to 1000. Leave out products you cannot see.`,
    imageTool("get_images", [frame]),
  );
  const boxes = (value as { boxes?: unknown })?.boxes;
  return Array.isArray(boxes) ? (boxes as { id?: unknown; box_2d?: unknown }[]) : [];
}

async function cropFrame(db: Db, frame: string, products: { id: number; name: string; location: string }[]) {
  const dir = path.join(DATA_DIR, "products");
  mkdirSync(dir, { recursive: true });
  const update = db.prepare("UPDATE products SET crop_path = ? WHERE id = ?");
  for (const { id, box_2d } of await detect(frame, products)) {
    const rect = cropRect(box_2d);
    if (!rect || !products.some((p) => p.id === id)) continue;
    const out = `products/${id}.jpg`;
    await run("ffmpeg", [
      "-v", "error", "-y", "-i", path.join(DATA_DIR, frame),
      "-vf", `crop=iw*${rect.w}:ih*${rect.h}:iw*${rect.x}:ih*${rect.y},scale='min(640,iw)':-2`,
      "-q:v", "3", path.join(DATA_DIR, out),
    ]);
    update.run(out, id);
  }
}

/** Crops every product that has a video frame but no crop yet. Never throws; one run at a time. */
export function cropPendingProducts(db: Db): Promise<void> {
  globalForImaging.cropping ??= (async () => {
    const products = db
      .prepare("SELECT id, name, location, frame_path FROM products WHERE frame_path IS NOT NULL AND crop_path IS NULL")
      .all() as { id: number; name: string; location: string; frame_path: string }[];
    const byFrame = Map.groupBy(products, (p) => p.frame_path);
    await Promise.all(
      [...byFrame].map(([frame, items]) =>
        cropFrame(db, frame, items).catch((err) => console.error(`Cropping ${frame} failed:`, err)),
      ),
    );
  })().finally(() => {
    globalForImaging.cropping = undefined;
  });
  return globalForImaging.cropping;
}
