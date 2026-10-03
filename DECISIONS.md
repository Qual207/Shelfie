# Decisions

Assumptions, SDK findings and fallbacks, in the order they came up. Scope was kept to what the 3-minute demo needs.

## Environment

- Node 22.16.0 is installed; the PRD says 22.20+. Band SDK needs ≥ 22.12, better-sqlite3 ≥ 22, ZooWork ≥ 20, so everything runs on 22.16. Upgrading is optional.
- pnpm 11: `fetchTimeout: 600000` in `pnpm-workspace.yaml`. On slow Wi-Fi the 35–42 MB `next` and `@next/swc` tarballs exceeded the 60 s default and the install failed. pnpm itself added `minimumReleaseAgeExclude` for `@zoowork-ai/sdk@0.10.2` (published less than a day ago).
- The ZooWork coding skill was not installed globally (no writes outside the project); it was read from GitHub (`SerendipityOneInc/zoowork-sdk-skills`) instead.
- Next 16.3.8, React 19.2.8, Tailwind 4, TypeScript 5.9 (the create-next-app defaults). System fonts, so the demo laptop needs no font download.

## ZooWork (SDK 0.10.2), all live-verified unless noted

- Lifecycle: `createAgent` → `startAgent` → `waitUntilRunning` (desired_state). Sessions: one per conversation; `streamEvents` does not end at turn end, so we break on `run.finished` and resume later turns from the saved cursor.
- **Custom tools:** declared in `resource.custom_tools`. The run emits `agent.custom_tool_use` (phase `requested`) and pauses; our process runs the tool and calls `resolveCustomToolCall(agentId, callId, { content })`. Results are JSON blocks. Verified by `scripts/test-zoowork.ts` (5.8 s per turn incl. session creation on Haiku 4.5). No public URL or tunnel is needed.
- **Images:** `user.message` content is string-only and there is no binary upload API, but custom tool results accept 1–16 base64 image blocks (≤ 4 MiB each, ≤ 8 MiB total). Verified: the model read "MUG $17" and a red square from an image returned by a tool. So **vision runs on ZooWork**; no Anthropic API key is used (none was provided).
- Models: store and shopper use `litellm/claude-haiku-4-5` (fast tool calling, verified). Vision and voice pricing use `litellm/claude-sonnet-5-5`: stronger vision, same Anthropic API path as the verified image test. The catalog's default image model is `gemini-3-flash-preview`; its image-in-tool-result path was not verified, and the brief was a stable demo over model comparison. Switch by editing `model` in `lib/vision.ts`.
- Temperature is not configurable through the public Agent config, so "temperature 0" is not possible. Mitigation: JSON-only instructions with placeholder formats, fence stripping, one retry in the same session, and normalizing every field (prices never guessed: missing or non-numeric → null).
- Instructions go in `persona.docs` as `AGENTS.md` (only canonical doc names reach the model). `tool_policy.allow` lists only our custom tools (the shopper denies all), and global skills are off, so agents cannot wander into web search or the sandbox.
- Agents are found by labels `{app: "shelfie", role}` and updated on every process start, so prompt edits deploy on restart. Concurrent creates can 503; we retry with the same idempotency key. Existing agents: `presidio-souvenirs`, `shelfie-vision`; `shopper-agent` is created on first start.
- Custom tool timeouts are 30–60 s, so a crashed process cannot park a run for the default 10 minutes. A failed turn drops that room's session so the next message starts clean.
- Measured on the seed catalog: demo request 11.6 s cold (includes agent start), 7.1 s warm with a tool call; voice price 8.1 s cold. Warm replies meet the < 8 s target only narrowly; the Demo doc's "send while still on beat 3" fallback covers it.

## Band (SDK 0.5.0), from source; not live-verified (no credentials yet)

- `loadAgentConfigFromEnv({ prefix: "STORE" })` reads `STORE_AGENT_ID` / `STORE_API_KEY` (same for `SHOPPER`).
- The runtime's `autoSubscribeExistingRooms` defaults to **false**; both agents set it to true so they join the pre-created room after a restart.
- Agents only receive messages that @mention them; each room is processed one message at a time.
- Agent handles look like `@<owner>/<agent-name>`, so nothing hardcodes `@presidio-souvenirs`: replies mention the sender by participant id, and the shopper finds the store agent in the room by `STORE_AGENT_ID`. The text also starts with `@handle`.
- The shopper's reasoning is a second ZooWork agent rather than Band's built-in Anthropic/OpenAI adapter (those need provider keys). It returns `{"to": "store" | "requester", "message"}` and the process posts it with the right @mention. At most 4 store messages per request, so two agents can never loop on stage.

## Product and data

- SQLite schema per PRD, with `CREATE TABLE IF NOT EXISTS` instead of migrations (hackathon scope). Additions: `scans.shelf` + `products.scan_id` (a rescan only compares against products from the same shelf, so rescanning the mini shelf never marks the store-video products as gone); `scans.applied_at` (no double apply); `products.off_shelf_at` (when a rescan first missed it, so the agent says "no longer on the shelf as of just now"). If the schema changes, delete `data/`.
- `/scan` does initial scans (all products pending review). Beats 3 and 5 use the rescan on `/catalog-admin`: seen → on shelf and last seen at the rescan time, not seen → gone, new → pending. Stored rescans can be reopened under "Recorded rescans" for the Demo doc's fallback.
- Frames: 10 per scan (PRD: 8–12), long side ≤ 1024 px to stay under ZooWork's 8 MiB limit with portrait phone video. Webcam clips are 10 canvas frames over 5 s (no browser video encoding). Card photos are the full best frame (no cropping).
- `search_catalog` returns every approved product within budget (unpriced ones excluded when there is a budget), best keyword matches first, at most 15, with gone products flagged. It precomputes "last seen just now" style strings so the model never does time math.
- Each message the store agent answers is a `questions` row; `proposed_product_ids_json` holds the tool-returned products named in the reply. Hold `until_time` is the agent's free text ("6 PM today").
- ZooWork sessions are kept in memory per process. `pnpm reset` restores the DB in one transaction (safe while running) and reminds you to restart `pnpm demo` for fresh conversations.
- `lib/store-info.ts` has placeholder details ("Presidio Souvenirs") to replace with the real store's.
- Stretch `/catalog` is built: server-rendered, almost text-only list of on-shelf products.
