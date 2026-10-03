"use client";

import { useEffect, useRef, useState } from "react";
import type { ShopHold, ShopThread } from "@/app/api/shop/route";
import type { RoomMessage } from "@/lib/band-room";
import { api, json, mediaUrl } from "@/components/client";
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
    <div className="max-w-3xl mx-auto flex flex-col gap-5 min-h-[calc(100vh-3rem)]">
      <header className="flex items-center gap-4 pb-4 border-b border-line">
        <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center text-2xl font-black">S</div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Your shopping agent</h1>
          <p className="text-muted">Tell it what you need. It finds and holds it at real local stores, meeting their agents in Band.</p>
        </div>
        {thread && (
          <button
            onClick={() => {
              setThread(null);
              setData({ messages: [], hold: null });
            }}
            className="ml-auto px-4 py-2 rounded-lg border border-line font-semibold hover:bg-white"
          >
            New request
          </button>
        )}
      </header>

      <section className="flex-1 flex flex-col gap-4">
        {!thread && (
          <div className="flex flex-col gap-3 py-6">
            <p className="text-xl text-muted">Try:</p>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                onClick={() => setDraft(example)}
                className="text-left text-lg bg-white border border-line rounded-xl px-5 py-4 hover:border-accent"
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
          <div className="flex items-center gap-3 text-lg font-semibold text-ink">
            <span className="w-3 h-3 rounded-full bg-accent animate-pulse" />
            {statusOf(data.messages)} <Elapsed since={thread.startedAt} />
          </div>
        )}
        {error && <p className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-800 font-medium">{error}</p>}
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
          className="flex-1 resize-none border-2 border-line focus:border-accent outline-none rounded-xl px-4 py-3 text-lg bg-white"
        />
        <button
          disabled={sending || !draft.trim()}
          className="px-6 rounded-xl bg-accent hover:bg-accent-dark text-white text-lg font-bold disabled:opacity-40"
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
    return <div className="self-end max-w-[85%] bg-ink text-white rounded-2xl rounded-br-sm px-5 py-3 text-lg">{m.text}</div>;
  }
  if (m.from === "shopper" && m.to.includes("you")) {
    return (
      <div className="self-start max-w-[85%] bg-white border-2 border-accent rounded-2xl rounded-bl-sm px-5 py-3">
        <div className="text-sm font-bold text-accent mb-1">Your agent</div>
        <p className="text-lg leading-snug whitespace-pre-line">{m.text}</p>
      </div>
    );
  }
  // Agent-to-agent traffic, as it happened in the Band room.
  return (
    <div className="mx-6 rounded-xl bg-zinc-100 border border-line px-4 py-3">
      <div className="text-sm font-semibold text-muted mb-1">
        In Band · {NAMES[m.from]} ({m.fromName}) → {m.to.map((t) => NAMES[t]).join(", ")}
      </div>
      <p className="leading-snug whitespace-pre-line">{m.text.replace(/\*\*/g, "")}</p>
    </div>
  );
}

function HoldCard({ hold }: { hold: ShopHold }) {
  return (
    <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-600 p-5 flex gap-5 items-center">
      {(hold.image_path ?? hold.frame_path) && (
        // eslint-disable-next-line @next/next/no-img-element -- photos are served from data/
        <img src={mediaUrl((hold.image_path ?? hold.frame_path)!)} alt="" className="specimen w-32 h-32 rounded-xl object-contain p-1" />
      )}
      <div className="flex flex-col gap-1">
        <div className="text-emerald-800 font-bold text-lg">✓ Reserved for pickup</div>
        <div className="text-2xl font-extrabold leading-tight">{hold.product_name}</div>
        <div className="text-lg">
          {hold.price_usd !== null && <b>${hold.price_usd.toFixed(2)} · </b>}
          Held for {hold.customer_name} until {hold.until_time} at {hold.store}. Pay at pickup.
        </div>
      </div>
    </div>
  );
}
