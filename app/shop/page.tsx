"use client";

import { useEffect, useRef, useState } from "react";
import type { ShopHold, ShopThread } from "@/app/api/shop/route";
import type { RoomMessage } from "@/lib/band-room";
import { api, json, mediaUrl } from "@/components/client";
import { Price } from "@/components/price";
import { Elapsed } from "@/components/status";

const EXAMPLES = [
  "I'm Alex. Find a gift for my nephew who loves The Mandalorian, under $40, and hold it for pickup at 6.",
  "What Star Wars mugs do you have under $25?",
];

/** The human shopper's window: talk to your own agent; it shops for you in the Band room. */
export default function ShopPage() {
  const [thread, setThread] = useState<{ from: string; since: string; startedAt: number } | null>(null);
  const [data, setData] = useState<ShopThread>({ messages: [], hold: null });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!thread) return;
    let alive = true;
    const tick = async () => {
      try {
        const next = await api<ShopThread>(`/api/shop?from=${thread.from}&since=${encodeURIComponent(thread.since)}`);
        if (alive) {
          setData(next);
          setError(null);
        }
      } catch (err) {
        if (alive) setError((err as Error).message);
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [thread]);

  // Block body on purpose: Chrome's scrollIntoView now returns a Promise, and an effect must not return one.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [data.messages.length, data.hold]);

  async function send(text: string) {
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await api<{ messageId: string; sentAt: string }>("/api/shop", json({ text }));
      setDraft("");
      if (!thread) setThread({ from: res.messageId, since: res.sentAt, startedAt: Date.now() });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  const waiting = thread !== null && statusOf(data.messages) !== null;

  return (
    <div className="max-w-3xl mx-auto px-5 pt-6 flex flex-col gap-5 min-h-screen">
      <header className="flex items-center gap-4 pb-4 border-b border-line">
        <div className="wide w-12 h-12 shrink-0 rounded-full bg-accent text-white flex items-center justify-center text-xl font-bold" aria-hidden>A</div>
        <div>
          <h1 className="text-2xl md:text-3xl">Your shopping agent</h1>
          <p className="text-muted">Tell it what you need. It finds and holds it at real local stores, meeting their agents in Band.</p>
        </div>
        {thread && (
          <button
            onClick={() => {
              setThread(null);
              setData({ messages: [], hold: null });
            }}
            className="btn ml-auto"
          >
            New request
          </button>
        )}
      </header>

      <section className="flex-1 flex flex-col gap-4">
        {!thread && (
          <div className="flex flex-col gap-3 py-6">
            <p className="text-lg text-muted">Try one of these, or write your own:</p>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                onClick={() => setDraft(example)}
                className="panel text-left text-lg px-5 py-4 hover:border-accent"
              >
                {example}
              </button>
            ))}
          </div>
        )}
        {data.messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        {data.hold && <HoldCard hold={data.hold} />}
        {waiting && (
          <div className="flex items-center gap-3 font-semibold text-ink" role="status">
            <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" aria-hidden />
            {statusOf(data.messages)} <Elapsed since={thread.startedAt} />
          </div>
        )}
        {error && <p className="notice notice-error">{error}</p>}
        <div ref={bottom} />
      </section>

      <form
        className="sticky bottom-0 bg-paper pt-2 pb-4 flex gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          rows={2}
          placeholder={thread ? "Reply to your agent…" : "What are you shopping for?"}
          aria-label="Message to your agent"
          className="field flex-1 resize-none text-lg px-4 py-3"
        />
        <button
          disabled={sending || !draft.trim()}
          className="btn btn-primary btn-lg"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}

/** What the agents are doing now, from the latest message; null once your agent has answered you. */
function statusOf(messages: RoomMessage[]): string | null {
  const last = messages.at(-1);
  if (!last) return "Sending your request into Band…";
  if (last.from === "shopper" && last.to.includes("you")) return null;
  if (last.from === "you") return "Your agent is reading your request…";
  if (last.from === "shopper") return "Your agent is asking the store in Band…";
  if (last.from === "store") return "The store answered. Your agent is deciding…";
  return "Working…";
}

const NAMES = { you: "You", shopper: "Your agent", store: "Store agent", other: "Someone" };

function Message({ message: m }: { message: RoomMessage }) {
  if (m.from === "you") {
    return <div className="self-end max-w-[85%] bg-accent text-white rounded-2xl rounded-br-sm px-5 py-3 text-lg">{m.text}</div>;
  }
  if (m.from === "shopper" && m.to.includes("you")) {
    return (
      <div className="self-start max-w-[85%] bg-surface border border-line rounded-2xl rounded-bl-sm px-5 py-3">
        <div className="text-sm font-semibold text-accent mb-1">Your agent</div>
        <p className="text-lg leading-snug whitespace-pre-line">{m.text}</p>
      </div>
    );
  }
  // Agent-to-agent traffic, as it happened in the Band room.
  return (
    <div className="mx-4 md:mx-10 border-l-2 border-line pl-4 py-1 text-[0.95rem] text-muted">
      <div className="text-sm font-semibold mb-1">
        {NAMES[m.from]} to {m.to.map((t) => NAMES[t].toLowerCase()).join(" and ") || "the room"}, in Band
      </div>
      <p className="leading-snug whitespace-pre-line">{m.text.replace(/\*\*/g, "")}</p>
    </div>
  );
}

function HoldCard({ hold }: { hold: ShopHold }) {
  return (
    <div className="panel border-leaf border-2 p-5 flex gap-5 items-center">
      {(hold.image_path ?? hold.frame_path) && (
        // eslint-disable-next-line @next/next/no-img-element -- photos are served from data/
        <img src={mediaUrl((hold.image_path ?? hold.frame_path)!)} alt="" className="specimen w-28 h-28 rounded-lg object-contain p-1" />
      )}
      <div className="flex flex-col gap-1">
        <div className="text-leaf font-semibold">Reserved for pickup</div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="wide text-2xl font-bold leading-tight">{hold.product_name}</span>
          {hold.price_usd !== null && <Price usd={hold.price_usd} className="text-xl" />}
        </div>
        <div className="text-lg">
          Held for {hold.customer_name} until {hold.until_time} at {hold.store}. Pay at pickup.
        </div>
      </div>
    </div>
  );
}
