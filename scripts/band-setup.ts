// Registers the store and shopper agents on Band with your account key, writes their ids and
// keys into .env, and creates the "Shelfie demo" and "Shelfie warm-up" rooms with both agents.
// The demo room's id goes into .env as BAND_ROOM_ID (the /shop page posts there).
// Safe to re-run: agents already in .env and rooms that already exist are reused.
// Usage: pnpm band-setup   (needs BAND_API_KEY in .env: app.band.ai -> avatar -> Settings)
import { readFileSync, writeFileSync } from "node:fs";
import { STORE_INFO } from "@/lib/store-info";

const API = "https://app.band.ai/api/v1/me";
const ENV_FILE = ".env";
const ROOMS = ["Shelfie demo", "Shelfie warm-up"];
const AGENTS = [
  { prefix: "STORE", name: "presidio-souvenirs", description: `Store agent for ${STORE_INFO.name}. Sells what is on the shelf right now.` },
  { prefix: "SHOPPER", name: "shopper-agent", description: "Personal shopping agent for the Shelfie demo." },
];

const key = process.env.BAND_API_KEY;
if (!key) {
  console.error("Put your Band account API key in .env as BAND_API_KEY first (app.band.ai -> avatar -> Settings).");
  process.exit(1);
}
if (key.startsWith("band_a_")) {
  console.error("BAND_API_KEY is an agent key (band_a_...). Use your account key (band_u_...) from app.band.ai -> avatar -> Settings.");
  process.exit(1);
}

async function band<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "X-API-Key": key!, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return JSON.parse(text) as T;
}

/** Sets NAME=value in .env right away, so a key Band shows only once is never lost. */
function setEnv(name: string, value: string) {
  const env = readFileSync(ENV_FILE, "utf8");
  const line = `${name}=${value}`;
  const re = new RegExp(`^${name}=.*$`, "m");
  writeFileSync(ENV_FILE, re.test(env) ? env.replace(re, () => line) : `${env.trimEnd()}\n${line}\n`);
  process.env[name] = value;
}

for (const a of AGENTS) {
  if (process.env[`${a.prefix}_AGENT_ID`] && process.env[`${a.prefix}_API_KEY`]) {
    console.log(`Agent ${a.name}: already in .env`);
    continue;
  }
  const { data } = await band<{ data: { agent: { id: string }; credentials: { api_key: string } } }>(
    "POST", "/agents/register", { agent: { name: a.name, description: a.description } },
  );
  setEnv(`${a.prefix}_AGENT_ID`, data.agent.id);
  setEnv(`${a.prefix}_API_KEY`, data.credentials.api_key);
  console.log(`Agent ${a.name}: registered (${data.agent.id}), id and key saved to .env`);
}

const { data: chats } = await band<{ data: { id: string; title?: string }[] }>("GET", "/chats?limit=100");
for (const title of ROOMS) {
  let room = chats.find((c) => c.title === title);
  if (!room) {
    room = (await band<{ data: { id: string } }>("POST", "/chats", { chat: { title } })).data;
    console.log(`Room "${title}": created`);
  }
  const roomId = room.id;
  if (title === ROOMS[0] && !process.env.BAND_ROOM_ID) setEnv("BAND_ROOM_ID", roomId);
  const people = async () =>
    (await band<{ data: { id: string; name: string; handle?: string }[] }>("GET", `/chats/${roomId}/participants`)).data;
  const present = await people();
  for (const a of AGENTS) {
    const id = process.env[`${a.prefix}_AGENT_ID`]!;
    if (!present.some((p) => p.id === id)) {
      await band("POST", `/chats/${roomId}/participants`, { participant: { participant_id: id, role: "member" } });
    }
  }
  console.log(`Room "${title}": ${(await people()).map((p) => (p.handle ? `@${p.handle.replace(/^@/, "")}` : p.name)).join(", ")}`);
}
console.log("\nBand is set up. Start everything with: pnpm demo");
