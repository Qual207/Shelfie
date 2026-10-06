import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Product } from "./catalog";
import { DATA_DIR, type Db } from "./db";
import { askVision, imageTool, pagesHint } from "./vision";
import { askJson, downloadPublished, ensureAgent, runTurn, uploadToSandbox, type AgentSpec, type SessionState } from "./zoowork";

// The photo pipeline, per product, after every scan and in the background for older products:
//   1. crop     Gemini (ZooWork) boxes each product in its best frame; ffmpeg cuts it out.
//   2. check    Sonnet looks at the crop. Other items in the picture are fine; what matters is
//               whether the listing matches the product. A wrong listing is relabelled to what the
//               photo shows; a photo that doesn't show the product at all is removed. No warnings.
//   3. retouch  ZooWork's image_generate rebuilds a sharp, front-on photo from the crop, told the
//               exact legible text so it doesn't invent words.
//   4. compare  Sonnet compares retouch and crop; any change to the product or its text and the
//               retouch is thrown away (image models invent text and logos often).
//   5. merge    Listings of the same product on one shelf (same name, or the same item seen in
//               two frames) are merged into one, each pair confirmed photo against photo.
// Licensed merchandise (film characters, brand logos) skips the retouch, since the image provider
// refuses it. When a retouch is skipped, fails or isn't faithful, the card gets the real crop
// sharpened locally instead.
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

type Item = Pick<
  Product,
  "id" | "name" | "description" | "category" | "location" | "status" | "frame_path" | "crop_path" | "image_path"
>;

/** Where a product is in the pipeline, shown on its card while its photo is being worked on. */
export type ImagingStage = "queued" | "cropping" | "checking" | "retouching" | "comparing";

function setStage(db: Db, ids: number[], stage: ImagingStage | null): void {
  const update = db.prepare("UPDATE products SET imaging_stage = ? WHERE id = ?");
  for (const id of ids) update.run(stage, id);
}

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
  // image_generate only accepts absolute /workspace paths.
  const input = `/workspace/in/${p.id}.jpg`;
  const output = `/workspace/out/${p.id}.png`;
  await uploadToSandbox(id, readFileSync(path.join(DATA_DIR, p.crop_path!)), `in/${p.id}.jpg`);

  const session: SessionState = {};
  const reply = await runTurn(
    id,
    session,
    `The file ${input} is a small, blurry crop from a shop shelf video. It shows: ${look.name}. ${look.description}
${look.text ? `The only legible text on it is: ${JSON.stringify(look.text)}.` : "No text on it is legible."}
Call image_generate with image "${input}" to make a clean catalog photo of that SAME product:
- keep its exact shape, proportions, colors and materials; if it is a set or a group of items, keep the same items;
- ${look.text ? `render exactly the text ${JSON.stringify(look.text)} where it appears, and no other words, letters or logos` : "add no words, letters or logos"}; where markings are unreadable, show them as plain areas of the same color;
- fix blur, low resolution, perspective and glare, and fill in hidden parts only where the visible parts make them obvious;
- just the product, centered, front-on, on a plain light grey background, square.
Save it as ${output}, call artifact_publish on ${output}, then reply JSON only: {"path":"${output}"}`,
    undefined,
    300_000,
  );
  // The image provider refuses some products (licensed characters, for one); the reply says why.
  const png = await downloadPublished(id, session.sessionId!, output).catch((err: Error) => {
    throw new Error(`${err.message}. The agent said: ${reply.slice(0, 300)}`);
  });
  const tmp = path.join(productsDir(), `${p.id}-retouch.png`);
  writeFileSync(tmp, png);
  try {
    await run("ffmpeg", ["-v", "error", "-y", "-i", tmp, "-vf", "scale='min(768,iw)':-2", "-q:v", "3", path.join(productsDir(), `${p.id}-retouched.jpg`)]);
  } finally {
    rmSync(tmp, { force: true });
  }
  return `products/${p.id}-retouched.jpg`;
}

/**
 * The fallback when there is no faithful retouch: the real crop, upscaled, denoised and sharpened
 * locally with ffmpeg. Nothing is generated, so nothing can be invented.
 */
async function enhanceCrop(p: Item): Promise<string> {
  const out = `products/${p.id}-enhanced.jpg`;
  await run("ffmpeg", [
    "-v", "error", "-y", "-i", path.join(DATA_DIR, p.crop_path!),
    "-vf", "scale='min(768,iw*2)':-2:flags=lanczos,hqdn3d=1.5:1.5:6:6,unsharp=5:5:0.8:5:5:0",
    "-q:v", "3", path.join(DATA_DIR, out),
  ]);
  return out;
}

// ---- 2. check, 4. compare ----

export interface PhotoVerdict {
  /** verified: listing matches. corrected: relabel with the fields below. no_match: photo doesn't show it. */
  status: "verified" | "corrected" | "no_match";
  name: string;
  description: string;
  category: string;
  note: string; // kept in the database for debugging, never shown as a warning
  visible_text: string; // text clearly legible on the product, "" if none
  /** Licensed characters or a third-party brand: the image provider refuses to retouch these. */
  licensed: boolean;
}

/** A retouch and whether the compare step found it faithful to the crop. */
export interface Retouch {
  path: string;
  faithful: boolean;
  note: string;
}

const STATUS: Record<string, PhotoVerdict["status"]> = {
  verified: "verified",
  corrected: "corrected",
  relabel: "corrected",
  no_match: "no_match",
  not_product: "no_match",
};

export function normalizeVerdict(value: unknown): PhotoVerdict {
  const v = (value ?? {}) as Record<string, unknown>;
  const status = STATUS[String(v.status)];
  if (!status) throw new Error("Photo check reply has no valid status");
  const text = (key: string) => (typeof v[key] === "string" ? (v[key] as string).trim() : "");
  return {
    status,
    name: text("name"),
    description: text("description"),
    category: text("category"),
    note: text("note"),
    visible_text: text("visible_text"),
    licensed: v.licensed === true,
  };
}

/**
 * What the check changes, with no warnings for the owner: a wrong listing is relabelled to what
 * the photo shows, a photo that doesn't show the product is removed, and a retouch is shown only
 * when the compare step found it faithful.
 */
export function applyVerdict(
  p: Pick<Product, "name" | "description" | "category" | "crop_path">,
  v: PhotoVerdict,
  retouch: Retouch | null,
) {
  const relabel = v.status === "corrected" && v.name !== "";
  const noMatch = v.status === "no_match";
  const notes = [
    relabel ? `Renamed from “${p.name}”.` : "",
    v.note,
    retouch && !retouch.faithful ? `Retouch discarded: ${retouch.note || "it changed the product"}` : "",
  ];
  return {
    name: relabel ? v.name : p.name,
    description: relabel && v.description ? v.description : p.description,
    category: relabel && v.category ? v.category : p.category,
    crop_path: noMatch ? null : p.crop_path,
    image_path: !noMatch && retouch?.faithful ? retouch.path : null,
    check_status: v.status,
    check_note: notes.filter(Boolean).join(" ") || null,
  };
}

async function check(p: Item, otherNames: string[]): Promise<PhotoVerdict> {
  const { value } = await askVision(
    `Call get_frames (page 0) to see one image: ${p.crop_path ? "a photo cut out of a shop shelf video around one listed product" : `a whole shelf frame; the product should be at "${p.location}"`}.
Other products, shelving, price tags or packaging in the picture are normal: judge only the listed product.
The shop's catalog lists it as:
name: ${JSON.stringify(p.name)}
description: ${JSON.stringify(p.description)}
category: ${JSON.stringify(p.category)}

- "verified": the listed product is in the photo, and the name and description are accurate.
- "corrected": the photo shows the product, but the listing is wrong about it (a different item, wrong color, details that aren't there). Give the right name (specific, as a shopper would say it), description (1-2 sentences, only what you can see) and category. A listing for a set or group of items is right when the photo shows that group. Other listings on this shelf: ${JSON.stringify(otherNames.slice(0, 80))}. A corrected name must not repeat one of them unless it is truly the same item.
- "no_match": the listed product is not in the photo at all (empty shelf, a wall, a sign, or plainly a different spot).
Also copy any text that is clearly legible on the product, exactly as printed (empty if none or unsure), and say whether it is licensed merchandise: recognizable characters from a film, show or game, or a third-party brand logo.
Reply JSON only: {"status":"verified|corrected|no_match","name":"","description":"","category":"","note":"<one sentence, under 25 words>","visible_text":"","licensed":false}`,
    imageTool("get_frames", [p.crop_path ?? p.frame_path!]),
  );
  return normalizeVerdict(value);
}

/** Is the retouch the same product as the crop, with no invented or changed text? */
async function compare(crop: string, retouched: string, look: { name: string; text: string }): Promise<Retouch> {
  const { value } = await askVision(
    `Call get_frames (page 0) to see two images. Image 0 is a real photo of a product (${JSON.stringify(look.name)}) cut from a shop shelf video. Image 1 is an AI retouch meant to show that same product more clearly.
Is image 1 faithful to image 0: the same kind of item (or the same group of items), the same shape and colors, and ${look.text ? `the text ${JSON.stringify(look.text)} with no other words or logos added` : "no words, letters or logos that image 0 doesn't clearly show"}? A cleaner background and sharper detail are expected and fine.
Reply JSON only: {"faithful":true,"note":"<what differs, if anything>"}`,
    imageTool("get_frames", [crop, retouched]),
  );
  const v = (value ?? {}) as { faithful?: unknown; note?: unknown };
  return { path: retouched, faithful: v.faithful === true, note: typeof v.note === "string" ? v.note.trim() : "" };
}

// ---- 5. merge duplicates ----

type ShelfItem = Pick<Product, "id" | "name" | "description" | "status" | "price_usd" | "crop_path" | "image_path">;

export const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The listing a duplicate group keeps: approved, priced, best photo, then the oldest. */
export function pickKeeper<T extends ShelfItem>(group: T[]): T {
  const score = (p: ShelfItem) =>
    (p.status === "approved" ? 8 : 0) + (p.price_usd !== null ? 4 : 0) + (p.image_path ? 2 : 0) + (p.crop_path ? 1 : 0);
  return [...group].sort((a, b) => score(b) - score(a) || a.id - b.id)[0];
}

/** Cleans the model's groups: known ids only, two or more per group, each id in one group at most. */
export function normalizeDuplicates(value: unknown, ids: number[]): number[][] {
  const groups = (value as { duplicates?: unknown })?.duplicates;
  const used = new Set<number>();
  const out: number[][] = [];
  for (const group of Array.isArray(groups) ? groups : []) {
    if (!Array.isArray(group)) continue;
    const clean = [...new Set(group.map(Number))].filter((id) => ids.includes(id) && !used.has(id));
    if (clean.length < 2) continue;
    clean.forEach((id) => used.add(id));
    out.push(clean);
  }
  return out;
}

/** Same product listed more than once on this shelf? Exact names first, then Sonnet over the photos. */
async function findDuplicates(items: ShelfItem[]): Promise<number[][]> {
  const sameName = [...Map.groupBy(items, (p) => normalizeName(p.name)).values()].filter((g) => g.length > 1);
  const groups = sameName.map((g) => g.map((p) => p.id));
  // Only one listing per exact name goes on to the photo comparison.
  const merged = new Set(sameName.flatMap((g) => g.filter((p) => p.id !== pickKeeper(g).id).map((p) => p.id)));
  const rest = items.filter((p) => !merged.has(p.id));
  if (rest.length < 2) return groups;

  const withPhoto = rest.filter((p) => p.image_path ?? p.crop_path);
  const listing = rest.map((p) => ({
    id: p.id,
    ...(withPhoto.includes(p) ? { image: withPhoto.indexOf(p) } : {}),
    name: p.name,
    description: p.description,
  }));
  const { value } = await askVision(
    `These are the products listed for one shop shelf, read from a video. The camera saw some items more than once, so the same physical product may be listed twice under different names.
There are ${withPhoto.length} product photos; to see them, ${pagesHint(withPhoto.length)}. "image" below is the photo's number.
Listings: ${JSON.stringify(listing)}
Group the listings that are the SAME product: the same item with the same design and color (or the same set, seen again). Different colors, designs, characters or sizes are different products, even when similar. A set and a single item from it are different products.
Reply JSON only: {"duplicates":[[<id>,<id>]]} with only groups of two or more; {"duplicates":[]} if there are none.`,
    imageTool("get_frames", withPhoto.map((p) => (p.image_path ?? p.crop_path)!)),
  );
  return unionGroups([...groups, ...normalizeDuplicates(value, rest.map((p) => p.id))]);
}

/** Joins groups that share a listing, so each product ends up in one group. */
export function unionGroups(groups: number[][]): number[][] {
  const out: Set<number>[] = [];
  for (const group of groups) {
    const overlapping = out.filter((g) => group.some((id) => g.has(id)));
    const joined = new Set([...group, ...overlapping.flatMap((g) => [...g])]);
    for (const g of overlapping) out.splice(out.indexOf(g), 1);
    out.push(joined);
  }
  return out.map((g) => [...g]);
}

/**
 * Final say on a proposed merge: the two photos side by side. Grouped proposals from 30 small crops
 * merge different items too often (two different mugs, two different backpacks), so each pair is
 * confirmed on its own.
 */
async function samePhoto(a: ShelfItem, b: ShelfItem): Promise<boolean> {
  const photo = (p: ShelfItem) => p.image_path ?? p.crop_path;
  if (!photo(a) || !photo(b)) return normalizeName(a.name) === normalizeName(b.name);
  const { value } = await askVision(
    `Call get_frames (page 0) to see two product photos from the same shop shelf video.
Image 0 is listed as ${JSON.stringify(a.name)}; image 1 as ${JSON.stringify(b.name)}.
Are they the very same product, seen twice: the same item with the same design, color, print and character? Answer false if they differ in any of those, even when similar, and false if one shows a group or shelf of several items and the other a single item.
Reply JSON only: {"same":true}`,
    imageTool("get_frames", [photo(a)!, photo(b)!]),
  );
  return (value as { same?: unknown })?.same === true;
}

/** Merges duplicate listings on a shelf into one each: keeps the best, moves holds, keeps a price. */
async function mergeDuplicates(db: Db, shelf: string): Promise<number> {
  const items = db
    .prepare(
      `SELECT p.id, p.name, p.description, p.status, p.price_usd, p.crop_path, p.image_path
       FROM products p JOIN scans s ON s.id = p.scan_id WHERE s.shelf = ? ORDER BY p.id`,
    )
    .all(shelf) as ShelfItem[];
  if (items.length < 2) return 0;
  let removed = 0;
  for (const ids of await findDuplicates(items)) {
    const group = items.filter((p) => ids.includes(p.id));
    const keeper = pickKeeper(group);
    const others: ShelfItem[] = [];
    for (const p of group) if (p.id !== keeper.id && (await samePhoto(keeper, p))) others.push(p);
    if (others.length === 0) continue;
    const price = keeper.price_usd ?? others.find((p) => p.price_usd !== null)?.price_usd ?? null;
    db.transaction(() => {
      if (price !== keeper.price_usd) db.prepare("UPDATE products SET price_usd = ?, price_source = 'tag' WHERE id = ?").run(price, keeper.id);
      for (const p of others) {
        db.prepare("UPDATE holds SET product_id = ? WHERE product_id = ?").run(keeper.id, p.id);
        db.prepare("DELETE FROM products WHERE id = ?").run(p.id);
      }
    })();
    for (const p of others) {
      for (const file of [p.crop_path, p.image_path]) if (file) rmSync(path.join(DATA_DIR, file), { force: true });
    }
    console.log(`Merged ${others.map((p) => `“${p.name}”`).join(", ")} into “${keeper.name}”`);
    removed += others.length;
  }
  return removed;
}

// ---- the run ----

async function processOne(db: Db, p: Item): Promise<void> {
  setStage(db, [p.id], "checking");
  const others = (
    db
      .prepare(
        `SELECT p.name FROM products p JOIN scans s ON s.id = p.scan_id
         WHERE s.shelf = (SELECT s2.shelf FROM products p2 JOIN scans s2 ON s2.id = p2.scan_id WHERE p2.id = ?) AND p.id != ?`,
      )
      .all(p.id, p.id) as { name: string }[]
  ).map((r) => r.name);
  const verdict = await check(p, others);
  let retouch: Retouch | null = null;
  if (verdict.status !== "no_match") {
    if (p.image_path) {
      retouch = { path: p.image_path, faithful: true, note: "" }; // passed the compare step on an earlier run
    } else if (p.crop_path && !verdict.licensed && process.env.PHOTO_RETOUCH !== "off") {
      // Licensed merchandise skips this: the image provider refuses it every time.
      // Describe the product as the checker saw it, so a wrong listing doesn't steer the retouch.
      const look = {
        name: verdict.status === "corrected" && verdict.name ? verdict.name : p.name,
        description: verdict.status === "corrected" && verdict.description ? verdict.description : p.description,
        text: verdict.visible_text,
      };
      try {
        setStage(db, [p.id], "retouching");
        const made = await retouchPhoto(p, look);
        setStage(db, [p.id], "comparing");
        retouch = await compare(p.crop_path, made, look);
      } catch (err) {
        console.error(`Retouching product ${p.id} failed; using a sharpened crop:`, (err as Error).message);
      }
    }
    if (p.crop_path && !retouch?.faithful) {
      const rejected = retouch;
      retouch = { path: await enhanceCrop(p), faithful: true, note: "" };
      if (rejected) rmSync(path.join(DATA_DIR, rejected.path), { force: true });
    }
  }
  const patch = applyVerdict(p, verdict, retouch);
  for (const file of [retouch?.path, p.crop_path]) {
    if (file && file !== patch.image_path && file !== patch.crop_path) rmSync(path.join(DATA_DIR, file), { force: true });
  }
  db.prepare(
    `UPDATE products SET name = @name, description = @description, category = @category, crop_path = @crop_path,
       image_path = @image_path, check_status = @check_status, check_note = @check_note,
       imaging_stage = NULL, imaged_at = @imaged_at WHERE id = @id`,
  ).run({ ...patch, imaged_at: new Date().toISOString(), id: p.id });
}

async function runPipeline(db: Db): Promise<void> {
  const pending = db
    .prepare(
      `SELECT id, name, description, category, location, status, frame_path, crop_path, image_path FROM products
       WHERE frame_path IS NOT NULL AND imaged_at IS NULL AND imaging_attempts < ? ORDER BY id`,
    )
    .all(MAX_ATTEMPTS) as Item[];
  if (pending.length === 0) return;
  console.log(`Photo pipeline: ${pending.length} products`);
  setStage(db, pending.map((p) => p.id), "queued");
  const failed = db.prepare("UPDATE products SET imaging_attempts = imaging_attempts + 1, imaging_stage = 'queued' WHERE id = ?");
  let failures = 0;

  // 1. Crop, one detector call per frame. Products the detector can't find keep the full frame.
  const ready: Item[] = [];
  for (const [frame, items] of Map.groupBy(pending, (p) => p.frame_path!)) {
    const uncropped = items.filter((p) => !p.crop_path);
    try {
      if (uncropped.length) {
        setStage(db, uncropped.map((p) => p.id), "cropping");
        await cropFrame(db, frame, uncropped);
      }
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

  // 5. Merge duplicates on every shelf this run touched.
  const shelves = db
    .prepare(
      `SELECT DISTINCT s.shelf FROM products p JOIN scans s ON s.id = p.scan_id
       WHERE p.id IN (${pending.map(() => "?").join(",")})`,
    )
    .all(...pending.map((p) => p.id)) as { shelf: string }[];
  for (const { shelf } of shelves) {
    try {
      const merged = await mergeDuplicates(db, shelf);
      if (merged) console.log(`Photo pipeline: merged ${merged} duplicate listings on “${shelf}”`);
    } catch (err) {
      console.error(`Finding duplicates on “${shelf}” failed:`, err);
    }
  }

  if (failures) globalForImaging.lastFailureAt = Date.now();
  console.log(`Photo pipeline: done${failures ? `, ${failures} failures (retried later, up to ${MAX_ATTEMPTS} times)` : ""}`);
}

/**
 * Crops, checks, retouches and de-duplicates every product that hasn't been through the
 * pipeline yet. Safe to call often (the /api/state poll does, so older products catch up): one run
 * at a time, a pause after failures, and each product gives up after MAX_ATTEMPTS failed runs.
 * Never throws.
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
