# Shelfie

**One minute of video, and any small store can sell to AI shoppers.**

AI shopping agents can find anything on Amazon, but nothing on the shelves of a local gift shop. Small stores have no public catalog and no time to build one. Shelfie turns a short shelf video into an agent-ready catalog, then runs a store agent that sells only what is physically on the shelf right now.

Built for the ZooWork × Band hackathon: the store agent runs on **ZooWork**, and shopper agents meet it in a **Band** room.

---

## The pitch

| | |
| --- | --- |
| **Problem** | Shoppers are starting to arrive as agents. Most local merchants have nothing to answer them with. |
| **Owner flow** | Film the shelves → vision names, describes and prices each product → the owner approves (and speaks any missing prices) |
| **Agent flow** | A shopper agent asks for a gift; the store agent recommends only what is on the shelf, then places a hold |
| **Truth loop** | A rescan marks items gone or new, so the store agent's next answer changes with the shelf |
| **Not this** | Not a full inventory system. No unit counts, only what is on the shelf and when it was last seen |

---

## What it does

1. **Scan to catalog**: upload a shelf video or record from a webcam. Ten frames go to a vision agent in one turn, and each distinct product comes back named, described, categorized, priced (if a tag is readable) and linked to its best frame.
2. **Product photos**: a second vision agent finds each product's bounding box, and Shelfie crops a clean product photo from the frame.
3. **Owner review**: approve, edit or delete products. Missing prices are flagged; type them or say them out loud ("the Alcatraz tote is twenty-two").
4. **Rescan**: new frames plus the current catalog → seen / not seen / new. Applying the diff keeps the store agent's answers honest.
5. **Store agent**: recommends two or three products that fit a real need ("SF history gift under $25"), with prices and last-seen times, and can hold an item for pickup.
6. **Agent-to-agent**: the shopper agent and store agent negotiate in one Band room: need → options → pick → hold.
7. **Seller insights**: a dashboard of products, agent questions and holds, plus an analyst agent that reads shopping history and reports lost sales, unmet demand and recommendations.

---

## Architecture

```
Shelfie (this repo)
├── Next.js app     →  scan · review · rescan · dashboard · insights
├── SQLite          →  catalog, scans, holds, agent questions
├── store-agent     →  Band adapter ↔ ZooWork session + catalog tools
└── shopper-agent   →  Band adapter ↔ ZooWork session (talks to the store and the human)

Cloud
├── ZooWork  →  vision, imaging, store, shopper and analyst agents
└── Band     →  the room where shopper and store agents meet (@mentions)
```

- **Everything AI runs on ZooWork.** Frames reach the model as images returned by a custom tool, so no separate vision API key is needed.
- **One source of truth.** The web app and both agent processes share the same SQLite catalog, so an approved scan or applied rescan is visible to the store agent right away.
- **Both platforms are load-bearing.** Without Band, an outside agent has nowhere to reach the store. Without ZooWork, there is no AI merchant.

### Scan flow

```
shelf video ─▶ ffmpeg samples 10 frames ─▶ vision agent (get_frames tool)
            ─▶ products + best frames ─▶ imaging agent (bounding boxes) ─▶ cropped photos
            ─▶ owner review ─▶ approved catalog
```

### Shopping flow

```
human in Band ─▶ @shopper-agent ─▶ @store-agent
                                     ├── search_catalog  (approved items, gone ones flagged)
                                     ├── get_product
                                     ├── store_info
                                     └── place_hold      ─▶ hold saved in SQLite
               ◀── options + hold confirmation ◀──
```

### Agents

| Agent | Model | Role |
| --- | --- | --- |
| `shelfie-vision` | Claude Sonnet | Products from shelf frames; rescan diffs; spoken-price matching |
| `shelfie-imaging` | Gemini Flash | Product bounding boxes for photo crops |
| `presidio-souvenirs` | Claude Haiku | Store agent with catalog and hold tools |
| `shopper-agent` | Claude Haiku | Represents the human shopper in the Band room |
| `shelfie-analyst` | Strongest available Claude | Seller insights from shopping history |

---

## Tech stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router) · React 19 · Tailwind 4 |
| Database | SQLite via better-sqlite3 |
| Video frames | ffmpeg (uploads) · canvas (webcam) |
| Vision & agents | ZooWork Managed Agents (`@zoowork-ai/sdk`) |
| Agent room | Band (`@band-ai/sdk`) |
| Voice prices | Web Speech API → ZooWork matching |
| Runtime | Node 22 · TypeScript · pnpm · Vitest |

---

## Project layout

```
app/          Next.js pages and API routes
agents/       store and shopper agent processes (Band ↔ ZooWork)
lib/          vision, imaging, catalog, SQLite, ZooWork and Band helpers
components/   scan UI, webcam capture, voice price, charts
scripts/      seeding and maintenance scripts
fixtures/     sample catalog
tests/        unit tests
```

---

Built by **Jason Shaye** · October 2026 · ZooWork × Band hackathon
