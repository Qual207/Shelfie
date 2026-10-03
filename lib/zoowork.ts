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

export interface AgentSpec {
  role: string;
  name: string;
  model: string;
  instructions: string;
  tools?: CustomToolDeclaration[];
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
  const config = {
    model: { primary: spec.model, input: ["text", "image"] },
    persona: { docs: [{ name: "AGENTS.md", content: spec.instructions }] },
    custom_tools: spec.tools ?? [],
    // Only our own tools: no web search or sandbox tools to wander into, and a smaller prompt.
    tool_policy: spec.tools?.length ? { allow: spec.tools.map((t) => t.name) } : { deny: ["*"] },
    include_global_skills: false,
  };

  let agentId = (await zc.listAgents({ labels })).data[0]?.agent_id;
  if (agentId) {
    await zc.updateAgent(agentId, config);
  } else {
    const idempotencyKey = `shelfie-${spec.role}-${Date.now()}`;
    for (let attempt = 1; ; attempt++) {
      try {
        const created = await zc.createAgent(
          { resource: { name: spec.name, labels, ...config } },
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

export function jsonResult(value: unknown): CustomToolResultContent[] {
  return [{ type: "json", value }];
}
