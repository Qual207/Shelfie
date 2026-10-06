import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Product } from "./catalog";
import { DATA_DIR, type Db } from "./db";
import { askVision, imageTool } from "./vision";
import { askJson, downloadPublished, ensureAgent, runTurn, uploadToSandbox, type AgentSpec, type SessionState } from "./zoowork";

// The photo pipeline, per product, after every scan and in the background for older products:
//   1. crop     Gemini (ZooWork) boxes each product in its best frame; ffmpeg cuts it out.
//   2. check    Sonnet looks at the crop: is it one real product, do the name and description match
//               (corrected while still pending, a suggestion once approved), and what text is legible.
//   3. retouch  ZooWork's image_generate rebuilds a sharp, front-on photo from the crop, told the
//               exact legible text so it doesn't invent words.
//   4. compare  Sonnet compares retouch and crop; any change to the object or its text and the
//               retouch is thrown away (image models invent text and logos often).
// PHOTO_RETOUCH=off in .env skips steps 3-4 (the slow, costly part: ~1 min per product).

const run = promisify(execFile);
const MAX_ATTEMPTS = 3;
const RETOUCH_CONCURRENCY = 3;
const BACKOFF_MS = 2 * 60_000; // after a run with failures, wait before trying again

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

// Retouching runs in a ZooWork sandbox: the crop is uploaded as a file, image_generate edits it,
// artifact_publish hands the result back.
const RETOUCH_AGENT: AgentSpec = {
  role: "retouch",
  name: "shelfie-retouch",
  model: "litellm/claude-sonnet-5-5",
  instructions:
    "You retouch product photos for a small shop's online catalog. You always edit the photo you are " +
    "given with image_generate, never draw a different product, and never invent text or logos. " +
    "Publish the result with artifact_publish and reply with the requested JSON only.",
  builtinTools: ["image_generate", "artifact_publish"],
  skills: ["designer"],
  sandbox: true,
};

const globalForImaging = globalThis as unknown as {
  agents?: Map<string, Promise<string>>;
  running?: Promise<void>;
  lastFailureAt?: number;
};

function agentId(spec: AgentSpec): Promise<string> {
  const agents = (globalForImaging.agents ??= new Map());
  if (!agents.has(spec.role)) {
    agents.set(spec.role, ensureAgent(spec).catch((err) => {
      agents.delete(spec.role);
      throw err;
    }));
  }
  return agents.get(spec.role)!;
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

const productsDir = () => {
  const dir = path.join(DATA_DIR, "products");
  mkdirSync(dir, { recursive: true });
  return dir;
};

// ---- 1. crop ----

type Item = Pick<Product, "id" | "name" | "description" | "category" | "location" | "status" | "frame_path" | "crop_path">;

/** Boxes every listed product in one frame and saves the crops. Throws if the detector call fails. */
async function cropFrame(db: Db, frame: string, items: Item[]): Promise<void> {
  const { value } = await askJson(
    await agentId(IMAGING_AGENT),
    `Call get_images to see one photo of a store shelf. Find each of these products in it: ${JSON.stringify(
      items.map(({ id, name, location }) => ({ id, name, location })),
    )}
For each one you can see, give a tight bounding box around the whole product (a group of the same item counts as one box).
Return JSON only: {"boxes":[{"id":<product id>,"box_2d":[ymin,xmin,ymax,xmax]}]} with coordinates from 0 to 1000. Leave out products you cannot see.`,
    imageTool("get_images", [frame]),
  );
  const boxes = (value as { boxes?: unknown })?.boxes;
  const update = db.prepare("UPDATE products SET crop_path = ? WHERE id = ?");
  for (const { id, box_2d } of Array.isArray(boxes) ? (boxes as { id?: unknown; box_2d?: unknown }[]) : []) {
    const rect = cropRect(box_2d);
    const item = items.find((p) => p.id === id);
    if (!rect || !item) continue;
    const out = `products/${item.id}.jpg`;
    await run("ffmpeg", [
      "-v", "error", "-y", "-i", path.join(DATA_DIR, frame),
      "-vf", `crop=iw*${rect.w}:ih*${rect.h}:iw*${rect.x}:ih*${rect.y},scale='min(640,iw)':-2`,
      "-q:v", "3", path.join(productsDir(), `${item.id}.jpg`),
    ]);
    update.run(out, item.id);
    item.crop_path = out;
  }
}

// ---- 3. retouch ----

/** Rebuilds a clean photo from the crop. Returns its path under data/, or throws. */
async function retouchPhoto(p: Item, look: { name: string; description: string; text: string }): Promise<string> {
  const id = await agentId(RETOUCH_AGENT);
  const input = `in/${p.id}.jpg`;
  const output = `out/${p.id}.png`;
  await uploadToSandbox(id, readFileSync(path.join(DATA_DIR, p.crop_path!)), input);

  const session: SessionState = {};
  await runTurn(
    id,
    session,
    `The file ${input} is a small, blurry crop from a shop shelf video. It shows: ${look.name}. ${look.description}
${look.text ? `The only legible text on it is: ${JSON.stringify(look.text)}.` : "No text on it is legible."}
Call image_generate with image "${input}" to make a clean catalog photo of that SAME physical object:
- keep its exact shape, proportions, colors and materials;
- ${look.text ? `render exactly the text ${JSON.stringify(look.text)} where it appears, and no other words, letters or logos` : "add no words, letters or logos"}; where markings are unreadable, show them as plain areas of the same color;
- fix blur, low resolution, perspective and glare, and fill in hidden parts only where the visible parts make them obvious;
- the object alone, centered, front-on, on a plain light grey background, square.
Save it as ${output}, call artifact_publish on ${output}, then reply JSON only: {"path":"${output}"}`,
    undefined,
    300_000,
  );
  const png = await downloadPublished(id, session.sessionId!, output);
  const tmp = path.join(productsDir(), `${p.id}-retouch.png`);
  writeFileSync(tmp, png);
  try {
    await run("ffmpeg", ["-v", "error", "-y", "-i", tmp, "-vf", "scale='min(768,iw)':-2", "-q:v", "3", path.join(productsDir(), `${p.id}-retouched.jpg`)]);
  } finally {
    rmSync(tmp, { force: true });
  }
  return `products/${p.id}-retouched.jpg`;
}

// ---- 2. check, 4. compare ----

export interface PhotoVerdict {
  status: "verified" | "corrected" | "not_product";
  name: string;
  description: string;
  category: string;
  note: string;
  visible_text: string; // text clearly legible on the product, "" if none
}

/** A retouch and whether the compare step found it faithful to the crop. */
export interface Retouch {
  path: string;
  faithful: boolean;
  note: string;
}

export function normalizeVerdict(value: unknown): PhotoVerdict {
  const v = (value ?? {}) as Record<string, unknown>;
  const status = v.status === "corrected" || v.status === "not_product" ? v.status : v.status === "verified" ? "verified" : null;
  if (!status) throw new Error("Photo check reply has no valid status");
  const text = (key: string) => (typeof v[key] === "string" ? (v[key] as string).trim() : "");
  return {
    status,
    name: text("name"),
    description: text("description"),
    category: text("category"),
    note: text("note"),
    visible_text: text("visible_text"),
  };
}

/**
 * What the check changes on the product. Corrections are applied only while the product is
 * pending (the owner still reviews it); approved products keep the owner's text and get a note.
 * A retouch is shown only when the checker confirmed it is the same object.
 */
export function applyVerdict(p: Pick<Product, "name" | "description" | "category" | "status">, v: PhotoVerdict, retouch: Retouch | null) {
  const correct = v.status === "corrected" && p.status === "pending" && v.name !== "";
  let note = v.note;
  if (v.status === "corrected") {
    note = correct
      ? `Corrected from “${p.name}” after a photo check. ${v.note}`.trim()
      : `Suggested name: “${v.name}”. ${v.note}`.trim();
  }
  if (retouch && !retouch.faithful) note = `${note} Retouched photo not used: ${retouch.note || "it changed the product"}`.trim();
  return {
    name: correct ? v.name : p.name,
    description: correct && v.description ? v.description : p.description,
    category: correct && v.category ? v.category : p.category,
    image_path: retouch?.faithful ? retouch.path : null,
    check_status: v.status,
    check_note: note || null,
  };
}

async function check(p: Item): Promise<PhotoVerdict> {
  const { value } = await askVision(
    `Call get_frames to see one image: ${p.crop_path ? "a product cut out of a shop shelf video" : `a whole shelf frame; the product should be at "${p.location}"`}.
The shop's catalog lists it as:
name: ${JSON.stringify(p.name)}
description: ${JSON.stringify(p.description)}
category: ${JSON.stringify(p.category)}

Is it one real, sellable product (not shelving, a sign, a wall, packaging debris, or a jumble of different products)? Do the name and description match what is actually visible?
- "verified": they match.
- "corrected": it is a product, but the name or description is wrong. Give a corrected name, description (1-2 sentences, only what you can see) and category.
- "not_product": no single sellable product is visible.
Also copy any text that is clearly legible on the product, exactly as printed (empty if none or unsure).
Reply JSON only: {"status":"verified|corrected|not_product","name":"","description":"","category":"","note":"<one plain sentence for the shop owner, under 25 words>","visible_text":""}`,
    imageTool("get_frames", [p.crop_path ?? p.frame_path!]),
  );
  return normalizeVerdict(value);
}

/** Is the retouch the same object as the crop, with no invented or changed text? */
async function compare(crop: string, retouched: string, look: { name: string; text: string }): Promise<Retouch> {
  const { value } = await askVision(
    `Call get_frames to see two images. Image 0 is a real photo of a product (${JSON.stringify(look.name)}) cut from a shop shelf video. Image 1 is an AI retouch meant to show that same object more clearly.
Is image 1 faithful to image 0: the same kind of object, the same shape and colors, and ${look.text ? `the text ${JSON.stringify(look.text)} with no other words or logos added` : "no words, letters or logos that image 0 doesn't clearly show"}? A cleaner background and sharper detail are expected and fine.
Reply JSON only: {"faithful":true,"note":"<what differs, if anything>"}`,
    imageTool("get_frames", [crop, retouched]),
  );
  const v = (value ?? {}) as { faithful?: unknown; note?: unknown };
  return { path: retouched, faithful: v.faithful === true, note: typeof v.note === "string" ? v.note.trim() : "" };
}

// ---- the run ----

async function processOne(db: Db, p: Item): Promise<void> {
  const verdict = await check(p);
  let retouch: Retouch | null = null;
  if (p.crop_path && verdict.status !== "not_product" && process.env.PHOTO_RETOUCH !== "off") {
    // Describe the product as the checker saw it, so a wrong listing doesn't steer the retouch.
    const look = {
      name: verdict.status === "corrected" && verdict.name ? verdict.name : p.name,
      description: verdict.status === "corrected" && verdict.description ? verdict.description : p.description,
      text: verdict.visible_text,
    };
    try {
      retouch = await compare(p.crop_path, await retouchPhoto(p, look), look);
    } catch (err) {
      console.error(`Retouching product ${p.id} failed; keeping the crop:`, err);
    }
  }
  const patch = applyVerdict(p, verdict, retouch);
  if (retouch && !retouch.faithful) rmSync(path.join(DATA_DIR, retouch.path), { force: true });
  db.prepare(
    `UPDATE products SET name = @name, description = @description, category = @category, image_path = @image_path,
       check_status = @check_status, check_note = @check_note, imaged_at = @imaged_at WHERE id = @id`,
  ).run({ ...patch, imaged_at: new Date().toISOString(), id: p.id });
}

async function runPipeline(db: Db): Promise<void> {
  const pending = db
    .prepare(
      `SELECT id, name, description, category, location, status, frame_path, crop_path FROM products
       WHERE frame_path IS NOT NULL AND imaged_at IS NULL AND imaging_attempts < ? ORDER BY id`,
    )
    .all(MAX_ATTEMPTS) as Item[];
  if (pending.length === 0) return;
  console.log(`Photo pipeline: ${pending.length} products`);
  const failed = db.prepare("UPDATE products SET imaging_attempts = imaging_attempts + 1 WHERE id = ?");
  let failures = 0;

  // 1. Crop, one detector call per frame. Products the detector can't find keep the full frame.
  const ready: Item[] = [];
  for (const [frame, items] of Map.groupBy(pending, (p) => p.frame_path!)) {
    const uncropped = items.filter((p) => !p.crop_path);
    try {
      if (uncropped.length) await cropFrame(db, frame, uncropped);
      ready.push(...items);
    } catch (err) {
      console.error(`Cropping ${frame} failed:`, err);
      items.forEach((p) => failed.run(p.id));
      failures++;
    }
  }

  // 2-4. Check, retouch and compare, a few products at a time.
  const queue = [...ready];
  await Promise.all(
    Array.from({ length: RETOUCH_CONCURRENCY }, async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        try {
          await processOne(db, p);
        } catch (err) {
          console.error(`Photo check for product ${p.id} failed:`, err);
          failed.run(p.id);
          failures++;
        }
      }
    }),
  );
  if (failures) globalForImaging.lastFailureAt = Date.now();
  console.log(`Photo pipeline: done${failures ? `, ${failures} failures (retried later, up to ${MAX_ATTEMPTS} times)` : ""}`);
}

/**
 * Crops, retouches and checks every product that hasn't been through the pipeline yet. Safe to
 * call often (the /api/state poll does, so older products catch up): one run at a time, a pause
 * after failures, and each product gives up after MAX_ATTEMPTS failed runs. Never throws.
 */
export function processPendingPhotos(db: Db): Promise<void> {
  if (globalForImaging.running) return globalForImaging.running;
  if (globalForImaging.lastFailureAt && Date.now() - globalForImaging.lastFailureAt < BACKOFF_MS) return Promise.resolve();
  globalForImaging.running = runPipeline(db)
    .catch((err) => console.error("Photo pipeline failed:", err))
    .finally(() => {
      globalForImaging.running = undefined;
    });
  return globalForImaging.running;
}
