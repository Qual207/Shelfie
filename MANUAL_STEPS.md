# Manual steps

What is left to do by hand, in order. **[BLOCKING]** marks steps the demo cannot run without.
Run all commands from the project folder.

## Already done (no action needed)

- Dependencies installed; typecheck, lint, 16 unit tests and the production build pass.
- ZooWork: smoke test passes (custom tool round trip + image input). Agents `presidio-souvenirs`, `shopper-agent` and `shelfie-vision` exist in your ZooWork project and update themselves on every start.
- **Band:** the two External agents were registered with your `BAND_API_KEY` (Band's Human API). Their IDs and keys are in `.env` as `STORE_*` / `SHOPPER_*` (handles `@jshaye/presidio-souvenirs`, `@jshaye/shopper-agent`). Two rooms exist with both agents and you as owner: **Shelfie demo** (kept clean for the demo) and **Shelfie warm-up** (used for the live test).
- **Live Band exchange verified** in Shelfie warm-up: request → 3 options → shopper picks the Golden Gate history mug → hold → report back. Store replies took 6.5–10.1 s.
- **Your video:** `IMG_2658.MOV` (HEVC, which Chrome can't play) was converted to `IMG_2658.mp4` (H.264). It was scanned as the shelf "Store shelves": 21 products in 31 s, all **pending your review** on /scan. Videos are git-ignored.

## Not yet verified live

- Webcam recording, the 🎤 voice-price button (Chrome Web Speech) and in-browser video playback (needs a camera/mic; the server side of voice pricing is verified).
- The mini-shelf rescan on real footage (the rescan logic is unit-tested and the vision path is verified on your video).

## 1. Start everything

```bash
pnpm demo
```

It builds (~1 min), then runs `[web]` http://localhost:3000, `[store]` and `[shopper]` with labelled logs. Wait for both `ZooWork … agent is running. Connecting to Band…` lines. Stop with Ctrl+C. Use `pnpm demo:dev` while editing (hot reload).

## 2. Put in the real store's details **[BLOCKING]**

Edit `lib/store-info.ts` (name, address, hours; the placeholder is "Presidio Souvenirs"). Restart `pnpm demo` so the agents pick it up.

## 3. Review your store scan **[BLOCKING]**

Open http://localhost:3000/scan (Chrome). The video plays on the left (1x/2x), the 21 cards on the right.
- **Delete** duplicates/groups you don't want, **Edit** names, type prices in **Price needed** (no tags were readable).
- For the demo: leave **one** product without a price (the voice moment) and **two** unapproved ("approve two"); approve the rest.
- Note "found N of M products" for judge Q&A.
- To redo it from scratch: stop `pnpm demo`, delete the `data` folder, start again, and upload `IMG_2658.mp4` on /scan (Shelf: `Store shelves`). Expect ~30 s.

## 4. Get your teammate into the demo room **[BLOCKING for the two-person script]**

In the Band web app, open **Shelfie demo** and add your teammate's account (the "Alex" driver); send them a contact request first if needed. Or drive it from your own account. The shopper uses the sender's Band display name for the hold, so with your account the hold says "Jason".

## 5. Set up and scan the mini shelf **[BLOCKING]**

1. Put 5–6 souvenirs in one row, spaced, facing the camera; tape the positions. Include an SF-history mug ("Golden Gate history mug") and a close alternative (SF history postcard set or magnet). Keep the "new arrival" item **off** the shelf.
2. On /scan: **Shelf:** `Mini shelf` → **Use webcam** (allow camera) → **Record 5 s** (or upload a phone clip; convert `.mov` first, see below).
3. Approve all; make names read the way the agents should say them; give the mug and the postcard set prices under $25.
4. Check the agent's answer without Band (repeat as needed):

   ```bash
   pnpm ask-store
   pnpm ask-store "find an SF history gift for my mom under $25" "please hold the Golden Gate history mug for Alex until 6 PM"
   ```

Converting a phone clip: `ffmpeg -i in.MOV -c:v libx264 -crf 23 -preset fast -an -movflags +faststart out.mp4`

## 6. Record the fallback rescans (recommended)

On http://localhost:3000/catalog-admin with **Shelf:** `Mini shelf`:
1. New-arrival item on the shelf → **Record 5 s** → diff shows **New: <item>** → do **not** Apply.
2. New arrival **and** mug off → record → diff shows only **Gone from shelf: Golden Gate history mug** → do **not** Apply.
3. Put the shelf back (mug on, new arrival off).

If a live rescan misreads during the demo, pick the clip under **Recorded rescans**, click Apply, and say it's from rehearsal.

## 7. Test the voice price

In Chrome on /scan: **🎤 Say a price** → allow the mic → "the <unpriced product> is twenty-two". Test in the room's noise. Then clear that price again (Edit → empty Price → Save).

## 8. Save the pre-demo snapshot **[BLOCKING]**

When the catalog is exactly the demo's starting state (one unpriced, two pending, mini shelf without the new arrival, no holds):

```bash
pnpm snapshot
```

## 9. Before every rehearsal and the real demo

```bash
pnpm reset      # restores the snapshot
# Ctrl+C the running pnpm demo, then start it again so the agents begin fresh conversations:
pnpm demo
```

Warm-up right before going on, in **Shelfie warm-up**: `@presidio-souvenirs what are your hours?`

Driver's messages for **Shelfie demo** (paste):

```
@shopper-agent find a gift for my mom, she loves SF history, under $25, hold it for pickup at 6
@shopper-agent I'm Sam. Find a gift for my mom, she loves SF history, under $25, hold it for pickup at 6
```

## 10. Rehearse (ref_docs/demo.md)

- Left window: /scan → /catalog-admin (beats 3 and 5: **Use webcam → Record 5 s → Apply**) → /dashboard. Right window: Band, room **Shelfie demo**.
- Browser zoom 125%+, lighting checked for the webcam.
- Five full runs; ready when three in a row finish under 3:15 with no fallback. Record one full successful run as backup.

## Credentials, credits, permissions

- ZooWork credits at https://platform.zoowork.ai (each scan, store reply and voice price is a billable turn).
- Chrome camera + microphone permission for localhost.
- The store's permission to film.
