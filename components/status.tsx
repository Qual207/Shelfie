"use client";

import { useEffect, useState } from "react";

/** Live "12 s" counter, so a long vision call never looks frozen. */
export function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums text-accent">{Math.floor((now - since) / 1000)} s</span>;
}

/** Working state for a long call: a thin progress rule under the message, plus elapsed seconds. */
export function Working({ since, children }: { since: number; children: React.ReactNode }) {
  return (
    <div className="panel px-4 py-3 border-accent" role="status">
      <div className="flex items-center gap-3 font-semibold">
        <span className="flex-1">{children}</span>
        <Elapsed since={since} />
      </div>
      <div className="mt-2 h-1 rounded bg-accent-tint overflow-hidden">
        <div className="h-full w-1/3 bg-accent animate-[slide_1.4s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="notice notice-error" role="alert">
      {message}
    </div>
  );
}
