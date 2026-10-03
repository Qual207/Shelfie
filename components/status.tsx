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

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="rounded-xl bg-red-600 text-white px-5 py-3 text-lg font-semibold">{message}</div>;
}
