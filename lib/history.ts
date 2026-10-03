import { nowIso, type Db } from "./db";

export type Role = "requester" | "shopper" | "store";

/** Logs one chat message for the analytics page. Never throws: logging must not break an agent. */
export function logMessage(
  db: Db,
  m: { room: string; from: Role; to: Role; sender: string; text: string },
  at: string = nowIso(),
): void {
  try {
    db.prepare(
      "INSERT INTO messages (room_id, from_role, to_role, sender, text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(m.room, m.from, m.to, m.sender, m.text, at);
  } catch (err) {
    console.error("Could not log message:", err);
  }
}

/** Logs one catalog search; `matches` counts relevant (keyword-matching), on-shelf results. */
export function logSearch(
  db: Db,
  s: { query: string; max_price_usd?: number; matches: number; productIds: number[] },
  at: string = nowIso(),
): void {
  try {
    db.prepare(
      "INSERT INTO searches (query, max_price_usd, result_count, product_ids_json, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(s.query, s.max_price_usd ?? null, s.matches, JSON.stringify(s.productIds), at);
  } catch (err) {
    console.error("Could not log search:", err);
  }
}
