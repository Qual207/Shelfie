import type { AdapterToolsProtocol } from "@band-ai/sdk";

/** Mention reference plus "@handle" text for a room participant, looked up by id. */
export async function mentionOf(tools: AdapterToolsProtocol, id: string, fallbackName: string) {
  const participant = (await tools.getParticipants()).find((p) => p.id === id);
  const handle = (participant?.handle ?? participant?.name ?? fallbackName).replace(/^@/, "");
  return { ref: [{ id, handle }], text: `@${handle}` };
}

/** The message text without the leading @mentions that addressed it. */
export function stripMentions(content: string): string {
  return content.replace(/^\s*(?:@\S+\s+)+/, "").trim();
}

export const shortRoom = (roomId: string) => roomId.slice(0, 8);
