import type { PanelAgentMessageRow } from "./panelAgentSessionService.js";
import { listPanelAgentMessagesForAdmin } from "./panelAgentSessionService.js";

export function deriveQaFromMessages(
  messages: PanelAgentMessageRow[],
  beforeAt?: string | null,
): { user_question: string | null; agent_response: string | null; intent: string | null; confidence: number | null } {
  const cutoff = beforeAt ? new Date(beforeAt).getTime() : null;
  const slice =
    cutoff != null && Number.isFinite(cutoff)
      ? messages.filter((m) => new Date(m.created_at).getTime() <= cutoff)
      : messages;

  let user_question: string | null = null;
  let agent_response: string | null = null;
  let intent: string | null = null;
  let confidence: number | null = null;

  for (let i = slice.length - 1; i >= 0; i -= 1) {
    const m = slice[i];
    if (!m) continue;
    if (!agent_response && m.role === "assistant") {
      agent_response = m.content;
      const meta = m.metadata ?? {};
      if (typeof meta.intent === "string") intent = meta.intent;
      if (meta.confidence != null && Number.isFinite(Number(meta.confidence))) {
        confidence = Number(meta.confidence);
      }
    }
    if (!user_question && m.role === "user") {
      user_question = m.content;
      if (!intent && m.metadata && typeof m.metadata.intent === "string") {
        intent = m.metadata.intent;
      }
    }
    if (user_question && agent_response) break;
  }

  return { user_question, agent_response, intent, confidence };
}

export async function resolveFeedbackQaFromSession(input: {
  sessionId: string;
  beforeAt?: string | null;
}): Promise<ReturnType<typeof deriveQaFromMessages>> {
  const messages = await listPanelAgentMessagesForAdmin(input.sessionId, 80);
  return deriveQaFromMessages(messages, input.beforeAt ?? null);
}
