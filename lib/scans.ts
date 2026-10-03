import { insertScannedProducts, type Product, type ScannedProduct } from "./catalog";
import { nowIso, type Db } from "./db";
import { rescanFrames, scanFrames, type RescanResult } from "./vision";

export interface Scan {
  id: number;
  kind: "initial" | "rescan";
  shelf: string;
  video_path: string | null;
  frames_json: string;
  raw_result_json: string | null;
  applied_at: string | null;
  created_at: string;
}

type DiffItem = { id: number; name: string; frame_path: string | null };

export interface RescanDiff {
  gone: DiffItem[]; // on the shelf before, not seen now
  back: DiffItem[]; // off the shelf before, seen again now
  seen: number;
  new_products: (ScannedProduct & { frame_path: string | null })[];
}

export function createScan(db: Db, kind: Scan["kind"], shelf: string, videoPath: string | null): number {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO scans (kind, shelf, video_path, created_at) VALUES (?, ?, ?, ?)")
    .run(kind, shelf, videoPath, nowIso());
  return Number(lastInsertRowid);
}

export function getScan(db: Db, id: number): Scan | undefined {
  return db.prepare("SELECT * FROM scans WHERE id = ?").get(id) as Scan | undefined;
}

/** Approved products that came from scans of this shelf. */
export function shelfCatalog(db: Db, shelf: string): Product[] {
  return db
    .prepare(
      `SELECT p.* FROM products p JOIN scans s ON s.id = p.scan_id
       WHERE p.status = 'approved' AND s.shelf = ? ORDER BY p.id`,
    )
    .all(shelf) as Product[];
}

export async function runInitialScan(db: Db, scanId: number, frames: string[]): Promise<number> {
  const scan = getScan(db, scanId)!;
  const { products, raw } = await scanFrames(frames);
  db.prepare("UPDATE scans SET frames_json = ?, raw_result_json = ? WHERE id = ?").run(
    JSON.stringify(frames), raw, scanId,
  );
  insertScannedProducts(db, scanId, products, frames, scan.created_at);
  return products.length;
}

export async function runRescan(db: Db, scanId: number, frames: string[]): Promise<RescanDiff> {
  const scan = getScan(db, scanId)!;
  const catalog = shelfCatalog(db, scan.shelf);
  if (catalog.length === 0) throw new Error(`No approved products on the "${scan.shelf}" shelf to compare against`);
  const { result } = await rescanFrames(
    frames,
    catalog.map((p) => ({ id: p.id, name: p.name, description: p.description, location: p.location })),
  );
  db.prepare("UPDATE scans SET frames_json = ?, raw_result_json = ? WHERE id = ?").run(
    JSON.stringify(frames), JSON.stringify(result), scanId,
  );
  return computeDiff(catalog, result, frames);
}

export function computeDiff(catalog: Product[], result: RescanResult, frames: string[]): RescanDiff {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const item = (p: Product): DiffItem => ({ id: p.id, name: p.name, frame_path: p.frame_path });
  const diff: RescanDiff = { gone: [], back: [], seen: 0, new_products: [] };
  for (const u of result.updates) {
    const p = byId.get(u.id);
    if (!p) continue;
    if (u.status === "seen") {
      diff.seen++;
      if (p.on_shelf !== 1) diff.back.push(item(p));
    } else if (p.on_shelf === 1) {
      diff.gone.push(item(p));
    }
  }
  diff.new_products = result.new_products.map((p) => ({ ...p, frame_path: frames[p.best_frame] ?? null }));
  return diff;
}

/** The diff of a stored rescan against the catalog as it is now. */
export function rescanDiff(db: Db, scan: Scan): RescanDiff | null {
  if (scan.kind !== "rescan" || !scan.raw_result_json) return null;
  return computeDiff(
    shelfCatalog(db, scan.shelf),
    JSON.parse(scan.raw_result_json) as RescanResult,
    JSON.parse(scan.frames_json) as string[],
  );
}

/**
 * seen → on shelf, last seen at the rescan time; not_seen → off shelf as of the rescan time
 * (kept from the first rescan that missed it); new → pending products.
 */
export function applyRescan(db: Db, scanId: number): void {
  const scan = getScan(db, scanId);
  if (!scan || scan.kind !== "rescan" || !scan.raw_result_json) throw new Error("Not a finished rescan");
  if (scan.applied_at) throw new Error("This rescan was already applied");
  const result = JSON.parse(scan.raw_result_json) as RescanResult;
  const frames = JSON.parse(scan.frames_json) as string[];
  const seen = db.prepare("UPDATE products SET on_shelf = 1, off_shelf_at = NULL, last_seen_at = ? WHERE id = ?");
  const gone = db.prepare("UPDATE products SET on_shelf = 0, off_shelf_at = COALESCE(off_shelf_at, ?) WHERE id = ?");
  db.transaction(() => {
    for (const u of result.updates) {
      if (u.status === "seen") seen.run(scan.created_at, u.id);
      else gone.run(scan.created_at, u.id);
    }
    insertScannedProducts(db, scanId, result.new_products, frames, scan.created_at);
    db.prepare("UPDATE scans SET applied_at = ? WHERE id = ?").run(nowIso(), scanId);
  })();
}
