"use client";

import { useAppState } from "@/components/client";
import { ErrorBanner } from "@/components/status";
import { seenAgo } from "@/lib/time";

export default function DashboardPage() {
  const { state, error } = useAppState();
  const listed = state?.products.filter((p) => p.status === "approved").length ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <ErrorBanner message={error} />
      <h1 className="text-4xl font-extrabold tracking-tight">Dashboard</h1>
      <div className="grid md:grid-cols-3 gap-6">
        <Stat label="Products listed" value={listed} />
        <Stat label="Agent questions" value={state?.questions.count ?? 0} />
        <Stat label="Holds" value={state?.holds.length ?? 0} accent />
      </div>
      <div className="grid lg:grid-cols-2 gap-8">
        <section className="bg-white rounded-2xl border border-line p-6">
          <h2 className="text-2xl font-bold mb-4">Latest holds</h2>
          {state?.holds.length ? (
            <ul className="divide-y divide-line">
              {state.holds.map((h) => (
                <li key={h.id} className="py-3 flex items-baseline gap-4">
                  <span className="text-xl font-bold">{h.product_name}</span>
                  <span className="text-lg">for {h.customer_name}, until {h.until_time}</span>
                  <span className="ml-auto text-muted whitespace-nowrap">{seenAgo(h.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-lg text-muted">No holds yet.</p>
          )}
        </section>
        <section className="bg-white rounded-2xl border border-line p-6">
          <h2 className="text-2xl font-bold mb-4">Questions from shopper agents</h2>
          {state?.questions.latest.length ? (
            <ul className="divide-y divide-line">
              {state.questions.latest.map((q) => (
                <li key={q.id} className="py-3">
                  <div className="flex gap-4 text-muted">
                    <span className="font-semibold text-ink">{q.from_agent}</span>
                    <span className="ml-auto whitespace-nowrap">{seenAgo(q.created_at)}</span>
                  </div>
                  <p className="text-lg leading-snug">{q.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-lg text-muted">No questions yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-8 ${accent ? "bg-accent text-white" : "bg-white border border-line"}`}>
      <div className="text-7xl font-extrabold tabular-nums">{value}</div>
      <div className={`text-xl font-semibold mt-2 ${accent ? "text-white/90" : "text-muted"}`}>{label}</div>
    </div>
  );
}
