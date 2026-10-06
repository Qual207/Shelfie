import { describe, expect, it } from "vitest";
import { placeHold } from "../lib/catalog";
import { logMessage, logSearch } from "../lib/history";
import { agentMemoryEpoch, clearData, dataSummary } from "../lib/reset";
import { seedSampleConversations } from "../lib/seed";
import { seededDb } from "./helpers";

function setup() {
  const { db, ids } = seededDb([
    { name: "Golden Gate history mug", price: 18 },
    { name: "SF history postcard set", price: 12 },
  ]);
  placeHold(db, { product_id: ids["Golden Gate history mug"], customer_name: "Alex", until_time: "6 PM" });
  logMessage(db, { room: "r1", from: "requester", to: "shopper", sender: "Alex", text: "a gift" });
  logSearch(db, { query: "gift", matches: 1, productIds: [ids["Golden Gate history mug"]] });
  db.prepare("INSERT INTO insights (model, result_json, message_count, created_at) VALUES ('m', '{}', 1, 'now')").run();
  return db;
}

describe("clearData", () => {
  it("catalog: removes products, scans and their holds, keeps conversations and reports", () => {
    const db = setup();
    clearData(db, "catalog");
    expect(dataSummary(db)).toMatchObject({ products: 0, scans: 0, holds: 0, messages: 1, searches: 1, insights: 1 });
  });

  it("conversations: removes messages and searches, keeps the catalog and holds", () => {
    const db = setup();
    clearData(db, "conversations");
    expect(dataSummary(db)).toMatchObject({ products: 2, holds: 1, messages: 0, searches: 0, insights: 1 });
  });

  it("holds and reports clear only themselves", () => {
    const db = setup();
    clearData(db, "holds");
    clearData(db, "reports");
    expect(dataSummary(db)).toMatchObject({ products: 2, holds: 0, messages: 1, insights: 0 });
  });

  it("everything: empties every table", () => {
    const db = setup();
    clearData(db, "everything");
    const counts = Object.entries(dataSummary(db)).filter(([key]) => key !== "snapshot_saved_at");
    expect(counts.every(([, n]) => n === 0)).toBe(true);
  });

  it("tells the agents to forget their conversations, except for a reports-only clear", () => {
    const db = setup();
    const start = agentMemoryEpoch(db);
    clearData(db, "reports");
    expect(agentMemoryEpoch(db)).toBe(start);
    clearData(db, "conversations");
    const afterConversations = agentMemoryEpoch(db);
    expect(afterConversations).not.toBe(start);
    clearData(db, "holds");
    expect(agentMemoryEpoch(db)).not.toBe(afterConversations);
  });
});

describe("seedSampleConversations", () => {
  it("adds sample messages, searches and one hold", () => {
    const db = setup();
    clearData(db, "conversations");
    clearData(db, "holds");
    seedSampleConversations(db);
    const s = dataSummary(db);
    expect(s.messages).toBeGreaterThan(5);
    expect(s.searches).toBe(2);
    expect(s.holds).toBe(1);
  });
});
