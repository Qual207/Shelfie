// The shopper UI's door into Band: posts the human's request into the demo room (as the
// human, through Band's account API) and reads the room back. The agents themselves run
// in agents/*.ts; nothing here talks to them directly.

const BASE = "https://app.band.ai/api/v1/me";

export type Party = "you" | "shopper" | "store" | "other";

export interface RoomMessage {
  id: string;
  from: Party;
  fromName: string;
  to: Party[];
  text: string;
  at: string;
}

interface BandMessage {
  id: string;
  content: string;
  sender_id: string;
  sender_type: string;
  sender_name: string | null;
  inserted_at: string;
  metadata?: { mentions?: { id: string; type?: string }[] };
}

function config() {
  const { BAND_API_KEY, BAND_ROOM_ID, SHOPPER_AGENT_ID, STORE_AGENT_ID } = process.env;
  if (!BAND_API_KEY || !BAND_ROOM_ID || !SHOPPER_AGENT_ID) {
    throw new Error("Set BAND_API_KEY, BAND_ROOM_ID and SHOPPER_AGENT_ID in .env (see README.md)");
  }
  return { apiKey: BAND_API_KEY, roomId: BAND_ROOM_ID, shopperId: SHOPPER_AGENT_ID, storeId: STORE_AGENT_ID };
}

async function band<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { apiKey } = config();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Band ${res.status}: ${body.slice(0, 200)}`);
  return JSON.parse(body) as T;
}

let shopperHandle: string | undefined;

/** Posts the human's message into the room, @mentioning the shopper agent. Returns its id. */
export async function sendToShopper(text: string): Promise<string> {
  const { roomId, shopperId } = config();
  if (!shopperHandle) {
    const { data } = await band<{ data: { id: string; handle: string }[] }>(`/chats/${roomId}/participants`);
    shopperHandle = data.find((p) => p.id === shopperId)?.handle;
    if (!shopperHandle) throw new Error("The shopper agent is not in the Band room set as BAND_ROOM_ID");
  }
  const { data } = await band<{ data: { id: string } }>(`/chats/${roomId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      message: { content: `@${shopperHandle} ${text}`, mentions: [{ id: shopperId, handle: shopperHandle }] },
    }),
  });
  return data.id;
}

/** The room's messages from `firstId` (inclusive) onward, oldest first. */
export async function roomMessagesFrom(firstId: string): Promise<RoomMessage[]> {
  const { roomId, shopperId, storeId } = config();
  const { data } = await band<{ data: BandMessage[] }>(`/chats/${roomId}/messages?page_size=50`); // newest first
  const start = data.findIndex((m) => m.id === firstId);
  if (start === -1) return [];

  const party = (id: string, type?: string): Party =>
    id === shopperId ? "shopper" : id === storeId ? "store" : type?.toLowerCase() === "user" ? "you" : "other";
  return data
    .slice(0, start + 1)
    .reverse()
    .map((m) => ({
      id: m.id,
      from: party(m.sender_id, m.sender_type),
      fromName: m.sender_name ?? m.sender_type,
      to: (m.metadata?.mentions ?? []).map((x) => party(x.id, x.type)),
      text: m.content.replace(/@\[\[[^\]]+\]\]\s*/g, "").replace(/^\s*@\S+\s+/, "").trim(),
      at: m.inserted_at,
    }));
}
