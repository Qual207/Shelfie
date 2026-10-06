// Small dependency-free SVG/CSS charts for the insights page.

export function Donut({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" className="w-36 h-36 shrink-0 -rotate-90" role="img" aria-label="Outcome of each request">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--color-line)" strokeWidth="18" />
        {total > 0 &&
          parts.map((p) => {
            const len = (p.value / total) * c;
            const el = (
              <circle
                key={p.label}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth="18"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <ul className="flex flex-col gap-2">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-sm" style={{ background: p.color }} />
            <b className="tabular-nums">{p.value}</b> {p.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars, one or two series per row, scaled to the largest value. */
export function BarRows({
  rows,
  series,
}: {
  rows: { label: string; sub?: string; values: number[] }[];
  series: { label: string; color: string }[];
}) {
  const max = Math.max(1, ...rows.flatMap((r) => r.values));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-5 text-base text-muted">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex justify-between gap-3">
            <span className="font-semibold truncate">{row.label}</span>
            {row.sub && <span className="text-muted whitespace-nowrap">{row.sub}</span>}
          </div>
          {row.values.map((v, i) => (
            <div key={i} className="flex items-center gap-2 mt-1">
              <div className="h-4 rounded-r" style={{ width: `${(v / max) * 100}%`, minWidth: v ? 6 : 2, background: series[i].color }} />
              <span className="text-base tabular-nums text-muted">{v}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Vertical paired columns (e.g. what shoppers can spend vs what the shelf costs). */
export function Columns({
  rows,
  series,
}: {
  rows: { label: string; values: number[] }[];
  series: { label: string; color: string }[];
}) {
  const max = Math.max(1, ...rows.flatMap((r) => r.values));
  return (
    <div>
      <div className="flex gap-5 text-base text-muted mb-3">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="flex items-end gap-4 h-40">
        {rows.map((row) => (
          <div key={row.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            <div className="flex items-end gap-1 w-full justify-center flex-1">
              {row.values.map((v, i) => (
                <div key={i} className="flex flex-col items-center justify-end h-full w-1/2 max-w-10">
                  <span className="text-sm tabular-nums text-muted">{v}</span>
                  <div className="w-full rounded-t" style={{ height: `${(v / max) * 80}%`, minHeight: v ? 4 : 1, background: series[i].color }} />
                </div>
              ))}
            </div>
            <span className="text-sm text-muted text-center leading-tight">{row.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Stepped funnel: each stage's bar is scaled to the first. */
export function Funnel({ stages }: { stages: { label: string; value: number }[] }) {
  const top = Math.max(1, stages[0]?.value ?? 1);
  return (
    <div className="flex flex-col gap-3">
      {stages.map((s, i) => (
        <div key={s.label}>
          <div className="flex justify-between">
            <span className="font-semibold">{s.label}</span>
            <span className="tabular-nums">
              <b>{s.value}</b>
              {i > 0 && stages[i - 1].value > 0 && (
                <span className="text-muted"> ({Math.round((s.value / stages[i - 1].value) * 100)}% of the step before)</span>
              )}
            </span>
          </div>
          <div className="h-6 rounded-sm bg-paper border border-line mt-1 overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${(s.value / top) * 100}%`, opacity: 1 - i * 0.18 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
