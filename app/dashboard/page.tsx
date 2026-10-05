"use client";

import { useAppState } from "@/components/client";
import { Page } from "@/components/page";
import { ErrorBanner } from "@/components/status";
import { seenAgo } from "@/lib/time";

export default function DashboardPage() {
  const { state, error } = useAppState();
  const listed = state?.products.filter((p) => p.status === "approved").length ?? 0;
  const stats = [
    { label: "Products the agent can sell", value: listed },
    { label: "Questions from shopper agents", value: state?.questions.count ?? 0 },
    { label: "Holds waiting for pickup", value: state?.holds.length ?? 0 },
  ];

  return (
    <Page title="Holds and questions" intro="What shopper agents asked your store agent, and what they reserved for pickup.">
      <ErrorBanner message={error} />
      <dl className="panel grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
        {stats.map((s) => (
          <div key={s.label} className="px-6 py-5">
            <dt className="text-muted">{s.label}</dt>
            <dd className="wide text-5xl font-bold mt-1">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <section className="panel" aria-labelledby="holds-title">
          <h2 id="holds-title" className="text-xl px-6 pt-5 pb-3">
            Holds
          </h2>
          {state?.holds.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {state.holds.map((h) => (
                <li key={h.id} className="px-6 py-4 flex items-baseline gap-4">
                  <div className="flex-1">
                    <div className="font-semibold text-lg">{h.product_name}</div>
                    <div className="text-muted">
                      For {h.customer_name}, until {h.until_time}
                    </div>
                  </div>
                  <span className="text-sm text-muted whitespace-nowrap">{seenAgo(h.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-6 pb-6 text-muted">No holds yet. When a shopper agent picks a product, its hold shows up here.</p>
          )}
        </section>

        <section className="panel" aria-labelledby="questions-title">
          <h2 id="questions-title" className="text-xl px-6 pt-5 pb-3">
            Latest questions
          </h2>
          {state?.questions.latest.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {state.questions.latest.map((q) => (
                <li key={q.id} className="px-6 py-4">
                  <div className="flex gap-4 text-sm text-muted">
                    <span className="font-semibold text-ink">{q.from_agent}</span>
                    <span className="ml-auto whitespace-nowrap">{seenAgo(q.created_at)}</span>
                  </div>
                  <p className="mt-1 leading-snug max-w-[70ch]">{q.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-6 pb-6 text-muted">No questions yet. Send a request from the shopper view to start one.</p>
          )}
        </section>
      </div>
    </Page>
  );
}
