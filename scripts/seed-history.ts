// Adds SAMPLE shopper conversations so /insights can be tried without live Band sessions.
// These are invented for testing: `pnpm reset` (after `pnpm snapshot` on a clean state) removes
// them, and do not present them as real shopper history.
import { placeHold } from "@/lib/catalog";
import { getDb } from "@/lib/db";
import { logMessage, logSearch, type Role } from "@/lib/history";

const db = getDb();
const products = db.prepare("SELECT id, name FROM products WHERE status = 'approved' AND on_shelf = 1 ORDER BY id").all() as { id: number; name: string }[];
if (products.length < 2) throw new Error("Approve a catalog (or run `pnpm seed`) first.");
const [first, second] = products;

let t = Date.now() - 3 * 3_600_000;
const say = (room: string, from: Role, to: Role, text: string) => {
  t += 4000;
  logMessage(db, { room, from, to, sender: from === "shopper" ? "shopper-agent" : from === "store" ? "presidio-souvenirs" : "Alex", text }, new Date(t).toISOString());
};

say("sample-1", "requester", "shopper", "Find a gift for my mom who loves SF history, under $25. Hold it for pickup at 6.");
say("sample-1", "shopper", "store", "Looking for an SF history gift under $25 for a mother. What do you have?");
logSearch(db, { query: "SF history gift", max_price_usd: 25, matches: 2, productIds: [first.id, second.id] });
say("sample-1", "store", "shopper", `1. ${first.name}. 2. ${second.name}. Both last seen just now.`);
say("sample-1", "shopper", "store", `Please hold ${first.name} for Alex until 6 PM.`);
placeHold(db, { product_id: first.id, customer_name: "Alex", until_time: "6 PM" });
say("sample-1", "store", "shopper", `${first.name} is held for Alex until 6 PM.`);
say("sample-1", "shopper", "requester", `I picked ${first.name}: it is an everyday keepsake and fits the budget. Held until 6 PM.`);

t += 600_000;
say("sample-1", "requester", "shopper", "Anything with dinosaurs for a 5 year old, under $10?");
say("sample-1", "shopper", "store", "Dinosaur gift for a 5 year old, under $10?");
logSearch(db, { query: "dinosaur toy", max_price_usd: 10, matches: 0, productIds: [] });
say("sample-1", "store", "shopper", "Nothing dinosaur-themed is on the shelf right now.");
say("sample-1", "shopper", "requester", "The store has nothing for dinosaurs, so I did not buy anything.");
console.log("Added 2 SAMPLE conversations. Open /insights.");
