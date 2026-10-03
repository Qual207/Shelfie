"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnalyticsResponse } from "@/app/api/analytics/route";
import type { InsightReport, StoredInsights } from "@/lib/insights";
import { BarRows, Columns, Donut, Funnel } from "@/components/charts";
import { api } from "@/components/client";
import { Elapsed, ErrorBanner } from "@/components/status";
import { seenAgo } from "@/lib/time";

const GREEN = "#2f9e44";
const RED = "#e03131";
const GREY = "#a1a1aa";
const ORANGE = "#e8590c";
const BLUE = "#1c7ed6";

export default function InsightsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<AnalyticsResponse>("/api/analytics"));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => {
    const tick = () => void load();
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  async function generate() {
    setStartedAt(Date.now());
    setError(null);
    try {
      await api<StoredInsights>("/api/insights", { method: "POST" }, 300_000);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStartedAt(null);
    }
  }

  const a = data?.analytics;
  const k = a?.kpis;
  const pct = (n: number | null | undefined) => (n == null ? "–" : `${Math.round(n * 100)}%`);

  return (
    <div className="flex flex-col gap-8">
      <ErrorBanner message={error} />
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">Insights</h1>
          <p className="text-lg text-muted mt-1">How shopper agents use your shelf, and what to do about it.</p>
        </div>
        <button
          onClick={generate}
          disabled={startedAt !== null || !k?.requests}
          className="ml-auto bg-accent text-white rounded-xl px-6 py-3 text-lg font-bold hover:bg-accent-dark disabled:opacity-50"
        >
          {startedAt ? <>Analysing… <Elapsed since={startedAt} /></> : data?.insights ? "Re-run analysis" : "Analyse shopping history"}
        </button>
      </div>

      {a && k && a.message_count === 0 && (
        <div className="bg-white rounded-2xl border border-line p-8 text-lg text-muted">
          No shopper conversations logged yet. Run a request from the shopper page and this fills in.
        </div>
      )}

      {a && k && k.requests > 0 && (
        <>
          <div className="grid md:grid-cols-4 gap-6">
            <Tile label="Shopper requests" value={String(k.requests)} />
            <Tile label="Led to a hold" value={pct(k.hold_rate)} accent />
            <Tile label="Held value" value={`$${k.held_value_usd.toFixed(0)}`} />
            <Tile label="Avg store reply" value={k.avg_store_reply_s == null ? "–" : `${k.avg_store_reply_s.toFixed(1)} s`} />
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            <Card title="From request to hold">
              <Funnel
                stages={[
                  { label: "Shopper requests", value: k.requests },
                  { label: "Store offered a product", value: a.episodes.filter((e) => e.recommended.length > 0).length },
                  { label: "Shopper picked one", value: a.episodes.filter((e) => e.picked || e.held).length },
                  { label: "Held for pickup", value: k.held },
                ]}
              />
            </Card>
            <Card title="How each request ended">
              <Donut
                parts={[
                  { label: "held", value: k.held, color: GREEN },
                  { label: "no sale", value: k.no_sale, color: RED },
                  { label: "in progress", value: k.in_progress, color: GREY },
                ]}
              />
              <p className="text-muted mt-4">
                {k.avg_rounds == null ? "" : `Shopper agents averaged ${k.avg_rounds.toFixed(1)} messages to the store per request.`}
              </p>
            </Card>
            <Card title="Offered vs held, by product">
              <BarRows
                series={[{ label: "Recommended", color: BLUE }, { label: "Held", color: GREEN }]}
                rows={a.products
                  .filter((p) => p.recommended > 0)
                  .slice(0, 8)
                  .map((p) => ({
                    label: p.name,
                    sub: p.price_usd == null ? "no price" : `$${p.price_usd}`,
                    values: [p.recommended, p.held],
                  }))}
              />
              {a.products.every((p) => p.recommended === 0) && <p className="text-muted">No product recommended yet.</p>}
            </Card>
            <Card title="Passed over for another product">
              {a.products.some((p) => Object.keys(p.outranked_by).length) ? (
                <ul className="divide-y divide-line">
                  {a.products
                    .filter((p) => Object.keys(p.outranked_by).length)
                    .map((p) => (
                      <li key={p.name} className="py-3 text-lg">
                        <b>{p.name}</b>
                        {p.price_usd != null && <span className="text-muted"> ${p.price_usd}</span>} lost to{" "}
                        {Object.entries(p.outranked_by)
                          .map(([winner, n]) => `${winner} (${n}×)`)
                          .join(", ")}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-lg text-muted">No product has been passed over yet.</p>
              )}
            </Card>
            <Card title="What shoppers can spend vs what your shelf costs">
              <Columns
                series={[{ label: "Budgets in requests", color: ORANGE }, { label: "Your products", color: BLUE }]}
                rows={a.budgets.map((b) => ({ label: b.label, values: [b.demand, b.catalog] }))}
              />
            </Card>
            <Card title="Searches your shelf couldn't answer">
              {a.unmet.length ? (
                <ul className="divide-y divide-line">
                  {a.unmet.map((u) => (
                    <li key={u.query} className="py-3 text-lg flex gap-3">
                      <span>“{u.query}”{u.max_price_usd != null && <span className="text-muted"> under ${u.max_price_usd}</span>}</span>
                      <b className="ml-auto tabular-nums">{u.count}×</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-lg text-muted">Every search found something on the shelf.</p>
              )}
            </Card>
          </div>
        </>
      )}

      {data?.insights && <Report stored={data.insights} stale={data.stale} />}

      {a && a.episodes.length > 0 && (
        <Card title="Conversation replay">
          <ul className="divide-y divide-line">
            {[...a.episodes].reverse().map((e) => (
              <li key={e.id} className="py-3">
                <button onClick={() => setOpen(open === e.id ? null : e.id)} className="w-full text-left flex gap-3 items-baseline">
                  <span className={`text-sm font-bold uppercase rounded px-2 py-0.5 text-white ${e.outcome === "held" ? "bg-[#2f9e44]" : e.outcome === "no_sale" ? "bg-[#e03131]" : "bg-[#a1a1aa]"}`}>
                    {e.outcome.replace("_", " ")}
                  </span>
                  <span className="text-lg flex-1">{e.request}</span>
                  <span className="text-muted whitespace-nowrap">{seenAgo(e.started_at)}</span>
                </button>
                {open === e.id && (
                  <div className="mt-3 flex flex-col gap-2 pl-2 border-l-4 border-line">
                    {e.messages.map((m, i) => (
                      <p key={i} className="text-base leading-snug">
                        <b className="capitalize">{m.from}:</b> {m.text}
                      </p>
                    ))}
                    {e.held && <p className="text-base font-semibold text-[#2f9e44]">Held: {e.held.product} for {e.held.customer}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Report({ stored, stale }: { stored: StoredInsights; stale: boolean }) {
  const r: InsightReport = stored.report;
  const sections: { title: string; color: string; items: InsightReport["went_well"] }[] = [
    { title: "What went well", color: GREEN, items: r.went_well },
    { title: "Where we lost the sale", color: RED, items: r.lost_sales },
    { title: "How shopper agents behave", color: BLUE, items: r.shopper_behavior },
    { title: "Demand we couldn't meet", color: ORANGE, items: r.unmet_demand },
  ];
  return (
    <section className="flex flex-col gap-6">
      <div className="bg-ink text-white rounded-2xl p-8">
        <div className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Analyst report · {stored.model.replace("litellm/", "")} · {seenAgo(stored.created_at)}
          {stale && <span className="ml-3 rounded bg-accent text-white px-2 py-0.5">New conversations since. Re-run for fresh insights</span>}
        </div>
        <h2 className="text-3xl font-extrabold mt-2 leading-tight">{r.headline}</h2>
        <p className="text-lg text-white/80 mt-3 max-w-4xl">{r.summary}</p>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        {sections
          .filter((s) => s.items.length)
          .map((s) => (
            <div key={s.title} className="bg-white rounded-2xl border border-line p-6" style={{ borderTop: `6px solid ${s.color}` }}>
              <h3 className="text-2xl font-bold mb-3">{s.title}</h3>
              <ul className="flex flex-col gap-4">
                {s.items.map((item) => (
                  <li key={item.title}>
                    <div className="text-lg font-bold">{item.title}</div>
                    <p className="text-lg leading-snug">{item.detail}</p>
                    {item.evidence && <p className="text-base text-muted mt-1">Evidence: {item.evidence}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
      {r.recommendations.length > 0 && (
        <Card title="What to do next">
          <ol className="flex flex-col gap-4">
            {r.recommendations.map((rec, i) => (
              <li key={i} className="flex gap-4">
                <span className="text-3xl font-extrabold text-accent tabular-nums">{i + 1}</span>
                <div>
                  <div className="text-lg font-bold">
                    {rec.action}{" "}
                    <span className="text-sm uppercase font-bold align-middle rounded px-2 py-0.5 bg-line text-muted">{rec.impact} impact</span>
                  </div>
                  <p className="text-lg text-muted leading-snug">{rec.why}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-line p-6">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-6 ${accent ? "bg-accent text-white" : "bg-white border border-line"}`}>
      <div className="text-5xl font-extrabold tabular-nums">{value}</div>
      <div className={`text-lg font-semibold mt-1 ${accent ? "text-white/90" : "text-muted"}`}>{label}</div>
    </div>
  );
}
