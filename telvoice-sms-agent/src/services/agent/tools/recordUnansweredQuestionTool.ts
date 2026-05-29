import { recordUnansweredQuestion } from "../agentUnansweredService.js";
import type { AgentToolContext, AgentToolResult } from "./types.js";

export const recordUnansweredQuestionTool = {
  name: "record_unanswered",
  description: "Registra pregunta sin respuesta para entrenamiento.",
  requiresCompany: false,
  async run(
    ctx: AgentToolContext,
    input: {
      question: string;
      intent: string;
      confidence: number;
      category?: string;
    },
  ): Promise<AgentToolResult> {
    await recordUnansweredQuestion({
      channel: ctx.channel,
      sessionId: ctx.sessionId,
      userId: ctx.userId,
      companyId: ctx.companyId,
      question: input.question,
      detectedIntent: input.intent,
      confidence: input.confidence,
      suggestedCategory: input.category,
    });
    return { ok: true, summary: "Pregunta registrada para revisión." };
  },
};
