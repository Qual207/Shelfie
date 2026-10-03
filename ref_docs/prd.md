# Shelfie — PRD

Oct 3, 2026 · @Jason Shaye

Everything runs on one laptop: a Next.js app, a SQLite file, and two Band agent processes; ZooWork hosts the store agent and Band hosts the room.

## Stack

One language (TypeScript, Node 22.20+) because both sponsor SDKs are TypeScript-native.

| Layer | Choice | Why |
| --- | --- | --- |
| Web app | Next.js (App Router) + Tailwind, on localhost:3000 | Pages and API routes in one project |
| Database | SQLite via better-sqlite3, one file | Zero setup; shared by the web app and agent processes |
| Frame sampling | ffmpeg (server) for uploaded video; canvas (browser) for live webcam clips | Reliable, fast, no cloud dependency |
| Vision | ZooWork built-in image model if confirmed; otherwise a direct vision API (Claude or GPT) | One call per scan; ZooWork preferred for sponsor depth |
| Voice price entry | Browser Web Speech API → one LLM call that parses "the tote is twenty-two" into {product, price} | No extra service; Chrome supports it |
| Store agent | ZooWork Managed Agents, @zoowork-ai/sdk | Required sponsor; hosts the merchant agent |
| Agent room | Band, @band-ai/sdk (GenericAdapter for the store; built-in LLM adapter for the shopper) | Prize sponsor; cross-company agent room |
| Live updates to UI | Polling every 1 s from the web app | Simpler than SSE for a 3-hour build |
| Stretch: agent-browsable page | Server-rendered /catalog: plain HTML list, one link per product | For browsing agents that click through HTML |
| Hosting | Everything on one laptop; Band and ZooWork in their clouds | Band agents need long-running WebSocket processes, which serverless cannot hold |

Setup: install the ZooWork skill in your coding agent with `npx skills add SerendipityOneInc/zoowork-sdk-skills`; get the ZooWork key at platform.zoowork.ai and redeem credits; create two External agents at app.band.ai.

## Architecture

&#91;embedded content: Shelfie architecture · laptop, ZooWork, Band\]

The web app writes the catalog to SQLite; store-agent.ts relays each Band message to the ZooWork store agent and runs its tool calls against that same file.

## Data model

Four SQLite tables. The catalog records which products are on the shelf and when each was last seen; it has no unit counts.

| Table | Fields |
| --- | --- |
| products | id, name, description (generated), category, price\_usd (nullable), price\_source (tag / owner\_typed / owner\_voice), location, frame\_path, confidence (0–1), status (pending / approved), on\_shelf (bool), last\_seen\_at, created\_at |
| scans | id, kind (initial / rescan), video\_path, frames\_json, raw\_result\_json, created\_at |
| holds | id, product\_id, customer\_name, until\_time, created\_at |
| questions | id, from\_agent, text, proposed\_product\_ids\_json, created\_at |

Store info (name, address, hours) lives in a constants file, using the real store's details.

Rules: `search_catalog` returns approved products only; products with `on_shelf = false` are returned flagged, so the agent can say "no longer on the shelf as of …" and offer alternatives. A rescan sets `last_seen_at = now` on every product it sees.

## Vision pipeline

Two single-call prompts do all the vision work: one for a first scan, one for a rescan. No separate dedupe pipeline.

**Frames:** 8–12 frames spread evenly across the video (ffmpeg `fps` filter sized to the clip length), resized to about 1024 px wide, numbered 0..N.

**Scan prompt** (frames attached):

```markdown
These frames are from one continuous video of a small store's shelves.
List every DISTINCT product. The same product in several frames is ONE product.
For each, write a short shopper-facing description (what it is, material, design, who it suits).
Return JSON only: {"products":[{"name","description","category",
"price_usd"|null,"location","best_frame":int,"confidence":0-1}]}
Only report a price you can read on a tag. Never guess prices.
```

**Rescan prompt** (new frames + current approved catalog as JSON):

```markdown
Here is the store's current catalog and new frames of the same shelves.
For each catalog product return whether it appears in the new frames: seen or not_seen.
Then list any NEW products not in the catalog, in the scan format.
Return JSON only: {"updates":[{"id","status":"seen|not_seen"}],"new_products":[...]}
```

**Applying a rescan:** seen → on\_shelf = true, last\_seen\_at = now; not\_seen → on\_shelf = false; new → pending products for review. The UI shows the diff as Gone from shelf / New before the owner taps Apply.

**Missing prices:** after a scan, products with price\_usd = null are flagged. The owner types a price, or taps the mic and speaks ("the Alcatraz tote is twenty-two"); one LLM call maps the transcript to {product\_id, price\_usd} against the list of unpriced products.

**Reliability rules:** strip code fences before parsing JSON; retry once on parse failure; temperature 0. Keep demo shelves to one row, products spaced apart and facing the camera.

## Store agent and Band

The store agent is a ZooWork managed agent; a small Node process (`store-agent.ts`) connects it to Band and runs its tools against SQLite.

**Store agent (ZooWork), created once at setup:**

- **Model:** a fast, strong tool-calling model from ZooWork's built-in list.
- **Instructions:** "You are the agent for \[store name\], \[address\]. Recommend only products returned by your tools. Match the shopper's stated needs (recipient, interests, budget, size) and give 2–3 options, each with price and one line on why it fits. Always say when a product was last seen on the shelf. If a product is no longer on the shelf, say so and offer the closest alternative. Never invent products or prices."
- **Tools (custom, executed by store-agent.ts):**

| Tool | Input | Returns |
| --- | --- | --- |
| search\_catalog | query (free text), max\_price\_usd?, category? | Approved products: id, name, description, price, on\_shelf, last\_seen\_at |
| get\_product | product\_id | One product in full |
| place\_hold | product\_id, customer\_name, until\_time | Hold id and confirmation; writes to holds |
| store\_info | none | Name, address, hours |

search\_catalog does a simple keyword and category match over name, description and category; with under 50 products, it can also return the whole catalog and let the model choose.

**Band setup:**

- Two External agents at app.band.ai: `presidio-souvenirs` (store) and `shopper-agent`.
- One room created before the demo with both agents and a teammate's human account.
- `store-agent.ts`: GenericAdapter handler → forward the message text to the store agent's ZooWork session (one session per room) → handle tool calls → post the final reply with `tools.sendMessage`, @mentioning the sender.
- `shopper-agent.ts`: Band's built-in Anthropic or OpenAI adapter, prompt: "You are a personal shopping agent for Alex. When Alex asks for something, ask @presidio-souvenirs, compare its options against Alex's request, pick the best one and ask for a hold if Alex wants pickup. Report back to Alex."

**Message flow in the room:**

1. Teammate (as Alex): "@shopper-agent find a gift for my mom, she loves SF history, under $25, and hold it for pickup at 6."
2. Shopper agent: "@presidio-souvenirs looking for an SF-history gift under $25 for a mom. What do you have on the shelf?"
3. Store agent (search\_catalog): 2–3 options with prices, reasons and last-seen times.
4. Shopper agent picks one: "@presidio-souvenirs please hold the Golden Gate history mug for Alex until 6 PM."
5. Store agent (place\_hold): "Held until 6 PM."
6. Shopper agent reports to Alex.

Each agent writes `questions` and `holds` rows as it goes, which feeds the dashboard.

## Web app

Three pages (plus one stretch) and five API routes; the left half of the demo screen is this app.

| Page | What it shows |
| --- | --- |
| /scan | Upload video or record from webcam; progress; product cards with best frame, name, description, price (or a "price needed" flag); Approve / Edit / Delete; mic button for spoken prices |
| /catalog-admin | Approved catalog grid with on-shelf status and last seen; Rescan button; diff panel (Gone from shelf / New) with Apply |
| /dashboard | Products listed, agent questions, holds; the latest holds list |
| /catalog (stretch) | Plain HTML, almost text-only: store info and one list item per product, for browsing agents |

| Route | Does |
| --- | --- |
| POST /api/scan | Save video → ffmpeg frames → scan prompt → insert pending products |
| POST /api/rescan | Save clip → frames → rescan prompt with catalog → return diff |
| POST /api/rescan/apply | Apply a diff |
| POST /api/price-voice | Transcript → {product\_id, price\_usd} → update product |
| GET /api/state | Products, holds, question count; polled every 1 s |

Design: large product photos, clean cards, one accent color. Judges see it from across a room, so use a 16 px minimum font and high contrast.

## Build order

Three hours, two parallel tracks; the integration risk is attacked first.

| Time | Track A: agents | Track B: app + vision |
| --- | --- | --- |
| 0:00–0:20 | Ask a ZooWork mentor: image input on built-in models? How do custom tool results return to a run? Create both Band agents and the room | Next.js + SQLite scaffold; record or collect the store video |
| 0:20–1:15 | store-agent.ts: Band @mention → ZooWork session → reply, with one dummy tool | /api/scan + /scan page: frames, scan prompt, cards, Approve/Edit |
| 1:15–2:00 | Real tools on SQLite; shopper-agent.ts; full need → options → hold flow in the room | Rescan + diff + Apply; process the real store video into a clean catalog |
| 2:00–2:30 | Tune the store agent's prompt on the demo request; latency pass | Voice price entry; dashboard; visual polish |
| 2:30–3:00 | Feature freeze. Rehearse the demo script five times; record one full successful run as backup | Same |

A third person owns the store video, the mini shelf, the pitch, and the stretch /catalog page.

**Open questions to settle in the first 20 minutes:**

- Does a ZooWork session accept image input on built-in models? If not, vision calls a direct API.
- Are ZooWork custom tools executed in our process (SDK returns the call), or must ZooWork reach a public URL? If a URL, expose localhost with cloudflared.
- Can the store agent's adapter read prior room messages, or does each turn need the context passed in?
