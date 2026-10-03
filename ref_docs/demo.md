# Shelfie — Demo

Oct 3, 2026 · @Jason Shaye

In three minutes, a real store's shelves go online from one video, a shopper's AI agent finds the right gift through the store's agent in Band, and a live rescan proves the catalog stays true.

## Setup

Two windows, one mini shelf, three people.

**Screen (laptop, mirrored to the projector):**

- **Left window:** the Shelfie web app (/scan, then /catalog-admin, then /dashboard).
- **Right window:** the Band web app with the pre-created room open: @shopper-agent, @presidio-souvenirs, and Alex (a teammate's account).

**On the table:** a mini shelf of 5–6 real souvenirs in one row, spaced apart, facing the camera. It must include exactly one SF-history item that fits the gift request (the Golden Gate history mug) and one close alternative (an SF history postcard set or magnet).

**People:**

- **Presenter:** speaks, runs the left window, handles the shelf.
- **Driver:** types as Alex in the Band window on cue.
- **Backup:** holds the backup recording and the phone hotspot; watches the agent terminals for errors.

**Pre-done before the presentation:**

- Store video recorded at a real local shop (with permission), 45 seconds, and processed into an approved catalog with prices. Keep the raw video file for playback.
- One product left without a price, for the voice-price moment.
- Mini-shelf products already in the catalog except one "new arrival" item, which the live scan adds.
- Dashboard seeded only by your own earlier test sessions; say so if asked.
- Both agent processes running and warm: send one throwaway message in a separate room right before going on.

## Script

Six beats, 3:05 total. The gone-from-shelf moment at 2:15 is the climax; protect its time.

| Time | Beat | Do | Screen shows | Say |
| --- | --- | --- | --- | --- |
| 0:00–0:20 | 1. Hook | Nothing; stand by the shelf | Shelfie landing page | "Shoppers now send AI agents to shop for them. Those agents find anything on Amazon, and nothing on the shelf of the gift shop down the street. Small stores have no online catalog and no time to make one." |
| 0:20–1:00 | 2. A real store goes online | Play the 45 s store video at 2x; scroll the cards; approve two; tap the mic and say "the Alcatraz tote is twenty-two" | Product cards appear beside the video: photo, name, written description, prices read from tags; the tote's price fills in | "This afternoon we filmed \[store name\] for 45 seconds. That's \[N\] products online, named, described and priced. The owner just approves, and says any price the camera can't see." |
| 1:00–1:20 | 3. Live scan | Place the "new arrival" item on the mini shelf; record 5 s with the laptop camera | The new item appears, marked seen just now | "New stock arrives. Five seconds of video, and it's listed." |
| 1:20–2:15 | 4. Agent meets agent | Driver types as Alex: "@shopper-agent find a gift for my mom, she loves SF history, under $25, hold it for pickup at 6" | Band room fills: shopper agent asks the store agent; store agent proposes 2–3 options with prices, reasons and last-seen times; shopper picks the mug; store agent confirms the hold | "Alex's agent and the store's agent are from different companies, meeting in one Band room. The store's agent runs on ZooWork and recommends only what's physically on the shelf right now." |
| 2:15–2:50 | 5. Gone from shelf | Say "the owner pulls Alex's held mug behind the counter; it was the last one", take it off the shelf, rescan 5 s, tap Apply; driver asks the same request as a second shopper, Sam | Diff: Gone from shelf: Golden Gate history mug. Store agent now answers: no longer on the shelf as of just now, and offers the SF history postcard set | "Video in, truth out, and it stays true. No agent will send a customer for something that isn't there." |
| 2:50–3:05 | 6. Close | Switch to /dashboard | Products listed, agent questions, holds | "One minute of video, and any small store can sell to AI shoppers. Built on ZooWork, connected through Band." |

## Why each beat wins

Every beat earns at least one judging criterion or sponsor prize; none is filler.

| Beat | Judging criterion it earns | Sponsor point it proves |
| --- | --- | --- |
| 1. Hook | Approach & idea: the exact thesis of ZooWork's opening slide ("shoppers arrive as agents, most merchants have nothing to answer with") | ZooWork: a merchant would pay for this |
| 2. Store goes online | Design and X-factor: real store, real products, no typing | ZooWork: the vision step if run on its models |
| 3. Live scan | Technical execution: primary feature works live, not pre-recorded | — |
| 4. Agent meets agent | Technical execution and X-factor: two companies' agents negotiating a real need | Band: cross-company room, @mention routing, room as record. ZooWork: store agent runs and calls tools |
| 5. Gone from shelf | X-factor and robustness: the system visibly stays true, live | Band + ZooWork together: same room, changed answer from fresh data |
| 6. Close | Presentation: one memorable line, both sponsors named | Both |

Say "remove Band and an outside agent has no way to reach the store" once, in beat 4: it is Band's own judging test.

## Fallbacks

Each beat has a pre-made substitute so one failure never ends the demo.

| Beat | If this fails | Do instead |
| --- | --- | --- |
| 2 | Voice price not understood | Type the price; say "or just type it" |
| 3 | Live scan misses the new item | Play the pre-recorded 5 s clip of the same shelf, already processed |
| 4 | Agent reply takes more than 10 s | Driver sends the request while the presenter is still on beat 3; keep talking over the wait |
| 4 | Store agent errors or recommends wrongly | Switch to the second, pre-run Band room showing a good exchange from rehearsal; say it is from rehearsal |
| 5 | Rescan still sees the mug | Apply the pre-recorded rescan result; keep the agent's changed answer live |
| Any | Wi-Fi drops | Phone hotspot; if the cloud is unreachable, play the full backup recording |

Never fake a live result silently. If a fallback is used, say "here's the same step from our rehearsal run."

## Judge Q&A

Short, honest answers to the questions most likely to come up.

| Question | Answer |
| --- | --- |
| Real shopping agents like Muse don't connect to Band. | True today. Our shopper agent stands in for them. A store agent on Band is reachable by any agent that joins Band, and our stretch plain-HTML catalog serves agents that browse the web now. |
| How accurate is the scan? | It records which products are on the shelf, not counts, and the owner approves every item. On our store video it found \[N\] of \[M\] products; report the real number from rehearsal. |
| What if prices aren't on tags? | The owner says or types them during review; we never let the model guess a price. |
| Why not just a website or Shopify? | Small shops don't keep listings updated. The product is that a one-minute video is the whole upkeep. |
| Why Band and not a direct API call? | Agents from different companies need a place to find each other, talk under consent, and keep a shared record. Remove Band and an outside agent can't reach the store. |
| What does ZooWork do? | Hosts and runs the store agent: its model, instructions, tools and sessions. It's the always-on AI merchant each store gets. |
| How does the store make money from it? | Sales from AI-agent shoppers it is invisible to today; holds placed through the agent are the measurable signal. |
| What's next? | Multiple stores in one room for comparison, owner notifications, and a public feed for browsing agents. |

## Rehearsal checklist

Run the full script five times; the demo is ready when three consecutive runs finish under 3:15 with no fallback.

- [ ] Same shelf items, same order, same spacing every run; mark positions with tape
- [ ] The Golden Gate history mug is the only item matching "SF history gift under $25" besides the postcard set
- [ ] Store agent's 2–3 options checked for the exact demo request; prompt tuned until they are consistent
- [ ] Voice-price phrase tested in the presentation room's noise
- [ ] Lighting at the presentation spot tested for the live scan and rescan
- [ ] Driver's two Band messages saved for paste
- [ ] Projector font size readable from the back row (browser zoom 125%+)
- [ ] Database snapshot saved; reset script restores the pre-demo state in one command
- [ ] Backup recording of a full successful run on the laptop and a phone
- [ ] Spoken lines timed; beat 5 never starts after 2:20
