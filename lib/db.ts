import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type Db = Database.Database;

export const DATA_DIR = path.join(process.cwd(), "data");
export const DB_PATH = path.join(DATA_DIR, "shelfie.db");

// scans.shelf scopes a rescan to the products of the shelf being filmed, so rescanning
// the mini shelf never marks products from the store video as gone.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('initial', 'rescan')),
    shelf TEXT NOT NULL,
    video_path TEXT,
    frames_json TEXT NOT NULL DEFAULT '[]',
    raw_result_json TEXT,
    applied_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    scan_id INTEGER REFERENCES scans(id),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    price_usd REAL,
    price_source TEXT CHECK (price_source IN ('tag', 'owner_typed', 'owner_voice')),
    location TEXT NOT NULL DEFAULT '',
    frame_path TEXT,
    confidence REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
    on_shelf INTEGER NOT NULL DEFAULT 1,
    off_shelf_at TEXT,
    last_seen_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS holds (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    until_time TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY,
    from_agent TEXT NOT NULL,
    text TEXT NOT NULL,
    proposed_product_ids_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );
`;

export function openDb(file: string = DB_PATH): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

// One connection per process; cached on globalThis so Next.js dev reloads reuse it.
const globalForDb = globalThis as unknown as { shelfieDb?: Db };

export function getDb(): Db {
  globalForDb.shelfieDb ??= openDb();
  return globalForDb.shelfieDb;
}

export function nowIso(): string {
  return new Date().toISOString();
}
