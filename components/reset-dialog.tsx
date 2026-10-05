"use client";

import { useRef, useState } from "react";
import type { ResetAction } from "@/app/api/reset/route";
import type { DataSummary } from "@/lib/reset";
import { api, json } from "./client";

interface Action {
  action: ResetAction;
  label: string; // button text; the result reads "<done>."
  done: string;
  confirm?: (s: DataSummary) => string; // asked inline before running; omitted = runs at once
  danger?: boolean;
  disabled?: (s: DataSummary) => boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const CLEAR: (Action & { title: string; detail: (s: DataSummary) => string })[] = [
  {
    action: "catalog",
    title: "Catalog",
    detail: (s) => `${plural(s.products, "product")} from ${plural(s.scans, "scan")}, with their photos, videos and holds.`,
    label: "Clear catalog",
    done: "Catalog cleared",
    confirm: (s) => `Delete ${plural(s.products, "product")}, every scan photo and video, and ${plural(s.holds, "hold")}?`,
    disabled: (s) => s.products + s.scans === 0,
  },
  {
    action: "holds",
    title: "Holds",
    detail: (s) => `${plural(s.holds, "pickup hold")} placed by the store agent.`,
    label: "Clear holds",
    done: "Holds cleared",
    confirm: (s) => `Delete ${plural(s.holds, "hold")}?`,
    disabled: (s) => s.holds === 0,
  },
  {
    action: "conversations",
    title: "Agent conversations",
    detail: (s) =>
      `${plural(s.messages, "message")} and ${plural(s.searches, "catalog search")}. The Insights charts are built from these.`,
    label: "Clear conversations",
    done: "Conversations cleared",
    confirm: (s) => `Delete ${plural(s.messages, "message")} and ${plural(s.searches, "search")}?`,
    disabled: (s) => s.messages + s.searches + s.questions === 0,
  },
  {
    action: "reports",
    title: "Analyst reports",
    detail: (s) => `${plural(s.insights, "report")} written by the analyst agent on the Insights page.`,
    label: "Clear reports",
    done: "Reports cleared",
    confirm: (s) => `Delete ${plural(s.insights, "report")}?`,
    disabled: (s) => s.insights === 0,
  },
];

const SAVE: Action = {
  action: "save",
  label: "Save current data",
  done: "Starting point saved",
  confirm: () => "Replace the saved starting point with the data you have now?",
};
const RESTORE: Action = {
  action: "restore",
  label: "Restore",
  done: "Starting point restored",
  confirm: () => "Replace everything you have now with the saved starting point?",
  disabled: (s) => !s.snapshot_saved_at,
};
const SAMPLE_CATALOG: Action = {
  action: "sample_catalog",
  label: "Load sample catalog",
  done: "Sample catalog loaded",
  confirm: () => "This clears everything first, then loads 14 sample souvenirs. Continue?",
};
const SAMPLE_CONVERSATIONS: Action = {
  action: "sample_conversations",
  label: "Add sample conversations",
  done: "Sample conversations added",
  disabled: (s) => s.products < 2,
};
const EVERYTHING: Action = {
  action: "everything",
  label: "Clear everything",
  done: "Everything cleared",
  confirm: () => "Delete the catalog, photos, holds, conversations and reports? Only a saved starting point can bring them back.",
  danger: true,
};

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** "Clear test data": granular clears, a saved starting point, and sample data, for re-running tests. */
export function ResetDialog({ trigger }: { trigger: "sidebar" | "button" }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [summary, setSummary] = useState<DataSummary | null>(null);
  const [armed, setArmed] = useState<ResetAction | null>(null);
  const [busy, setBusy] = useState<ResetAction | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function open() {
    setArmed(null);
    setResult(null);
    ref.current?.showModal();
    try {
      setSummary(await api<DataSummary>("/api/reset"));
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    }
  }

  async function run(a: Action) {
    if (a.confirm && armed !== a.action) return setArmed(a.action);
    setArmed(null);
    setBusy(a.action);
    setResult(null);
    try {
      setSummary(await api<DataSummary>("/api/reset", json({ action: a.action })));
      setResult({ ok: true, text: `${a.done}.` });
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const button = (a: Action, extra = "") => (
    <button
      onClick={() => run(a)}
      disabled={!summary || busy !== null || a.disabled?.(summary)}
      className={`btn ${a.danger ? "btn-danger" : ""} ${extra}`}
    >
      {busy === a.action ? "Working…" : a.label}
    </button>
  );

  const confirmRow = (a: Action) =>
    armed === a.action &&
    summary && (
      <div className="flex flex-wrap items-center gap-3 mt-3 rounded-lg bg-brick-tint px-4 py-3" role="alert">
        <p className="flex-1 min-w-48 font-medium text-[#7a2a1b]">{a.confirm!(summary)}</p>
        <button onClick={() => setArmed(null)} className="btn">
          Cancel
        </button>
        <button onClick={() => run(a)} className="btn btn-danger">
          {a.label}
        </button>
      </div>
    );

  return (
    <>
      {trigger === "sidebar" ? (
        <button onClick={open} className="text-left px-3 py-2 rounded-md font-semibold text-muted hover:text-ink hover:bg-paper">
          Clear test data
        </button>
      ) : (
        <button onClick={open} className="btn">
          Clear test data
        </button>
      )}

      <dialog ref={ref} className="sheet" aria-labelledby="reset-title" onClose={() => setArmed(null)}>
        <div className="flex items-start gap-4 px-6 pt-6 pb-4 border-b border-line">
          <div className="flex-1">
            <h2 id="reset-title" className="text-2xl font-bold">
              Clear test data
            </h2>
            <p className="text-muted mt-1">
              Clear one kind of data at a time between test runs. The store and shopper agents start fresh
              conversations on their next message.
            </p>
          </div>
          <button onClick={() => ref.current?.close()} className="btn" aria-label="Close">
            Close
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-7 overflow-y-auto">
          {result && <p className={`notice ${result.ok ? "notice-ok" : "notice-error"}`}>{result.text}</p>}

          <section aria-labelledby="clear-heading">
            <h3 id="clear-heading" className="text-lg mb-2">
              Clear
            </h3>
            <ul className="divide-y divide-line border-y border-line">
              {CLEAR.map((a) => (
                <li key={a.action} className="py-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="font-semibold">{a.title}</div>
                      <p className="text-muted text-sm mt-0.5">{summary ? a.detail(summary) : "Counting…"}</p>
                    </div>
                    {button(a)}
                  </div>
                  {confirmRow(a)}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="start-heading">
            <h3 id="start-heading" className="text-lg">
              Starting point
            </h3>
            <p className="text-muted text-sm mt-0.5 mb-3">
              Save the data as it is now, then restore it before each run.{" "}
              {summary?.snapshot_saved_at ? `Last saved ${stamp(summary.snapshot_saved_at)}.` : "Nothing saved yet."}
            </p>
            <div className="flex flex-wrap gap-3">
              {button(summary?.snapshot_saved_at ? SAVE : { ...SAVE, confirm: undefined })}
              {button(RESTORE)}
            </div>
            {confirmRow(SAVE)}
            {confirmRow(RESTORE)}
          </section>

          <section aria-labelledby="sample-heading">
            <h3 id="sample-heading" className="text-lg">
              Sample data
            </h3>
            <p className="text-muted text-sm mt-0.5 mb-3">
              Try the agents and Insights without filming a shelf. Sample conversations are made up; don&apos;t show them as
              real shopper history.
            </p>
            <div className="flex flex-wrap gap-3">
              {button(SAMPLE_CATALOG)}
              {button(SAMPLE_CONVERSATIONS)}
            </div>
            {confirmRow(SAMPLE_CATALOG)}
          </section>

          <section className="pt-5 border-t border-line flex flex-wrap items-center gap-4" aria-label="Clear everything">
            <p className="flex-1 min-w-56 text-sm text-muted">Start completely empty: catalog, photos, holds, conversations and reports.</p>
            {button(EVERYTHING)}
          </section>
          {confirmRow(EVERYTHING)}
        </div>
      </dialog>
    </>
  );
}
