import { getProduct, logQuestion, placeHold, searchCatalog, storeInfo } from "./catalog";
import { getDb } from "./db";
import { logMessage, logSearch } from "./history";
import { STORE_INFO } from "./store-info";
import { ensureAgent, jsonResult, runTurn, type AgentSpec, type SessionState } from "./zoowork";

const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object" as const,
  properties,
  required,
});

export const STORE_AGENT: AgentSpec = {
  role: "store",
  name: "presidio-souvenirs",
  model: "litellm/claude-haiku-4-5",
  instructions: `You are the agent for ${STORE_INFO.name}, ${STORE_INFO.address}. Shopper agents and people message you in a chat room; each message starts with the sender's name.

Recommend only products returned by your tools. Always call search_catalog before recommending.
Match the shopper's stated needs (recipient, interests, budget, size) and give 2-3 options, each with price and one line on why it fits.
Always say when a product was last seen on the shelf, using the tool's last_seen wording (for example "last seen just now").
If a product is no longer on the shelf (on_shelf is false), say so plainly using its gone_from_shelf_since wording, for example "no longer on the shelf as of just now", and offer the closest alternative that is on the shelf.
Never invent products or prices.
Only call place_hold when the message asks you to hold one specific product. Then call it for that one product with the customer's name and the pickup time, and confirm the hold in one sentence. When a shopper first describes what they want, never hold anything: recommend options and ask which one to hold.

Write plain chat text: a short intro line, then numbered options. No markdown headings or tables, no @mentions. Keep it under 120 words.`,
  tools: [
    {
      name: "search_catalog",
      description:
        "Search the store's catalog of products that are physically on the shelf (or recently gone). Returns id, name, description, category, price_usd, on_shelf and last_seen for each. Call this before recommending anything.",
      input_schema: object(
        {
          query: { type: "string", description: "What the shopper wants, as keywords, e.g. 'SF history gift for mom'" },
          max_price_usd: { type: "number", description: "The shopper's budget ceiling in USD, if given" },
          category: { type: "string", description: "Optional category, e.g. Mugs" },
        },
        ["query"],
      ),
      timeoutMs: 30_000,
    },
    {
      name: "get_product",
      description: "Get one product in full by its id.",
      input_schema: object({ product_id: { type: "integer" } }, ["product_id"]),
      timeoutMs: 30_000,
    },
    {
      name: "place_hold",
      description:
        "Hold a product that is on the shelf for in-store pickup. Records the hold and returns a confirmation. Fails if the product is no longer on the shelf.",
      input_schema: object(
        {
          product_id: { type: "integer" },
          customer_name: { type: "string", description: "Who will pick it up" },
          until_time: { type: "string", description: "Hold until, e.g. '6 PM today'" },
        },
        ["product_id", "customer_name", "until_time"],
      ),
      timeoutMs: 30_000,
    },
    {
      name: "store_info",
      description: "The store's name, address and opening hours.",
      input_schema: object({}),
      timeoutMs: 30_000,
    },
  ],
};

let agentId: Promise<string> | undefined;

export function storeAgentId(): Promise<string> {
  agentId ??= ensureAgent(STORE_AGENT);
  return agentId;
}

// One ZooWork session per Band room, kept for the life of the process.
const sessions = new Map<string, SessionState>();

/** Runs one store-agent turn for a room and logs it as an agent question. Returns the reply. */
export async function answerShopper(room: string, from: string, text: string): Promise<string> {
  const db = getDb();
  const session = sessions.get(room) ?? {};
  sessions.set(room, session);
  const shown = new Map<number, string>(); // products the tools returned this turn

  const reply = await runTurn(await storeAgentId(), session, `${from}: ${text}`, async (name, input) => {
    switch (name) {
      case "search_catalog": {
        const result = searchCatalog(db, {
          query: typeof input.query === "string" ? input.query : "",
          max_price_usd: typeof input.max_price_usd === "number" ? input.max_price_usd : undefined,
          category: typeof input.category === "string" ? input.category : undefined,
        });
        result.results.forEach((p) => shown.set(p.id, p.name));
        const relevant = result.results.filter((p) => p.match_score > 0 && p.on_shelf);
        logSearch(db, {
          query: typeof input.query === "string" ? input.query : "",
          max_price_usd: typeof input.max_price_usd === "number" ? input.max_price_usd : undefined,
          matches: relevant.length,
          productIds: relevant.map((p) => p.id),
        });
        return jsonResult(result);
      }
      case "get_product": {
        const product = getProduct(db, Number(input.product_id));
        shown.set(product.id, product.name);
        return jsonResult(product);
      }
      case "place_hold":
        return jsonResult(
          placeHold(db, {
            product_id: Number(input.product_id),
            customer_name: String(input.customer_name ?? ""),
            until_time: String(input.until_time ?? ""),
          }),
        );
      case "store_info":
        return jsonResult(storeInfo());
      default:
        throw new Error(`Unknown tool ${name}`);
    }
  }).catch((err) => {
    sessions.delete(room); // start clean next time rather than resume a broken run
    throw err;
  });

  const lower = reply.toLowerCase();
  const proposed = [...shown].filter(([, name]) => lower.includes(name.toLowerCase())).map(([id]) => id);
  logQuestion(db, from, text, proposed);
  logMessage(db, { room, from: "store", to: "shopper", sender: STORE_AGENT.name, text: reply });
  return reply;
}
