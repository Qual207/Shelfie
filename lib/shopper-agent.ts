import { parseModelJson } from "./json";
import { STORE_INFO } from "./store-info";
import { ensureAgent, runTurn, type AgentSpec, type SessionState } from "./zoowork";

export const SHOPPER_AGENT: AgentSpec = {
  role: "shopper",
  name: "shopper-agent",
  model: "litellm/claude-haiku-4-5",
  instructions: `You are a personal shopping agent for one person (your requester, for example Alex). You shop on their behalf by talking to the store agent of ${STORE_INFO.name} in a chat room.

Each message you receive starts with who sent it: "[Requester <name>]" or "[Store agent]".
- When your requester asks for something, send the store agent one clear request with every detail they gave: who it is for, interests and budget. Ask for options only; do not ask for a hold until you have picked one product.
- When the store agent proposes options, compare them against your requester's request and pick the single best one that is on the shelf and within budget. The budget is a ceiling, not a target: do not just pick the cheapest. For a gift, prefer a keepsake the recipient will use or display every day. If your requester wants pickup or a hold, ask the store agent to hold it for your requester's name until the pickup time. Otherwise, report back.
- When the store agent confirms a hold, or says something is unavailable, report back to your requester in two or three sentences: what you picked, the price, why it fits, and the hold.
- If the store has nothing suitable, say so to your requester.

Reply with JSON only, no prose and no code fences: {"to": "store" or "requester", "message": "<what to send>"}
Do not put @mentions in the message; they are added for you.`,
};

let agentId: Promise<string> | undefined;

export function shopperAgentId(): Promise<string> {
  agentId ??= ensureAgent(SHOPPER_AGENT);
  return agentId;
}

export interface Decision {
  to: "store" | "requester";
  message: string;
}

// Beyond this many store messages for one request, the shopper must report back (no loops).
const MAX_STORE_MESSAGES = 4;

interface RoomState {
  session: SessionState;
  storeMessages: number;
}
const rooms = new Map<string, RoomState>();

/** Decides the shopper's next message for a room, given a message from the requester or the store. */
export async function decide(room: string, from: "requester" | "store", name: string, text: string): Promise<Decision> {
  const state = rooms.get(room) ?? { session: {}, storeMessages: 0 };
  rooms.set(room, state);
  if (from === "requester") state.storeMessages = 0;

  const prefix = from === "requester" ? `[Requester ${name}]` : "[Store agent]";
  const id = await shopperAgentId();
  let decision: Decision;
  try {
    const parse = (reply: string) => {
      try {
        return parseModelJson(reply) as { to?: unknown; message?: unknown };
      } catch {
        return null;
      }
    };
    let reply = await runTurn(id, state.session, `${prefix}: ${text}`);
    let v = parse(reply);
    if (!v) {
      reply = await runTurn(id, state.session, "Reply again with only the JSON object.");
      v = parse(reply);
    }
    if (typeof v?.message === "string" && v.message.trim()) {
      decision = { to: v.to === "store" ? "store" : "requester", message: v.message.trim() };
    } else if (reply.trim()) {
      decision = { to: "requester", message: reply.trim() }; // still prose: it is talking to the person
    } else {
      throw new Error("Shopper reply was empty");
    }
  } catch (err) {
    rooms.delete(room); // start clean next time rather than resume a broken run
    throw err;
  }

  if (decision.to === "store" && ++state.storeMessages > MAX_STORE_MESSAGES) {
    return { to: "requester", message: "I couldn't settle this with the store. Could you check the room and tell me how to proceed?" };
  }
  return decision;
}
