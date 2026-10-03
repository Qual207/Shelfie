import { computeAnalytics, type Analytics } from "./analytics";
import { nowIso, type Db } from "./db";
import { parseModelJson } from "./json";
import { ensureAgent, runTurn, zoowork, type AgentSpec, type SessionState } from "./zoowork";

// The seller-side analyst: a ZooWork agent (same path as the store, shopper and vision agents, so no
// extra provider key) that reads the shopping history and writes the insights shown on /insights.

// Strongest first; the first one this ZooWork project lists as selectable is used.
// ANALYST_MODEL in .env overrides. litellm/claude-sonnet-5-5 is verified to work (vision uses it).
const MODEL_PREFERENCE = [
  "litellm/claude-fable-5-1",
  "litellm/claude-opus-5-5",
  "litellm/claude-sonnet-5-5",
  "litellm/claude-haiku-4-5",
];

export interface Insight {
  title: string;
  detail: string;
  evidence: string;
}
export interface InsightReport {
  headline: string;
  summary: string;
  went_well: Insight[];
  lost_sales: Insight[];
  shopper_behavior: Insight[];
  unmet_demand: Insight[];
  recommendations: { action: string; why: string; impact: "high" | "medium" | "low" }[];
}
export interface StoredInsights {
  id: number;
  model: string;
  report: InsightReport;
  message_count: number;
  created_at: string;
}

const ANALYST_INSTRUCTIONS = `You are the data analyst for a small physical store that sells through AI shopper agents. Shopper agents (acting for people) message the store's agent in a chat room; the store agent searches the shelf catalog, recommends products and places holds for in-store pickup. You are given the store's shopping history and must tell the owner what it means.

Rules:
- Use only the data you are given. Cite concrete evidence: product names, prices, request wording, counts. Never invent numbers, products or conversations.
- If the history is thin (a handful of requests), say so plainly and keep claims modest; do not present three conversations as a trend.
- Read the transcripts, not just the counts. Look at how the shopper agent decides: what it asks for, how it weighs budget against fit, why it picks one product over the others, and when it walks away without buying.
- A "lost sale" is a request that ended without a hold, or a recommended product the shopper agent passed over for another. Explain the likely reason from the transcript (price, fit, wording of the store's reply, product gone from the shelf, no match for the request) and what the owner could change.
- Recommendations must be actions an owner can take this week (restock, price, reword a description, add a product, photograph a shelf better), ordered by impact.
- Write plainly for a shop owner. No jargon, no markdown.

Reply with JSON only, no prose and no code fences, in exactly this shape (use empty arrays when there is nothing to say):
{"headline":"<one sentence>","summary":"<2-4 sentences>","went_well":[{"title":"","detail":"","evidence":""}],"lost_sales":[{"title":"","detail":"","evidence":""}],"shopper_behavior":[{"title":"","detail":"","evidence":""}],"unmet_demand":[{"title":"","detail":"","evidence":""}],"recommendations":[{"action":"","why":"","impact":"high or medium or low"}]}`;

function analystSpec(model: string): AgentSpec {
  return { role: "analyst", name: "shelfie-analyst", model, instructions: ANALYST_INSTRUCTIONS };
}

let analystAgent: Promise<{ id: string; model: string }> | undefined;

/** Picks the strongest selectable model ZooWork offers this project, then creates/updates the agent. */
function analyst(): Promise<{ id: string; model: string }> {
  analystAgent ??= (async () => {
    let model = process.env.ANALYST_MODEL;
    if (!model) {
      const listed = new Map((await zoowork().listModels()).map((m) => [m.model, m.selectable !== false]));
      model = MODEL_PREFERENCE.find((m) => listed.get(m)) ?? MODEL_PREFERENCE[2];
    }
    return { id: await ensureAgent(analystSpec(model)), model };
  })().catch((err) => {
    analystAgent = undefined;
    throw err;
  });
  return analystAgent;
}

const trim = (text: string, n = 500) => (text.length > n ? `${text.slice(0, n)}…` : text);

/** The facts the analyst reasons over: computed stats plus the transcripts, kept small. */
export function analystInput(data: Analytics) {
  return {
    totals: data.kpis,
    products: data.products.map((p) => ({ ...p, outranked_by: p.outranked_by })),
    budget_requests_vs_catalog_prices: data.budgets,
    searches_with_no_match: data.unmet,
    conversations: data.episodes.slice(-40).map((e) => ({
      requester: e.requester,
      request: trim(e.request),
      outcome: e.outcome,
      held: e.held,
      products_the_store_recommended: e.recommended,
      product_the_shopper_picked: e.picked,
      transcript: e.messages.map((m) => `${m.from}: ${trim(m.text)}`),
    })),
  };
}

function list(value: unknown): Insight[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => v as Partial<Insight>)
    .filter((v) => typeof v?.title === "string" && v.title.trim())
    .map((v) => ({ title: v.title!.trim(), detail: String(v.detail ?? "").trim(), evidence: String(v.evidence ?? "").trim() }));
}

export function normalizeReport(value: unknown): InsightReport {
  const v = (value ?? {}) as Record<string, unknown>;
  if (typeof v.headline !== "string" || !v.headline.trim()) throw new Error("Analyst reply has no headline");
  const recs = Array.isArray(v.recommendations) ? v.recommendations : [];
  return {
    headline: v.headline.trim(),
    summary: String(v.summary ?? "").trim(),
    went_well: list(v.went_well),
    lost_sales: list(v.lost_sales),
    shopper_behavior: list(v.shopper_behavior),
    unmet_demand: list(v.unmet_demand),
    recommendations: recs
      .map((r) => r as { action?: unknown; why?: unknown; impact?: unknown })
      .filter((r) => typeof r?.action === "string" && r.action.trim())
      .map((r) => ({
        action: String(r.action).trim(),
        why: String(r.why ?? "").trim(),
        impact: r.impact === "high" || r.impact === "low" ? r.impact : "medium",
      })),
  };
}

export function latestInsights(db: Db): StoredInsights | null {
  const row = db.prepare("SELECT * FROM insights ORDER BY id DESC LIMIT 1").get() as
    | { id: number; model: string; result_json: string; message_count: number; created_at: string }
    | undefined;
  return row
    ? { id: row.id, model: row.model, report: JSON.parse(row.result_json) as InsightReport, message_count: row.message_count, created_at: row.created_at }
    : null;
}

/** One analyst turn over the current history; stores and returns the report. */
export async function generateInsights(db: Db): Promise<StoredInsights> {
  const data = computeAnalytics(db);
  if (data.kpis.requests === 0) throw new Error("No shopper conversations yet. Run a shopper request first.");
  const { id, model } = await analyst();
  const session: SessionState = {};
  const prompt = `Here is the store's shopping history as JSON. Analyse it and reply with the JSON report.\n${JSON.stringify(analystInput(data))}`;

  let reply = await runTurn(id, session, prompt, undefined, 240_000);
  let report: InsightReport;
  try {
    report = normalizeReport(parseModelJson(reply));
  } catch {
    reply = await runTurn(id, session, "Your last reply was not valid JSON in the required shape. Reply again with only the JSON object.", undefined, 240_000);
    report = normalizeReport(parseModelJson(reply));
  }
  const { lastInsertRowid } = db
    .prepare("INSERT INTO insights (model, result_json, message_count, created_at) VALUES (?, ?, ?, ?)")
    .run(model, JSON.stringify(report), data.message_count, nowIso());
  return { id: Number(lastInsertRowid), model, report, message_count: data.message_count, created_at: nowIso() };
}
