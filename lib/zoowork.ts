import {
  assistantText,
  createZooworkClient,
  customToolUse,
  isRunFinished,
  runOutcome,
  ZooworkError,
  type CustomToolDeclaration,
  type CustomToolResultContent,
  type ZooworkClient,
} from "@zoowork-ai/sdk";
import { parseModelJson } from "./json";

export interface AgentSpec {
  role: string;
  name: string;
  model: string;
  instructions: string;
  tools?: CustomToolDeclaration[];
  /** ZooWork built-in tools to allow besides our custom tools (e.g. image_generate). */
  builtinTools?: string[];
  /** Catalog Skills by name (e.g. "designer"). ZooWork only accepts them when the agent is created. */
  skills?: string[];
  /** Give the agent its own persistent /workspace sandbox (needed for files and exec). */
  sandbox?: boolean;
}

export type ToolHandler = (
  name: string,
  input: Record<string, unknown>,
) => Promise<CustomToolResultContent[]>;

/** One ZooWork conversation; runTurn fills in sessionId and advances cursor. */
export interface SessionState {
  sessionId?: string;
  cursor?: string;
}

let client: ZooworkClient | undefined;

export function zoowork(): ZooworkClient {
  client ??= createZooworkClient();
  return client;
}

/**
 * Finds the Shelfie agent for this role by label (creating it on first use), pushes the
 * current instructions/tools/model, and starts it. Returns the agent id.
 */
export async function ensureAgent(spec: AgentSpec): Promise<string> {
  const zc = zoowork();
  const labels = { app: "shelfie", role: spec.role };
  const allowed = [...(spec.tools ?? []).map((t) => t.name), ...(spec.builtinTools ?? [])];
  const config = {
    model: { primary: spec.model, input: ["text", "image"] },
    persona: { docs: [{ name: "AGENTS.md", content: spec.instructions }] },
    custom_tools: spec.tools ?? [],
    // Only the tools we name: no web search or stray sandbox tools, and a smaller prompt.
    tool_policy: allowed.length ? { allow: allowed } : { deny: ["*"] },
    include_global_skills: false,
    ...(spec.sandbox ? { sandbox: { scope: "agent" as const } } : {}),
  };

  let agentId = (await zc.listAgents({ labels })).data[0]?.agent_id;
  if (agentId) {
    await zc.updateAgent(agentId, config);
  } else {
    const idempotencyKey = `shelfie-${spec.role}-${Date.now()}`;
    for (let attempt = 1; ; attempt++) {
      try {
        const created = await zc.createAgent(
          { resource: { name: spec.name, labels, ...config, ...(spec.skills ? { skills: await skillRefs(spec.skills) } : {}) } },
          idempotencyKey,
        );
        agentId = created.agent_id;
        break;
      } catch (err) {
        // Concurrent creates in one org can 503; the docs say retry with the same key.
        if (!(err instanceof ZooworkError && err.status === 503 && attempt < 5)) throw err;
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }
  await zc.startAgent(agentId);
  await zc.waitUntilRunning(agentId, { timeoutMs: 60_000 });
  return agentId;
}

async function skillRefs(names: string[]): Promise<{ skill_id: string }[]> {
  return Promise.all(
    names.map(async (name) => {
      const skill = (await zoowork().listSkills({ q: name })).find((s) => s.name === name);
      if (!skill) throw new Error(`ZooWork has no Skill named ${name}`);
      return { skill_id: skill.skill_id };
    }),
  );
}

/** Writes a local file into the agent's sandbox, in chunks small enough for one exec argument. */
export async function uploadToSandbox(agentId: string, data: Buffer, target: string): Promise<void> {
  const zc = zoowork();
  const b64 = data.toString("base64");
  const run = async (script: string, ...args: string[]) => {
    const r = await zc.exec(agentId, ["bash", "-lc", script, "_", ...args]);
    if (r.exit_code !== 0) throw new Error(`Sandbox upload failed: ${r.stderr || r.stdout}`);
  };
  await run('mkdir -p "$(dirname "$1")" && : > "$1.b64"', target);
  for (let i = 0; i < b64.length; i += 60_000) await run('printf %s "$2" >> "$1.b64"', target, b64.slice(i, i + 60_000));
  await run('base64 -d "$1.b64" > "$1" && rm "$1.b64"', target);
}

/** Downloads the newest artifact a session published from `sourcePath` (a /workspace path). */
export async function downloadPublished(agentId: string, sessionId: string, sourcePath: string): Promise<Buffer> {
  const zc = zoowork();
  const { artifacts } = await zc.listArtifacts(agentId, { sessionId });
  const artifact = artifacts.find((a) => a.source_path?.endsWith(sourcePath) && a.status === "ready");
  if (!artifact) throw new Error(`The agent did not publish ${sourcePath}`);
  const { url } = await zc.downloadArtifact(agentId, artifact.artifact_id);
  const res = await fetch(url!);
  if (!res.ok) throw new Error(`Artifact download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Sends one user message and follows the run to `run.finished`, executing custom tool
 * calls with `onTool`. Returns the final assistant message.
 */
export async function runTurn(
  agentId: string,
  state: SessionState,
  message: string,
  onTool?: ToolHandler,
  timeoutMs = 120_000,
): Promise<string> {
  const zc = zoowork();
  if (!state.sessionId) {
    const session = await zc.createSession(agentId, {
      initial_events: [{ type: "user.message", content: message }],
    });
    state.sessionId = session.session_id;
  } else {
    const { events } = await zc.postEvents(agentId, state.sessionId, [
      { type: "user.message", content: message },
    ]);
    if (events[0]?.accepted === false) throw new Error("ZooWork did not accept the message");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let reply = "";
  try {
    // The stream does not end at run.finished, and the server may close it while idle:
    // reconnect from the last cursor until the run finishes.
    for (let attempt = 0; attempt < 5 && !controller.signal.aborted; attempt++) {
      const stream = zc.streamEvents(agentId, state.sessionId, {
        ...(state.cursor ? { cursor: state.cursor } : {}),
        signal: controller.signal,
      });
      for await (const event of stream) {
        const text = assistantText(event).trim();
        if (text) reply = text;

        const call = customToolUse(event);
        if (call?.phase === "requested") {
          const result = await executeTool(onTool, call.name ?? "", call.input ?? {});
          await zc.resolveCustomToolCall(agentId, call.callId, result);
        }

        state.cursor = event.cursor ?? state.cursor;
        if (isRunFinished(event)) {
          const outcome = runOutcome(event);
          if (outcome !== "succeeded") throw new Error(`ZooWork run ${outcome ?? "ended"}`);
          return reply;
        }
      }
    }
    throw new Error(`ZooWork turn timed out after ${Math.round(timeoutMs / 1000)} s`);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function executeTool(
  onTool: ToolHandler | undefined,
  name: string,
  input: Record<string, unknown>,
): Promise<{ content: CustomToolResultContent[]; isError?: boolean }> {
  try {
    if (!onTool) throw new Error(`No handler for tool ${name}`);
    return { content: await onTool(name, input) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

/** One turn in a fresh session that must answer with JSON; on unparseable output, asks once more. */
export async function askJson(
  agentId: string,
  prompt: string,
  onTool?: ToolHandler,
): Promise<{ value: unknown; raw: string }> {
  const session: SessionState = {};
  const raw = await runTurn(agentId, session, prompt, onTool);
  try {
    return { value: parseModelJson(raw), raw };
  } catch {
    const retry = await runTurn(agentId, session, "Your last reply was not valid JSON. Reply again with only the JSON object.", onTool);
    return { value: parseModelJson(retry), raw: retry };
  }
}

export function jsonResult(value: unknown): CustomToolResultContent[] {
  return [{ type: "json", value }];
}
