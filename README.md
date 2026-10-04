# Shelfie

**One minute of video, and any small store can sell to AI shoppers.**

AI shopping agents can find anything on Amazon — and nothing on the shelves of a local gift shop. Small stores have no public catalog and no time to build one. Shelfie turns a short shelf video into an agent-ready catalog, then hosts a store agent that sells from what is physically on the shelf right now.

Built for the ZooWork × Band hackathon: the store agent runs on **ZooWork**; shopper agents meet it in a **Band** room.

---

## The pitch

| | |
| --- | --- |
| **Problem** | Shoppers arrive as agents. Most merchants have nothing to answer with. |
| **Owner flow** | Film the shelves → vision names, describes, and prices products → owner approves (and speaks any missing prices) |
| **Agent flow** | A shopper agent asks for a gift; the store agent recommends only what is on the shelf, then places a hold |
| **Truth loop** | A live rescan marks items gone or new — the store agent's next answer changes with the shelf |
| **Not this** | Not a full inventory system. No unit counts — only what is on the shelf and when it was last seen |

---

## What it does

1. **Scan to catalog** — Upload a shelf video (or record from webcam). Ten frames go to a ZooWork vision agent in one turn; each distinct product comes back named, described, categorized, priced if a tag is readable, with a best frame.
2. **Owner review** — Approve, edit, or delete. Missing prices are flagged; type them or hold the mic ("the Alcatraz tote is twenty-two").
3. **Rescan** — New frames + the current catalog → seen / not seen / new. Apply the diff; the store agent’s answers stay honest.
4. **Store agent (ZooWork)** — Tools: `search_catalog`, `get_product`, `place_hold`, `store_info`. Recommends 2–3 fits for a real need (“SF history gift under $25”), with prices and last-seen times.
5. **Agent-to-agent (Band)** — Shopper agent and store agent negotiate in one room: need → options → pick → hold.
6. **Dashboard & extras** — Products listed, agent questions, holds; plain `/catalog` HTML for browsing agents; `/shop` to send a human request into the Band room; `/insights` for post-demo analytics.

---

## How it fits together

```
Laptop (this repo)
├── Next.js app  →  scan / review / rescan / dashboard
├── SQLite       →  shared catalog, holds, questions
├── store-agent  →  Band GenericAdapter ↔ ZooWork session + tools
└── shopper-agent→  Band GenericAdapter ↔ ZooWork (routes store vs requester)

Cloud
├── ZooWork  →  vision agent + store agent + shopper reasoning
└── Band     →  room where the two agents meet (@mentions)
```

- Vision runs **on ZooWork** (images returned via a custom tool — no separate vision API key).
- Catalog lives in `data/shelfie.db` (git-ignored), shared by the web app and both agent processes.
- Remove Band and an outside agent has no place to reach the store. Remove ZooWork and there is no AI merchant.

---

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router) + React 19 + Tailwind 4 |
| DB | SQLite via better-sqlite3 |
| Frames | ffmpeg (uploads) · canvas (webcam) |
| Vision & agents | ZooWork Managed Agents (`@zoowork-ai/sdk`) |
| Agent room | Band (`@band-ai/sdk`) |
| Runtime | Node 22.12+ · pnpm · TypeScript |

---

## Quick start

**Requires:** Node 22.12+ (22.20+ recommended), pnpm, ffmpeg/ffprobe on `PATH`, Chrome for voice price entry.

```bash
pnpm install
cp .env.example .env   # fill in keys below
pnpm demo              # build + web (:3000) + store agent + shopper agent
```

For hot reload during development: `pnpm demo:dev`.

### Environment

| Variable | What |
| --- | --- |
| `ZOOWORK_API_KEY` | ZooWork Project API key ([platform.zoowork.ai](https://platform.zoowork.ai)) |
| `STORE_AGENT_ID`, `STORE_API_KEY` | Band External agent for the store (`presidio-souvenirs`) |
| `SHOPPER_AGENT_ID`, `SHOPPER_API_KEY` | Band External agent for the demo shopper (`shopper-agent`) |
| `BAND_API_KEY`, `BAND_ROOM_ID` | Band account key + demo room (used by `/shop` to post the human’s request) |

Create External agents and a room at [app.band.ai](https://app.band.ai). Step-by-step account setup: **MANUAL_STEPS.md**.

### Pages

| Route | Role |
| --- | --- |
| `/` | Landing / pitch |
| `/scan` | Upload or record · review cards · voice price |
| `/catalog-admin` | Approved catalog · rescan · diff · Apply |
| `/dashboard` | Products, questions, holds |
| `/shop` | Send a shopper request into the Band room |
| `/catalog` | Plain HTML catalog for browsing agents |
| `/insights` | Analytics from agent activity |

### Demo reset

```bash
pnpm snapshot    # save current DB as pre-demo state
pnpm reset       # restore it; restart `pnpm demo` for fresh agent conversations
```

### Other commands

```bash
pnpm seed [fixture.json]   # load a test catalog (default: fixtures/seed-catalog.json)
pnpm ask-store "msg"       # talk to the ZooWork store agent without Band
pnpm test:zoowork [model]  # ZooWork smoke test (agent, session, tools, image input)
pnpm test                  # unit tests
pnpm typecheck && pnpm lint
```

Video playback needs H.264 MP4. Convert an iPhone `.mov` with:

```bash
ffmpeg -i in.mov -c:v libx264 -crf 23 -preset fast -an -movflags +faststart out.mp4
```

---

## Demo (3 minutes)

Two windows side by side: Shelfie (`localhost:3000`) and the Band room.

1. **Hook** — Agents shop Amazon; local shelves are invisible.
2. **Store goes online** — Play a real shelf video; products appear; approve; voice-fill one missing price.
3. **Live scan** — New item on a mini shelf → listed in seconds.
4. **Agent meets agent** — In Band: gift for mom, SF history, under $25, hold for 6 PM → options → hold.
5. **Gone from shelf** — Remove the held item, rescan, ask again → agent says it’s gone and offers an alternative.
6. **Close** — Dashboard numbers. *One minute of video, and any small store can sell to AI shoppers.*

Full script, fallbacks, and judge Q&A: **DEMO_GUIDE.md** and `ref_docs/demo.md`.

---

## Project layout

```
app/           Next.js pages and API routes
agents/        store-agent.ts · shopper-agent.ts (Band ↔ ZooWork)
lib/           vision, catalog, SQLite, ZooWork/Band helpers
components/    scan UI, capture, voice price, cards
scripts/       seed, snapshot, reset, ask-store, ZooWork tests
fixtures/      seed catalogs for rehearsal
ref_docs/      MVP · PRD · demo script (source of truth for the build)
```

---

## Docs

| Doc | For |
| --- | --- |
| **DEMO_GUIDE.md** | How to run and present the demo |
| **MANUAL_STEPS.md** | One-time Band / ZooWork account setup |
| **DECISIONS.md** | SDK findings, model choices, fallbacks |
| `ref_docs/` | MVP scope, PRD, full demo script |

---

## Team

Built by **@Jason Shaye** · Oct 2026 · ZooWork × Band hackathon.
