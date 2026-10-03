// Asks the ZooWork store agent a question against the current catalog, without Band.
// Each argument is one message in the same conversation, sent as the shopper agent.
// Usage: pnpm ask-store "find an SF history gift for my mom under $25" "please hold the mug for Alex until 6 PM"
import { answerShopper } from "@/lib/store-agent";

const messages = process.argv.slice(2);
if (messages.length === 0) messages.push("Looking for a gift for my mom, she loves SF history, under $25. What do you have on the shelf?");

for (const text of messages) {
  const started = Date.now();
  console.log(`\nshopper-agent: ${text}`);
  const reply = await answerShopper("local-test", "shopper-agent", text);
  console.log(`store agent (${((Date.now() - started) / 1000).toFixed(1)} s): ${reply}`);
}
