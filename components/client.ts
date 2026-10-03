import { useEffect, useState } from "react";
import type { AppState } from "@/app/api/state/route";

/** Polls /api/state every second; keeps the last good state if a poll fails. */
export function useAppState() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as AppState;
        if (alive) {
          setState(data);
          setError(null);
        }
      } catch {
        if (alive) setError("Can't reach the Shelfie server. Is `pnpm demo` still running?");
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return { state, error };
}

/** fetch + JSON with the server's error message surfaced, and a hard timeout. */
export async function api<T>(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data as T;
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`No answer after ${Math.round(timeoutMs / 1000)} s. Try again.`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const mediaUrl = (file: string) => `/api/media/${file}`;
