import { cpSync, existsSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { DATA_DIR, nowIso, type Db } from "./db";

// Test-data controls behind the "Clear test data" dialog and `pnpm snapshot` / `pnpm reset`.

export const SNAPSHOT_DB = path.join(DATA_DIR, "snapshot.db");
const SNAPSHOT_MEDIA = path.join(DATA_DIR, "snapshot-media");
const MEDIA_DIRS = ["frames", "uploads", "products"]; // under data/, referenced by scans and products

// Children before parents, so foreign keys never block a delete. `meta` is never cleared or restored.
const TABLES = ["holds", "questions", "searches", "messages", "insights", "products", "scans"];

export type ClearScope = "catalog" | "holds" | "conversations" | "reports" | "everything";

const SCOPE_TABLES: Record<ClearScope, string[]> = {
  catalog: ["holds", "products", "scans"], // holds point at products
  holds: ["holds"],
  conversations: ["messages", "searches", "questions"],
  reports: ["insights"],
  everything: TABLES,
};

export interface DataSummary {
  products: number;
  scans: number;
  holds: number;
  messages: number;
  searches: number;
  questions: number;
  insights: number;
  snapshot_saved_at: string | null;
}

const count = (db: Db, table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

export function dataSummary(db: Db): DataSummary {
  return {
    products: count(db, "products"),
    scans: count(db, "scans"),
    holds: count(db, "holds"),
    messages: count(db, "messages"),
    searches: count(db, "searches"),
    questions: count(db, "questions"),
    insights: count(db, "insights"),
    snapshot_saved_at: existsSync(SNAPSHOT_DB) ? statSync(SNAPSHOT_DB).mtime.toISOString() : null,
  };
}

/**
 * The agent processes keep their ZooWork conversations in memory. They compare this value on
 * every message and start fresh conversations when it changes, so a cleared test is a clean test.
 */
export function agentMemoryEpoch(db: Db): string {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'agents_reset_at'").get() as { value: string } | undefined;
  return row?.value ?? "";
}

function forgetAgentConversations(db: Db): void {
  db.prepare(
    "INSERT INTO meta (key, value) VALUES ('agents_reset_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(`${nowIso()}#${Math.random().toString(36).slice(2, 8)}`);
}

/** Deletes the rows for one scope. Media files are separate (clearMedia), so tests never touch data/. */
export function clearData(db: Db, scope: ClearScope): void {
  db.transaction(() => {
    for (const table of SCOPE_TABLES[scope]) db.exec(`DELETE FROM ${table}`);
    if (scope !== "reports") forgetAgentConversations(db);
  })();
}

/** True when clearing this scope orphans scan frames, uploads and product photos. */
export const clearsMedia = (scope: ClearScope) => scope === "catalog" || scope === "everything";

export function clearMedia(): void {
  for (const dir of MEDIA_DIRS) rmSync(path.join(/* turbopackIgnore: true */ DATA_DIR, dir), { recursive: true, force: true });
}

/** Saves the database and its photos/videos as the starting point that restoreSnapshot brings back. */
export function saveSnapshot(db: Db): void {
  rmSync(SNAPSHOT_DB, { force: true });
  db.prepare("VACUUM INTO ?").run(SNAPSHOT_DB);
  rmSync(SNAPSHOT_MEDIA, { recursive: true, force: true });
  for (const dir of MEDIA_DIRS) {
    const from = path.join(/* turbopackIgnore: true */ DATA_DIR, dir);
    if (existsSync(from)) cpSync(from, path.join(/* turbopackIgnore: true */ SNAPSHOT_MEDIA, dir), { recursive: true });
  }
}

const columns = (db: Db, schema: string, table: string) =>
  (db.prepare(`PRAGMA ${schema}.table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

/**
 * Restores the saved starting point inside one transaction, so it is safe while the app runs.
 * Copies only the columns both versions have, so a snapshot from an older schema still loads.
 */
export function restoreSnapshot(db: Db): void {
  if (!existsSync(SNAPSHOT_DB)) throw new Error("No starting point saved yet. Save one first.");
  db.prepare("ATTACH DATABASE ? AS snap").run(SNAPSHOT_DB);
  try {
    const saved = new Set(
      (db.prepare("SELECT name FROM snap.sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name),
    );
    db.transaction(() => {
      for (const table of TABLES) db.exec(`DELETE FROM main.${table}`);
      for (const table of [...TABLES].reverse().filter((t) => saved.has(t))) {
        const snapColumns = new Set(columns(db, "snap", table));
        const shared = columns(db, "main", table).filter((c) => snapColumns.has(c)).join(", ");
        db.exec(`INSERT INTO main.${table} (${shared}) SELECT ${shared} FROM snap.${table}`);
      }
      forgetAgentConversations(db);
    })();
  } finally {
    db.exec("DETACH DATABASE snap");
  }
  clearMedia();
  for (const dir of MEDIA_DIRS) {
    const from = path.join(/* turbopackIgnore: true */ SNAPSHOT_MEDIA, dir);
    if (existsSync(from)) cpSync(from, path.join(/* turbopackIgnore: true */ DATA_DIR, dir), { recursive: true });
  }
}
