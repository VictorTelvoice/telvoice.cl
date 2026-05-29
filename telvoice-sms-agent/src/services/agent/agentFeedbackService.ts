import { getSupabase } from "../../database/supabaseClient.js";
import { isMissingTableError } from "../../utils/db-table.js";
import { wrapSupabaseError } from "../../utils/supabase-errors.js";
import { recordUnansweredQuestion } from "./agentUnansweredService.js";
import type { AgentChannel } from "./types.js";

export type AgentFeedbackRow = {
  id: string;
  channel: string;
  session_id: string;
  user_id: string | null;
  company_id: string | null;
  message_id: string | null;
  rating: number | null;
  feedback_text: string | null;
  resolved: boolean | null;
  created_at: string;
};

const memoryFeedback: AgentFeedbackRow[] = [];

export async function recordAgentFeedback(input: {
  channel: AgentChannel;
  sessionId: string;
  userId?: string | null;
  companyId?: string | null;
  messageId?: string | null;
  rating: number;
  feedbackText?: string | null;
  lastQuestion?: string;
}): Promise<void> {
  const row = {
    channel: input.channel,
    session_id: input.sessionId,
    user_id: input.userId ?? null,
    company_id: input.companyId ?? null,
    message_id: input.messageId ?? null,
    rating: input.rating,
    feedback_text: input.feedbackText?.trim().slice(0, 2000) ?? null,
    resolved: input.rating >= 4 ? true : false,
  };

  const { error } = await getSupabase().from("agent_feedback").insert(row);

  if (error) {
    if (isMissingTableError(error)) {
      memoryFeedback.unshift({
        id: `mem-${Date.now()}`,
        ...row,
        created_at: new Date().toISOString(),
      } as AgentFeedbackRow);
    } else {
      wrapSupabaseError(error, "recordAgentFeedback");
    }
  }

  if (input.rating <= 2 && input.lastQuestion) {
    await recordUnansweredQuestion({
      channel: input.channel,
      sessionId: input.sessionId,
      userId: input.userId,
      companyId: input.companyId,
      question: input.lastQuestion,
      detectedIntent: "negative_feedback",
      confidence: 0.4,
      suggestedCategory: "soporte",
    });
  }
}

export async function listAgentFeedback(limit = 80): Promise<AgentFeedbackRow[]> {
  const { data, error } = await getSupabase()
    .from("agent_feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return memoryFeedback.slice(0, limit);
    }
    wrapSupabaseError(error, "listAgentFeedback");
  }

  return (data ?? []) as AgentFeedbackRow[];
}

export async function getAgentFeedbackStats(): Promise<{
  helpful: number;
  notHelpful: number;
  total: number;
}> {
  const rows = await listAgentFeedback(500);
  let helpful = 0;
  let notHelpful = 0;
  for (const r of rows) {
    if (r.rating != null && r.rating >= 4) {
      helpful += 1;
    } else if (r.rating != null && r.rating <= 2) {
      notHelpful += 1;
    }
  }
  return { helpful, notHelpful, total: rows.length };
}
