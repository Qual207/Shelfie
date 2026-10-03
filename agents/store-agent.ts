// Band <-> ZooWork bridge for the store agent. On each @mention: forward the message to the
// room's ZooWork session, run its tool calls against SQLite, and reply with an @mention.
import { Agent, GenericAdapter, loadAgentConfigFromEnv } from "@band-ai/sdk";
import { mentionOf, shortRoom, stripMentions } from "@/lib/band";
import { answerShopper, storeAgentId } from "@/lib/store-agent";

const config = loadAgentConfigFromEnv({ prefix: "STORE" });
await storeAgentId(); // create/start the ZooWork agent before taking messages
console.log("ZooWork store agent is running. Connecting to Band…");

const agent = Agent.create({
  config,
  agentConfig: { autoSubscribeExistingRooms: true }, // join the pre-created demo room on startup
  adapter: new GenericAdapter(async ({ message, tools, roomId }) => {
    const from = message.senderName ?? message.senderType;
    const text = stripMentions(message.content);
    const started = Date.now();
    console.log(`[room ${shortRoom(roomId)}] ${from}: ${text}`);
    const sender = await mentionOf(tools, message.senderId, from);
    try {
      const reply = await answerShopper(roomId, from, text);
      await tools.sendMessage(`${sender.text} ${reply}`, sender.ref);
      console.log(`[room ${shortRoom(roomId)}] replied in ${((Date.now() - started) / 1000).toFixed(1)} s: ${reply}`);
    } catch (err) {
      console.error(`[room ${shortRoom(roomId)}] failed:`, err);
      await tools.sendMessage(
        `${sender.text} Sorry, I couldn't check the shelf just now (${(err as Error).message}). Please ask again.`,
        sender.ref,
      );
    }
  }),
});

await agent.run();
