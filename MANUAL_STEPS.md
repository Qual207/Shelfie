# Manual steps

Everything below has to be done by hand, in order. **[BLOCKING]** marks steps the demo cannot run without.
Run all commands from the project folder.

## Not yet verified live

- **Band.** There are no Band credentials in `.env`, so neither agent has connected to a Band room. The store and shopper processes are built from the Band SDK source (GenericAdapter, `loadAgentConfigFromEnv` with `STORE`/`SHOPPER` prefixes, @mention by participant id) but the room exchange has not run. Step 6 verifies it.
- **Vision on a real video.** The scan and rescan prompts have not run on real shelf footage yet. What *is* verified: frames sent to a ZooWork agent as images through a custom tool are read correctly (`pnpm test:zoowork`). Step 7 verifies the real thing.
- **Browser hardware.** Webcam recording, the mic button (Chrome Web Speech) and playback of your video file were not tested (no camera/mic here). The server side of voice pricing was verified.
- **Verified:** ZooWork agent lifecycle and custom tool round trip; store agent answers to "a gift for my mom who loves SF history, under $25" on the seed catalog (2–3 fitting options with prices, reasons and last-seen times), the hold, and the "no longer on the shelf as of just now" answer after a rescan; voice price mapping ("the Alcatraz tote is twenty-two" → $22); all pages and API routes; typecheck, lint, 16 unit tests, production build.

## 1. Check the setup (already done on this laptop)

```bash
node --version      # 22.16 works (SDKs need >= 22.12); the PRD's 22.20+ is optional
pnpm install        # only if node_modules is missing
pnpm test:zoowork   # ~20 s: should print PASS twice
```

If `test:zoowork` fails with a credits or 401 error, add credits / rebind the key at https://platform.zoowork.ai. **[BLOCKING]**

## 2. Create the two Band agents **[BLOCKING]**

1. Go to https://app.band.ai and sign in.
2. **Agents → New agent → External** (the hacker guide calls it "Remote Agent").
   - Name: `presidio-souvenirs`. Description: "Agent for Presidio Souvenirs. Recommends products that are on the shelf right now."
   - Copy the **API key** (shown once) and the **Agent UUID** from its details page.
3. Create a second External agent named `shopper-agent` ("Alex's personal shopping agent"). Copy its key and UUID.
4. Open `.env` and add (keep `ZOOWORK_API_KEY` as is):

   ```
   STORE_AGENT_ID=<presidio-souvenirs UUID>
   STORE_API_KEY=<presidio-souvenirs key>
   SHOPPER_AGENT_ID=<shopper-agent UUID>
   SHOPPER_API_KEY=<shopper-agent key>
   ```

## 3. Create the Band rooms **[BLOCKING]**

1. In Band, create a chat room for the demo. Add participants: **presidio-souvenirs**, **shopper-agent**, and your teammate's human account (Alex). If the teammate is in a different Band account, send them a contact request first.
2. Create a second room with both agents for the warm-up message and the "rehearsal room" fallback.

## 4. Put in the real store's details **[BLOCKING]**

Edit `lib/store-info.ts`: real store name, address, hours. The store agent picks this up on its next start.

## 5. Start everything

```bash
pnpm demo
```

This builds the app (~1 min), then runs three processes with labelled logs: `[web]` on http://localhost:3000, `[store]`, `[shopper]`. Wait for both `ZooWork … agent is running. Connecting to Band…` lines.
To stop: Ctrl+C. (For hot reload while editing, use `pnpm demo:dev`.)

## 6. Verify a live Band exchange **[BLOCKING]**

You can test with the sample catalog before you have your own:

```bash
pnpm seed          # loads fixtures/seed-catalog.json (replaces the catalog!)
```

In the Band web app, in the demo room, as Alex:

```
@shopper-agent find a gift for my mom, she loves SF history, under $25, hold it for pickup at 6
```

Expect, in order: shopper asks @presidio-souvenirs → store replies with 2–3 options (prices, reasons, last seen) → shopper asks to hold one → store confirms the hold → shopper reports back to Alex. Each store reply should take under ~10 s. The `[store]` and `[shopper]` terminal logs show every message, and http://localhost:3000/dashboard shows the question and the hold.

If an agent never answers: check it is a participant in the room, check its terminal for an error, restart `pnpm demo`. Agents only see messages that @mention them.

## 7. Process your store video **[BLOCKING]**

1. **Make sure the browser can play it.** Chrome plays H.264 MP4. An iPhone `.mov` is usually HEVC and will not play (the scan still works, but you need playback for beat 2). Convert it once:

   ```bash
   ffmpeg -i "C:\path\to\your-video.mov" -c:v libx264 -crf 23 -preset fast -an -movflags +faststart store.mp4
   ```

2. If you ran `pnpm seed` in step 6, clear the sample data first: stop `pnpm demo`, delete the `data` folder, start `pnpm demo` again.
3. Open http://localhost:3000/scan.
4. **Shelf:** type `Store shelves` (any name works; it groups products).
5. Click **Upload video** and pick your file. You'll see "Reading the shelf with ZooWork vision… N s"; expect about 20–40 s. Product cards appear on the right with the video on the left (1x/2x toggle).
6. Review every card: **Edit** wrong names or descriptions, **Delete** false positives, type missing prices in the **Price needed** box.
   - Write down "found N of M products" for the judge Q&A.
   - For the demo, leave **one** product without a price (the voice moment, e.g. the Alcatraz tote) and leave **two** products unapproved ("approve two"). Approve the rest.
7. If the scan errors, the message is shown on the page and in the `[web]` log. Retry once; if it keeps failing, send me the error.

## 8. Set up and scan the mini shelf **[BLOCKING]**

1. Put the 5–6 souvenirs in one row, spaced apart, facing the camera; mark positions with tape. Include the Golden Gate history mug and the SF history postcard set (or magnet). Keep the "new arrival" item **off** the shelf.
2. On /scan: **Shelf:** `Mini shelf` → **Use webcam** (allow camera) → **Record 5 s**, or upload a short phone clip.
3. Approve all, fix names so they read exactly as you want the agents to say them (e.g. "Golden Gate history mug"), and give the mug and the postcard set prices under $25.
4. Check the store agent's answer without Band, as many times as you like:

   ```bash
   pnpm ask-store
   pnpm ask-store "find an SF history gift for my mom under $25" "please hold the Golden Gate history mug for Alex until 6 PM"
   ```

   The rehearsal goal: the mug and the postcard set are the only SF-history options under $25. Edit descriptions or names until the answer is consistent.

## 9. Record the fallback rescans (recommended)

On http://localhost:3000/catalog-admin, **Shelf:** `Mini shelf`:

1. Put the new-arrival item on the shelf, **Record 5 s**, check the diff shows **New: <item>**, do **not** click Apply.
2. Take the new arrival **and** the mug off, record again, check the diff shows **Gone from shelf: Golden Gate history mug** only, do **not** Apply.
3. Put the shelf back to its pre-demo state (mug on, new arrival off).

During the demo, if a live rescan misreads, pick that clip from **Recorded rescans** and click Apply (and say it's from rehearsal).

## 10. Test the voice price

In **Chrome** on /scan, click **🎤 Say a price**, allow the mic, and say "the Alcatraz tote is twenty-two" (use your unpriced product's name). The card fills in. Test it in the presentation room's noise. If it fails, type the price on the card.
Then remove the price again for the demo (Edit → clear Price → Save).

## 11. Save the pre-demo snapshot **[BLOCKING]**

When the catalog is exactly how the demo should start (one unpriced product, two pending, mini shelf without the new arrival, no stray holds):

```bash
pnpm snapshot
```

## 12. Before every rehearsal and the real demo

```bash
pnpm reset         # restores the snapshot (safe while running)
# then Ctrl+C and restart, so both agents start fresh conversations:
pnpm demo
```

Right before going on, send a warm-up in the second room: `@presidio-souvenirs what are your hours?`

Driver's messages, saved for paste:

```
@shopper-agent find a gift for my mom, she loves SF history, under $25, hold it for pickup at 6
@shopper-agent I'm Sam. Find a gift for my mom, she loves SF history, under $25, hold it for pickup at 6
```

## 13. Rehearse (from the Demo doc)

- Left window: http://localhost:3000/scan → /catalog-admin (beats 3 and 5: rescan with **Use webcam → Record 5 s**, then **Apply**) → /dashboard. Right window: the Band room.
- Browser zoom 125%+, check readability from the back row; test lighting for the webcam.
- Run the full script five times; ready when three runs in a row finish under 3:15 with no fallback.
- Record one full successful run as the backup (laptop and phone).

## Credentials, credits and permissions

- ZooWork: key in `.env`; Organization credits at https://platform.zoowork.ai. Three ZooWork agents exist or will be created automatically: `presidio-souvenirs`, `shopper-agent`, `shelfie-vision`.
- Band: free tier (up to 10 agents), the two External agents, the teammate's account in the room.
- Chrome: camera and microphone permission for localhost.
- The store's permission to film.
