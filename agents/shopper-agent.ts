// The demo shopper agent on Band. Its reasoning runs on a second ZooWork agent; this process
// routes each decision to the store agent or back to the requester with a real @mention.
import { Agent, GenericAdapter, loadAgentConfigFromEnv } from "@band-ai/sdk";
import { getDb } from "@/lib/db";
import { logMessage } from "@/lib/history";
import { mentionOf, shortRoom, stripMentions } from "@/lib/band";
import { decide, shopperAgentId } from "@/lib/shopper-agent";

const config = loadAgentConfigFromEnv({ prefix: "SHOPPER" });
const storeId = process.env.STORE_AGENT_ID;
if (!storeId) throw new Error("Set STORE_AGENT_ID in .env so the shopper can find the store agent");

await shopperAgentId(); // create/start the ZooWork agent before taking messages
console.log("ZooWork shopper agent is running. Connecting to Band…");

// Who asked, per room, so the final report goes back to them.
const requesters = new Map<string, { id: string; name: string }>();

const agent = Agent.create({
  config,
  agentConfig: { autoSubscribeExistingRooms: true },
  adapter: new GenericAdapter(async ({ message, tools, roomId }) => {
    const fromStore = message.senderId === storeId;
    const name = message.senderName ?? message.senderType;
    const text = stripMentions(message.content);
    if (!fromStore) {
      requesters.set(roomId, { id: message.senderId, name });
      logMessage(getDb(), { room: roomId, from: "requester", to: "shopper", sender: name, text });
    }
    const requester = requesters.get(roomId) ?? { id: message.senderId, name };
    console.log(`[room ${shortRoom(roomId)}] ${fromStore ? "store" : name}: ${text}`);

    try {
      const decision = await decide(roomId, fromStore ? "store" : "requester", name, text);
      const participants = await tools.getParticipants();
      if (decision.to === "store" && !participants.some((p) => p.id === storeId)) {
        const to = await mentionOf(tools, requester.id, requester.name);
        await tools.sendMessage(`${to.text} The store agent isn't in this room yet. Add it and ask me again.`, to.ref);
        return;
      }
      const to =
        decision.to === "store"
          ? await mentionOf(tools, storeId, "presidio-souvenirs")
          : await mentionOf(tools, requester.id, requester.name);
      await tools.sendMessage(`${to.text} ${decision.message}`, to.ref);
      logMessage(getDb(), {
        room: roomId,
        from: "shopper",
        to: decision.to,
        sender: "shopper-agent",
        text: decision.message,
      });
      console.log(`[room ${shortRoom(roomId)}] -> ${decision.to}: ${decision.message}`);
    } catch (err) {
      console.error(`[room ${shortRoom(roomId)}] failed:`, err);
      const to = await mentionOf(tools, requester.id, requester.name);
      await tools.sendMessage(`${to.text} Sorry, I hit an error (${(err as Error).message}). Please ask again.`, to.ref);
    }
  }),
});

await agent.run();
