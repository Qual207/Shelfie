# Shelfie — MVP

Oct 3, 2026 · @Jason Shaye

## Product

Shelfie is the AI merchant for small stores: one shelf video becomes an agent-ready product catalog, and a hosted store agent sells from it to AI shopping agents.

- **Problem:** AI shopping agents can find anything on Amazon, but nothing on the shelves of a local souvenir or gift shop. Small stores have no public, standardized listing of what they carry, and no time to build or update one.
- **What the owner does:** films the shelves; Shelfie identifies each product, writes its description, and reads prices off tags. The owner fills in missing prices by typing or saying them, then approves.
- **What it is not:** a full inventory system. It records which products are physically on the shelves and when each was last seen, not unit counts.
- **The store agent:** hosted on ZooWork, reachable by shopper agents in a Band room. It matches a shopper's needs ("a gift for my mom who loves SF history, under $25") to products the store actually has.
- **Who pays:** the store owner. The P&L line is revenue from AI-agent shoppers the store is currently invisible to; secondary, hours of listing work replaced by a one-minute scan.
- **Pitch line:** "One minute of video, and any small store can sell to AI shoppers."

## Scope

The MVP is exactly what the demo shows: video to catalog, live rescan, and a shopper agent finding a match through the store agent in a Band room.

| In the MVP | Out of the MVP |
| --- | --- |
| Upload a store video; one vision call returns each product with name, generated description, category, price if a tag is readable, shelf location | Unit counts or a full inventory system |
| Owner review: approve, edit, delete; add missing prices by typing or by voice | Owner negotiation, discounts, escalation to the owner |
| Live rescan of a mini shelf: on shelf / no longer seen / new | WhatsApp or Slack notifications |
| Store agent on ZooWork that matches shopper needs to products on the shelf | Payments, checkout, POS integration |
| Shopper agent and store agent talking in one Band room | Live Band registry discovery (room is pre-created) |
| Hold for pickup (cut first if short on time) | Multiple stores, accounts, auth, deployment |
| Dashboard with 3 numbers: products listed, agent questions, holds |  |

**Stretch:** a plain, almost text-only HTML catalog page for browsing agents that click through HTML. The pitch positions it as the fallback; the Band agent-to-agent path is the efficient one.

## Core features

Five features, each with the check that proves it works.

| # | Feature | What it does | Done when |
| --- | --- | --- | --- |
| 1 | Scan to catalog | Owner uploads a 30–60 s shelf video; 8–12 frames go to a vision model in one call; it returns each distinct product with name, generated description, category, price if a tag is readable, shelf location, best frame, confidence | The real store video yields 10+ correctly named products in under 30 s |
| 2 | Owner review | Cards with the best frame; Approve, Edit, Delete; items missing a price are flagged; the owner types the price or holds a mic button and says it ("the tote is twenty-two") | Approved products are saved with a price and a last\_seen timestamp |
| 3 | Rescan | New frames plus the current catalog go to one vision call; each product comes back on shelf or not seen, plus any new products | Removing the mug from the mini shelf and rescanning marks it no longer on the shelf |
| 4 | Store agent | ZooWork agent with tools search\_catalog, get\_product, place\_hold, store\_info; recommends products that fit the shopper's stated needs, only from what is on the shelf, and says when each was last seen | Asked for "a gift for my mom who loves SF history, under $25", it returns 2–3 fitting products with prices and reasons |
| 5 | Agent-to-agent in Band | A shopper agent and the store agent share one Band room; the shopper describes the need, the store agent proposes options, the shopper picks one and asks for a hold | The full need → options → pick → hold exchange runs live in the Band web app |

The dashboard (products listed, agent questions, holds) is a sixth, minor feature built last.

## Sponsor roles

ZooWork is the store's AI merchant; Band is where outside shopper agents do business with it. Removing either breaks the demo.

- **ZooWork (required):** hosts the store agent (model, instructions, tools, sessions). Runs the vision extraction too if a mentor confirms image input on built-in models. This is "an agent a merchant would pay for, and could run on Monday."
- **Band (prize target):** the room where a shopper agent from another company meets the store agent. @mentions route each turn, and the room is the record of what was asked, proposed and held. Band carries the conversation, not the catalog: the video and catalog live in our app.
- **Not used:** Moss, Tavily, Novita, Entire. Add only if one solves a real problem during the build.

## Done and cut order

The MVP is done when the full demo script runs end to end, live, five times in a row.

- [ ] Real store video processed into a clean, approved catalog with prices
- [ ] One missing price added by voice during review
- [ ] Live scan of the mini shelf adds products marked seen just now
- [ ] Store agent proposes fitting products for a needs-based request inside a Band room
- [ ] Rescan after removing the mug marks it no longer on the shelf, and the store agent's answer changes
- [ ] Backup recording of one full successful run

**Never cut:** scan to catalog, the needs-based Band exchange backed by ZooWork, the gone-from-shelf moment.

**Cut in this order if behind:**

1. Text-only HTML catalog page (stretch)
2. Dashboard (say the numbers instead)
3. Hold for pickup (the shopper agent ends on the recommendation)
4. Voice price entry (type the price instead)
5. Live mini-shelf scan (show the processed result; keep the rescan live)
