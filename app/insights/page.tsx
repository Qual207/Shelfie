"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnalyticsResponse } from "@/app/api/analytics/route";
import type { InsightReport, StoredInsights } from "@/lib/insights";
import { BarRows, Columns, Donut, Funnel } from "@/components/charts";
import { api } from "@/components/client";
import { Page } from "@/components/page";
import { ResetDialog } from "@/components/reset-dialog";
import { Elapsed, ErrorBanner } from "@/components/status";
import { seenAgo } from "@/lib/time";

// Chart colors from the app palette: leaf = held, brick = lost, spruce = the shelf, ochre = shopper demand.
const GREEN = "#2e8b57";
const RED = "#b3412c";
const GREY = "#a3ada8";
const ORANGE = "#c99a00";
const BLUE = "#1f5b4b";

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
    <Page
      title="Insights"
      intro="How shopper agents use your shelf, where sales were lost, and what to change this week."
      actions={
        <>
          <ResetDialog trigger="button" />
          <button onClick={generate} disabled={startedAt !== null || !k?.requests} className="btn btn-primary">
            {startedAt ? <>Analysing <Elapsed since={startedAt} /></> : data?.insights ? "Run the analysis again" : "Analyse shopping history"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />

      {a && k && a.message_count === 0 && (
        <div className="panel p-8 text-lg text-muted">
          No shopper conversations yet. Send a request from the shopper view, or add sample conversations under Clear test
          data, and this page fills in.
        </div>
      )}

      {a && k && k.requests > 0 && (
        <>
          <dl className="panel grid sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 lg:divide-x divide-line">
            <Tile label="Shopper requests" value={String(k.requests)} />
            <Tile label="Ended in a hold" value={pct(k.hold_rate)} />
            <Tile label="Value held for pickup" value={`$${k.held_value_usd.toFixed(0)}`} />
            <Tile label="Average store reply" value={k.avg_store_reply_s == null ? "–" : `${k.avg_store_reply_s.toFixed(1)} s`} />
          </dl>

          <div className="grid lg:grid-cols-2 gap-6">
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
                      <li key={p.name} className="py-3">
                        <b>{p.name}</b>
                        {p.price_usd != null && <span className="text-muted"> ${p.price_usd}</span>} lost to{" "}
                        {Object.entries(p.outranked_by)
                          .map(([winner, n]) => `${winner} (${n}×)`)
                          .join(", ")}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-muted">No product has been passed over yet.</p>
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
                    <li key={u.query} className="py-3 flex gap-3">
                      <span>“{u.query}”{u.max_price_usd != null && <span className="text-muted"> under ${u.max_price_usd}</span>}</span>
                      <b className="ml-auto tabular-nums">{u.count}×</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">Every search found something on the shelf.</p>
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
                <button onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id} className="w-full text-left flex gap-3 items-baseline rounded hover:bg-paper px-1 -mx-1">
                  <span className="w-28 shrink-0 flex items-center gap-2 text-sm font-semibold">
                    <span className={`w-2.5 h-2.5 rounded-full ${e.outcome === "held" ? "bg-leaf" : e.outcome === "no_sale" ? "bg-brick" : "bg-line"}`} aria-hidden />
                    {OUTCOME[e.outcome]}
                  </span>
                  <span className="flex-1">{e.request}</span>
                  <span className="text-sm text-muted whitespace-nowrap">{seenAgo(e.started_at)}</span>
                </button>
                {open === e.id && (
                  <div className="mt-3 ml-1 flex flex-col gap-2 pl-4 border-l-2 border-line max-w-[75ch]">
                    {e.messages.map((m, i) => (
                      <p key={i} className="leading-snug">
                        <b>{SPEAKER[m.from]}:</b> {m.text}
                      </p>
                    ))}
                    {e.held && <p className="font-semibold text-leaf">Held {e.held.product} for {e.held.customer}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}

const OUTCOME = { held: "Held", no_sale: "No sale", in_progress: "In progress" };
const SPEAKER = { requester: "Shopper", shopper: "Shopper agent", store: "Store agent" };

function Report({ stored, stale }: { stored: StoredInsights; stale: boolean }) {
  const r: InsightReport = stored.report;
  const sections: { title: string; color: string; items: InsightReport["went_well"] }[] = [
    { title: "What went well", color: GREEN, items: r.went_well },
    { title: "Where sales were lost", color: RED, items: r.lost_sales },
    { title: "How shopper agents decide", color: BLUE, items: r.shopper_behavior },
    { title: "Demand the shelf couldn't meet", color: ORANGE, items: r.unmet_demand },
  ];
  return (
    <section className="flex flex-col gap-6" aria-labelledby="report-title">
      <div className="panel p-7 border-l-4 border-l-accent">
        <p className="text-sm text-muted">
          Analyst report by {stored.model.replace("litellm/", "")}, written {seenAgo(stored.created_at)}
        </p>
        {stale && (
          <p className="notice notice-ok mt-3 text-sm">There are new conversations since this report. Run the analysis again to include them.</p>
        )}
        <h2 id="report-title" className="text-3xl leading-tight mt-3 max-w-[40ch]">
          {r.headline}
        </h2>
        <p className="text-lg text-muted mt-3 max-w-[70ch] leading-relaxed">{r.summary}</p>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        {sections
          .filter((s) => s.items.length)
          .map((s) => (
            <div key={s.title} className="panel p-6">
              <h3 className="text-xl flex items-center gap-2 mb-3">
                <span className="w-3 h-3 rounded-sm" style={{ background: s.color }} aria-hidden />
                {s.title}
              </h3>
              <ul className="flex flex-col gap-4">
                {s.items.map((item) => (
                  <li key={item.title}>
                    <div className="font-semibold">{item.title}</div>
                    <p className="leading-snug mt-0.5">{item.detail}</p>
                    {item.evidence && <p className="text-sm text-muted mt-1">Evidence: {item.evidence}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
      {r.recommendations.length > 0 && (
        <Card title="What to do next">
          <ol className="flex flex-col gap-5">
            {r.recommendations.map((rec, i) => (
              <li key={i} className="flex gap-4">
                <span className="wide text-2xl font-bold text-accent w-7 shrink-0">{i + 1}</span>
                <div className="max-w-[75ch]">
                  <div className="font-semibold text-lg">
                    {rec.action}
                    <span className="ml-2 align-middle text-sm font-medium text-muted border border-line rounded-full px-2 py-0.5">
                      {rec.impact} impact
                    </span>
                  </div>
                  <p className="text-muted leading-snug mt-0.5">{rec.why}</p>
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
    <section className="panel p-6">
      <h2 className="text-xl mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-6 py-5">
      <dt className="text-muted">{label}</dt>
      <dd className="wide text-4xl font-bold mt-1">{value}</dd>
    </div>
  );
}
