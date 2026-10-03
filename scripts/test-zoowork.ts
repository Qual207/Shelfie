// ZooWork smoke test: create/start an agent, open a session, send a message, run a JSON
// custom-tool round trip, then check that an image returned by a custom tool is seen.
// Usage: pnpm test:zoowork [model]   (default: litellm/claude-haiku-4-5)
import { spawnSync } from "node:child_process";
import { ensureAgent, jsonResult, runTurn, zoowork, type SessionState } from "@/lib/zoowork";

const model = process.argv[2] ?? "litellm/claude-haiku-4-5";
const SECRET = 4817;

// A synthetic price tag, rendered in memory by ffmpeg.
function tagImage(): string {
  const out = spawnSync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "color=c=white:s=640x360",
      "-frames:v", "1",
      "-vf",
      "drawbox=x=40:y=40:w=120:h=120:color=red:t=fill," +
        "drawtext=fontfile='C\\:/Windows/Fonts/arialbd.ttf':text='MUG  $17':fontsize=72:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2",
      "-f", "image2pipe", "-vcodec", "png", "pipe:1",
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  if (out.status !== 0) throw new Error(`ffmpeg failed: ${out.stderr.toString()}`);
  return out.stdout.toString("base64");
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await fn();
  console.log(`  ${label}: ${((Date.now() - start) / 1000).toFixed(1)} s`);
  return result;
}

async function main() {
  const zc = zoowork();
  const models = await zc.listModels();
  const row = models.find((m) => m.model === model);
  if (!row || row.selectable === false) throw new Error(`Model ${model} is not selectable`);
  console.log(`Model ${model} (input: ${JSON.stringify(row.input)})`);

  const agentId = await timed("ensure agent (create/update + start)", () =>
    ensureAgent({
      role: "smoke-test",
      name: "shelfie-smoke-test",
      model,
      instructions: "You are a test agent. Use your tools when asked and answer in one short sentence.",
      tools: [
        {
          name: "get_secret_number",
          description: "Returns the secret number.",
          input_schema: { type: "object", properties: {} },
          timeoutMs: 60_000,
        },
        {
          name: "get_test_image",
          description: "Returns a test image to look at.",
          input_schema: { type: "object", properties: {} },
          timeoutMs: 60_000,
        },
      ],
    }),
  );

  try {
    const session: SessionState = {};
    const calls: string[] = [];
    const onTool = async (name: string) => {
      calls.push(name);
      if (name === "get_secret_number") return jsonResult({ secret: SECRET });
      if (name === "get_test_image") {
        return [
          { type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: tagImage() } },
        ];
      }
      throw new Error(`unknown tool ${name}`);
    };

    const first = await timed("turn 1 (JSON tool round trip)", () =>
      runTurn(agentId, session, "Call get_secret_number and tell me the secret number.", onTool),
    );
    console.log(`  reply: ${first}`);
    const jsonOk = calls.includes("get_secret_number") && first.includes(String(SECRET));

    const second = await timed("turn 2 (image from a tool result)", () =>
      runTurn(
        agentId,
        session,
        "Call get_test_image. What text is printed on it, and what color is the square?",
        onTool,
      ),
    );
    console.log(`  reply: ${second}`);
    const imageOk = /17/.test(second) && /red/i.test(second);

    console.log(`\nJSON custom tool round trip: ${jsonOk ? "PASS" : "FAIL"}`);
    console.log(`Image in custom tool result read by model: ${imageOk ? "PASS" : "FAIL"}`);
    if (!jsonOk || !imageOk) process.exitCode = 1;
  } finally {
    await zc.stopAgent(agentId);
    await zc.deleteAgent(agentId);
    console.log("Cleaned up the smoke-test agent.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
