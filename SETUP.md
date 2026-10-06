# Shelfie on your Mac: what's left for you

Everything that can run without your accounts is installed and tested. What's left is two
API keys and one double-click. Plan on about 10 minutes.

## Already done

- Pulled the latest commit (`5dbe5fd`). The repo was already up to date with GitHub.
- Tools: Node 24.18 and ffmpeg 8.1 were already installed. I added pnpm 11 through Homebrew (`pnpm@11`, the version that matches the lockfile).
- `pnpm install` is done, including the native SQLite module, which was built for your Node.
- The production build, typecheck, lint and all 16 unit tests pass.
- `.env` exists with empty keys. Only you can read it, and git ignores it.
- Tested on this Mac: every page loads. Uploading a video (H.264 `.mp4` and iPhone HEVC `.mov` both work) or webcam frames saves the upload and pulls 10 frames at 1024 px or smaller. The scan then stops with "No ZooWork API key", which means everything before ZooWork works.
- New: `pnpm band-setup` registers both Band agents, saves their keys to `.env`, and creates the demo rooms. `setup.command` runs every step in order.
- Fixed: `pnpm test:zoowork` would have failed on any Mac. It used a Windows font path, and Homebrew's ffmpeg can't draw text.

## Your part

### 1. Get a ZooWork API key

1. Go to https://platform.zoowork.ai and sign in.
2. Open a Project (or create one), then create a **Project API key**. It starts with `zct_` and is shown only once, so copy it now.
3. Set up billing or credits for the organization. Every scan, store-agent reply and voice price is a billable turn. If the platform asks you to bind owner credentials, do that too.

> Shortcut: Jason's project key works too. You'd then share his ZooWork agents (that's fine; conversations stay separate).

### 2. Get your Band account key

1. Go to https://app.band.ai and sign up or sign in.
2. Click your **avatar → Settings** and create an **API key**. It starts with `band_u_`. Don't use an agent key (`band_a_…`); the setup script rejects those.

### 3. Double-click `setup.command`

In Finder, open the project folder (`~/scripts/shelfie/ai_commerce`) and double-click **`setup.command`**. You can also run `./setup.command` in Terminal.

It asks for `ZOOWORK_API_KEY` and then `BAND_API_KEY`. Paste each one and press Enter. **Nothing shows while you paste; that's normal.** Then it:

1. registers `presidio-souvenirs` and `shopper-agent` on your Band account and saves their IDs and keys to `.env`
2. creates the rooms **Shelfie demo** and **Shelfie warm-up** with both agents, and prints their @handles
3. runs two ZooWork smoke tests: the chat model (`claude-haiku-4-5`) and the vision model (`claude-sonnet-5-5`). Both should print `PASS`
4. starts the website and both agents, and opens http://localhost:3000/scan

If macOS blocks the file, right-click it, choose **Open**, then **Open** again.

<details><summary>Same thing in Terminal, without the double-click</summary>

```bash
cd ~/scripts/shelfie/ai_commerce
open -e .env                                  # paste ZOOWORK_API_KEY and BAND_API_KEY, save
pnpm band-setup
pnpm test:zoowork
pnpm test:zoowork litellm/claude-sonnet-5-5
pnpm demo
```
</details>

Wait until both of these lines appear in the logs:
`[store] ZooWork store agent is running. Connecting to Band…` and the same for `[shopper]`.

### 4. Try the whole flow

Use **Google Chrome**. Voice pricing only works in Chrome.

1. **Upload a video:** go to http://localhost:3000/scan, type a shelf name, click **Upload video** and pick a clip. After about 30 s, product cards show up marked "Needs review". Fix any names, type the missing prices (or click **🎤 Say a price**), then approve them. **Use webcam → Record 5 s** works too; Chrome will ask for camera permission.
2. **View the website:** `/catalog-admin` shows the catalog plus rescan and diff. `/catalog` is the plain page meant for browsing agents. `/dashboard` shows holds and agent questions. `/insights` shows analytics from the agent conversations.
3. **Band conversation:** open https://app.band.ai, go to the **Shelfie demo** room and send:

   ```
   @shopper-agent find a gift for my mom, she loves SF history, under $25, hold it for pickup at 6
   ```

   Pick the agent from the @ autocomplete, because agents only see messages that mention them. (Handles look like `@<your-username>/shopper-agent`.) The shopper asks the store, the store offers 2–3 options, the shopper picks one and asks for a hold, and then it reports back to you. The hold shows up on `/dashboard`.
   To test the store agent alone: `@presidio-souvenirs what are your hours?`
   Or skip the Band app: on http://localhost:3000/shop, type the same request. It posts into **Shelfie demo** as you (using `BAND_ROOM_ID`, which `pnpm band-setup` fills in) and shows the agents' replies.
4. **Without Band:** `pnpm ask-store "find an SF history gift for my mom under $25"`

### 5. Before using your real store

- **Clear test data** (sidebar, or on Catalog and Insights) clears the catalog, holds, conversations or analyst reports one at a time, or everything, and saves and restores a starting point for repeat tests.
- **Product photos:** after each scan, every product is cropped out of the video, retouched into a clean photo, and checked by a vision model (does it match its name and description, and did the retouch invent anything). This runs in the background, about a minute per product, and cards say "Checking photo…" meanwhile. Products scanned before this existed catch up on their own the next time the app runs. Set `PHOTO_RETOUCH=off` in `.env` to skip the retouch.
- **Store details:** edit `lib/store-info.ts` (name, address, hours) and restart. The agents read it on startup.
- **iPhone videos:** `.mov` files scan fine but won't play in the page. Convert them for playback:
  `ffmpeg -i in.mov -c:v libx264 -crf 23 -preset fast -an -movflags +faststart out.mp4`

For demo rehearsal (snapshot/reset, fallback rescans, driver script), see **MANUAL_STEPS.md**. Its "Already done" section describes Jason's laptop, not this one.

## Every day after this

```bash
cd ~/scripts/shelfie/ai_commerce
pnpm demo        # Ctrl+C to stop. Use pnpm demo:dev while editing code (hot reload)
```

## If something goes wrong

| You see | Fix |
| --- | --- |
| `No ZooWork API key` | `ZOOWORK_API_KEY` is empty in `.env`. Fill it in and restart. |
| ZooWork `401 … zct_ service token is required` | Wrong kind of key. Create a **Project** API key. |
| Smoke test: `Model … is not selectable` | Your ZooWork project doesn't offer that model. Change `model` in `lib/vision.ts` (vision) or `lib/store-agent.ts` / `lib/shopper-agent.ts` (chat) to one your project lists. |
| Smoke test fails at a turn, or the store says "Sorry, I couldn't check the shelf just now (…)" | Usually ZooWork credits or billing. The text in parentheses is the real error. |
| `[store]` or `[shopper]` exits with `Missing required fields … STORE_AGENT_ID` | Band keys aren't in `.env`. Run `pnpm band-setup`. |
| `pnpm band-setup` prints `401` | Wrong Band key. Use the account key (`band_u_…`). |
| Agents don't answer in Band | Did you @mention them from the autocomplete? Check that both `Connecting to Band…` lines appeared. Re-run `pnpm band-setup` (it adds missing agents to the rooms). |
| Two replies to every message | Someone else is running the same Band agents. That happens if you copied Jason's `STORE_*`/`SHOPPER_*` keys instead of registering your own. Only one computer should run `pnpm demo` with those keys at a time. |
| `Port 3000 is in use` | Find what's using it with `lsof -i :3000`, then quit that process. |

## Repo changes (not committed)

New `SETUP.md` and `scripts/band-setup.ts`. Edited `package.json` (`band-setup` script), `.env.example` (`BAND_API_KEY`, `BAND_ROOM_ID`), `scripts/test-zoowork.ts` (Mac fix), `README.md`, `DECISIONS.md`, and the untracked `setup.command`. Nothing is committed or pushed yet.
