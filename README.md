# Shelfie

One shelf video becomes an agent-ready catalog for a small store. A store agent on **ZooWork** sells from what is physically on the shelf to shopper agents in a **Band** room. Spec: `ref_docs/` (the Demo doc drives everything). Hand-run checklist: **MANUAL_STEPS.md**. Choices and SDK findings: **DECISIONS.md**.

## Setup

Requires Node 22.12+ (22.20+ recommended), pnpm, and ffmpeg/ffprobe on PATH.

```bash
pnpm install
cp .env.example .env   # then fill it in
```

| Variable | What |
| --- | --- |
| `ZOOWORK_API_KEY` | ZooWork Project API key (platform.zoowork.ai) |
| `STORE_AGENT_ID`, `STORE_API_KEY` | Band External agent for the store (`presidio-souvenirs`) |
| `SHOPPER_AGENT_ID`, `SHOPPER_API_KEY` | Band External agent for the demo shopper (`shopper-agent`) |

## Run everything

```bash
pnpm demo        # builds, then runs web (localhost:3000) + store agent + shopper agent with labelled logs
pnpm demo:dev    # same with next dev (hot reload)
```

Pages: `/` landing, `/scan` upload/record + review + voice price, `/catalog-admin` catalog + rescan diff + Apply, `/dashboard`, `/catalog` plain HTML for browsing agents.

## Demo reset

```bash
pnpm snapshot    # save the current DB as the pre-demo state
pnpm reset       # restore it (safe while running); then restart pnpm demo for fresh agent conversations
```

## Other commands

```bash
pnpm seed [fixture.json]   # load a test catalog (default fixtures/seed-catalog.json); replaces the catalog
pnpm ask-store "msg" ...    # talk to the ZooWork store agent without Band
pnpm test:zoowork [model]   # ZooWork smoke test: agent, session, custom tool round trip, image input
pnpm test                   # unit tests
pnpm typecheck && pnpm lint
```

Video playback needs H.264 MP4. Convert an iPhone `.mov` with
`ffmpeg -i in.mov -c:v libx264 -crf 23 -preset fast -an -movflags +faststart out.mp4`.

## How it fits together

- `app/api/scan`, `app/api/rescan`: save the upload, sample 10 frames with ffmpeg (or take 10 webcam frames from the browser), and send them to the `shelfie-vision` ZooWork agent as images returned by its `get_frames` custom tool. One turn per scan or rescan; JSON only, fences stripped, one retry.
- `agents/store-agent.ts`: Band GenericAdapter → one ZooWork session per room → runs `search_catalog`, `get_product`, `place_hold`, `store_info` against SQLite → replies with an @mention. Logs questions and holds.
- `agents/shopper-agent.ts`: Band GenericAdapter → a second ZooWork agent decides whether to message the store or report back → posts with a real @mention.
- `data/shelfie.db` (SQLite, WAL) is shared by the web app and both agents. `data/` also holds uploads, frames and the snapshot; it is git-ignored.
