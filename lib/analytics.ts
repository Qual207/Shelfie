import type { Db } from "./db";
import type { Role } from "./history";

export interface LoggedMessage {
  id: number;
  room_id: string;
  from_role: Role;
  to_role: Role;
  sender: string;
  text: string;
  created_at: string;
}

export interface Episode {
  id: number; // first message id
  room: string;
  requester: string;
  request: string;
  started_at: string;
  messages: { from: Role; text: string; at: string }[];
  rounds: number; // messages the shopper agent sent to the store
  recommended: string[]; // catalog products the store named, in the order first mentioned
  picked: string | null; // product the shopper asked the store to hold
  held: { product: string; price_usd: number | null; customer: string } | null;
  outcome: "held" | "no_sale" | "in_progress";
}

export interface ProductStat {
  name: string;
  price_usd: number | null;
  recommended: number;
  held: number;
  outranked_by: Record<string, number>; // product that won the hold instead
}

export interface Analytics {
  kpis: {
    requests: number;
    held: number;
    no_sale: number;
    in_progress: number;
    hold_rate: number | null; // held / finished requests
    avg_rounds: number | null;
    avg_store_reply_s: number | null;
    held_value_usd: number;
    on_shelf: number;
    unpriced: number;
  };
  products: ProductStat[];
  budgets: { label: string; demand: number; catalog: number }[];
  unmet: { query: string; count: number; max_price_usd: number | null }[];
  episodes: Episode[];
  message_count: number;
}

interface ProductRow {
  id: number;
  name: string;
  price_usd: number | null;
  on_shelf: number;
}

const BUCKETS = [
  { label: "Under $10", lo: 0, hi: 10 },
  { label: "$10–19", lo: 10, hi: 20 },
  { label: "$20–29", lo: 20, hi: 30 },
  { label: "$30–49", lo: 30, hi: 50 },
  { label: "$50+", lo: 50, hi: Infinity },
];

const mentions = (text: string, name: string) => text.toLowerCase().includes(name.toLowerCase());
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Splits the message log into one episode per human request (a request runs until the next one in that room). */
export function buildEpisodes(
  messages: LoggedMessage[],
  products: ProductRow[],
  holds: { product_name: string; price_usd: number | null; customer_name: string; created_at: string }[],
): Episode[] {
  const byRoom = new Map<string, LoggedMessage[]>();
  for (const m of messages) byRoom.set(m.room_id, [...(byRoom.get(m.room_id) ?? []), m]);

  const groups: { room: string; msgs: LoggedMessage[] }[] = [];
  for (const [room, list] of byRoom) {
    let current: LoggedMessage[] = [];
    const flush = () => {
      if (current.length) groups.push({ room, msgs: current });
      current = [];
    };
    for (const m of list) {
      if (m.from_role === "requester") flush();
      if (current.length || m.from_role === "requester") current.push(m);
    }
    flush();
  }
  groups.sort((a, b) => a.msgs[0].created_at.localeCompare(b.msgs[0].created_at));
  return groups.map((g, i) => toEpisode(g.room, g.msgs, products, holds, groups[i + 1]?.msgs[0].created_at));
}

function toEpisode(
  room: string,
  msgs: LoggedMessage[],
  products: ProductRow[],
  holds: { product_name: string; price_usd: number | null; customer_name: string; created_at: string }[],
  nextStart?: string,
): Episode {
  const first = msgs[0];
  const lastAt = msgs[msgs.length - 1].created_at;
  const storeText = msgs.filter((m) => m.from_role === "store").map((m) => m.text);
  const recommended = products
    .map((p) => ({ name: p.name, at: Math.min(...storeText.map((t, i) => (mentions(t, p.name) ? i * 10_000 + t.toLowerCase().indexOf(p.name.toLowerCase()) : Infinity))) }))
    .filter((p) => Number.isFinite(p.at))
    .sort((a, b) => a.at - b.at)
    .map((p) => p.name);

  const asks = msgs.filter((m) => m.from_role === "shopper" && m.to_role === "store");
  const lastAsk = asks[asks.length - 1]?.text ?? "";
  const picked = asks.length > 1 ? (recommended.find((n) => mentions(lastAsk, n)) ?? null) : null;

  // A hold belongs to this request if placed after it started, before the next request started
  // (any room), and no later than a minute after its last message.
  const end = new Date(lastAt).getTime() + 60_000;
  const hold = holds.find(
    (h) =>
      h.created_at >= first.created_at &&
      new Date(h.created_at).getTime() <= end &&
      (!nextStart || h.created_at < nextStart),
  );
  const reported = msgs.some((m) => m.from_role === "shopper" && m.to_role === "requester");

  return {
    id: first.id,
    room,
    requester: first.sender,
    request: first.text,
    started_at: first.created_at,
    messages: msgs.map((m) => ({ from: m.from_role, text: m.text, at: m.created_at })),
    rounds: asks.length,
    recommended,
    picked,
    held: hold ? { product: hold.product_name, price_usd: hold.price_usd, customer: hold.customer_name } : null,
    outcome: hold ? "held" : reported ? "no_sale" : "in_progress",
  };
}

export function computeAnalytics(db: Db): Analytics {
  const messages = db.prepare("SELECT * FROM messages ORDER BY id").all() as LoggedMessage[];
  const products = db
    .prepare("SELECT id, name, price_usd, on_shelf FROM products WHERE status = 'approved' ORDER BY id")
    .all() as ProductRow[];
  const holds = db
    .prepare(
      `SELECT p.name AS product_name, p.price_usd, h.customer_name, h.created_at
       FROM holds h JOIN products p ON p.id = h.product_id ORDER BY h.id`,
    )
    .all() as { product_name: string; price_usd: number | null; customer_name: string; created_at: string }[];
  const searches = db.prepare("SELECT query, max_price_usd, result_count FROM searches ORDER BY id").all() as {
    query: string;
    max_price_usd: number | null;
    result_count: number;
  }[];

  const episodes = buildEpisodes(messages, products, holds);

  const stats = new Map<string, ProductStat>(
    products.map((p) => [p.name, { name: p.name, price_usd: p.price_usd, recommended: 0, held: 0, outranked_by: {} }]),
  );
  for (const e of episodes) {
    for (const name of e.recommended) stats.get(name)!.recommended++;
    const winner = e.held?.product ?? e.picked;
    if (e.held) stats.get(e.held.product)!.held++;
    if (winner) {
      for (const name of e.recommended) {
        if (name === winner) continue;
        const s = stats.get(name)!;
        s.outranked_by[winner] = (s.outranked_by[winner] ?? 0) + 1;
      }
    }
  }

  // Seconds from the shopper's message to the store to the store's reply.
  const latencies: number[] = [];
  const lastAskAt = new Map<string, number>();
  for (const m of messages) {
    const t = new Date(m.created_at).getTime();
    if (m.from_role === "shopper" && m.to_role === "store") lastAskAt.set(m.room_id, t);
    else if (m.from_role === "store" && lastAskAt.has(m.room_id)) {
      latencies.push((t - lastAskAt.get(m.room_id)!) / 1000);
      lastAskAt.delete(m.room_id);
    }
  }

  const held = episodes.filter((e) => e.outcome === "held");
  const noSale = episodes.filter((e) => e.outcome === "no_sale");
  const finished = held.length + noSale.length;

  const unmet = new Map<string, { query: string; count: number; max_price_usd: number | null }>();
  for (const s of searches.filter((s) => s.result_count === 0)) {
    const key = s.query.trim().toLowerCase();
    const row = unmet.get(key) ?? { query: s.query.trim(), count: 0, max_price_usd: s.max_price_usd };
    row.count++;
    unmet.set(key, row);
  }

  return {
    kpis: {
      requests: episodes.length,
      held: held.length,
      no_sale: noSale.length,
      in_progress: episodes.length - finished,
      hold_rate: finished ? held.length / finished : null,
      avg_rounds: mean(episodes.map((e) => e.rounds)),
      avg_store_reply_s: mean(latencies),
      held_value_usd: held.reduce((sum, e) => sum + (e.held?.price_usd ?? 0), 0),
      on_shelf: products.filter((p) => p.on_shelf === 1).length,
      unpriced: products.filter((p) => p.price_usd === null).length,
    },
    products: [...stats.values()].sort((a, b) => b.recommended - a.recommended || b.held - a.held),
    budgets: BUCKETS.map((b) => ({
      label: b.label,
      demand: searches.filter((s) => s.max_price_usd !== null && s.max_price_usd >= b.lo && s.max_price_usd < b.hi).length,
      catalog: products.filter((p) => p.price_usd !== null && p.price_usd >= b.lo && p.price_usd < b.hi).length,
    })),
    unmet: [...unmet.values()].sort((a, b) => b.count - a.count),
    episodes,
    message_count: messages.length,
  };
}
