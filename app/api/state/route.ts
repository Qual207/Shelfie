import type { Product } from "@/lib/catalog";
import { getDb } from "@/lib/db";
import { rescanDiff, type RescanDiff, type Scan } from "@/lib/scans";
import { STORE_INFO } from "@/lib/store-info";

export const dynamic = "force-dynamic";

export type StateProduct = Product & { shelf: string | null };
export type StateScan = Omit<Scan, "frames_json" | "raw_result_json"> & {
  frames: string[];
  product_count: number;
  diff: RescanDiff | null;
};
export interface AppState {
  products: StateProduct[];
  scans: StateScan[];
  holds: { id: number; product_name: string; customer_name: string; until_time: string; created_at: string }[];
  questions: { count: number; latest: { id: number; from_agent: string; text: string; created_at: string }[] };
  store: typeof STORE_INFO;
}

export async function GET() {
  const db = getDb();
  const products = db
    .prepare("SELECT p.*, s.shelf FROM products p LEFT JOIN scans s ON s.id = p.scan_id ORDER BY p.id")
    .all() as StateProduct[];
  const scans = (db.prepare("SELECT * FROM scans ORDER BY id DESC LIMIT 15").all() as Scan[]).map(
    ({ frames_json, raw_result_json, ...scan }) => ({
      ...scan,
      frames: JSON.parse(frames_json) as string[],
      product_count: products.filter((p) => p.scan_id === scan.id).length,
      diff: scan.kind === "rescan" && raw_result_json ? rescanDiff(db, { ...scan, frames_json, raw_result_json }) : null,
    }),
  );
  const holds = db
    .prepare(
      `SELECT h.id, p.name AS product_name, h.customer_name, h.until_time, h.created_at
       FROM holds h JOIN products p ON p.id = h.product_id ORDER BY h.id DESC LIMIT 20`,
    )
    .all() as AppState["holds"];
  const questions = {
    count: (db.prepare("SELECT COUNT(*) AS n FROM questions").get() as { n: number }).n,
    latest: db
      .prepare("SELECT id, from_agent, text, created_at FROM questions ORDER BY id DESC LIMIT 8")
      .all() as AppState["questions"]["latest"],
  };
  const state: AppState = { products, scans, holds, questions, store: STORE_INFO };
  return Response.json(state);
}
