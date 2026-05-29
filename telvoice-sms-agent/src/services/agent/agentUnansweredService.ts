import { getSupabase } from "../../database/supabaseClient.js";
import { isMissingTableError } from "../../utils/db-table.js";
import { wrapSupabaseError } from "../../utils/supabase-errors.js";
import type { AgentChannel } from "./types.js";

export type UnansweredQuestionRow = {
  id: string;
  channel: string;
  session_id: string | null;
  user_id: string | null;
  company_id: string | null;
  question: string;
  normalized_question: string | null;
  detected_intent: string | null;
  confidence: number | null;
  suggested_category: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
};

const memoryQueue: UnansweredQuestionRow[] = [];

function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export async function recordUnansweredQuestion(input: {
  channel: AgentChannel;
  sessionId: string;
  userId?: string | null;
  companyId?: string | null;
  question: string;
  detectedIntent: string;
  confidence: number;
  suggestedCategory?: string;
}): Promise<void> {
  const row = {
    channel: input.channel,
    session_id: input.sessionId,
    user_id: input.userId ?? null,
    company_id: input.companyId ?? null,
    question: input.question.slice(0, 2000),
    normalized_question: normalizeQuestion(input.question),
    detected_intent: input.detectedIntent,
    confidence: input.confidence,
    suggested_category: input.suggestedCategory ?? null,
    status: "new",
  };

  const { error } = await getSupabase()
    .from("agent_unanswered_questions")
    .insert(row);

  if (error) {
    if (isMissingTableError(error)) {
      memoryQueue.unshift({
        id: `mem-${Date.now()}`,
        ...row,
        admin_notes: null,
        created_at: new Date().toISOString(),
        reviewed_at: null,
      } as UnansweredQuestionRow);
      return;
    }
    wrapSupabaseError(error, "recordUnansweredQuestion");
  }
}

export async function listUnansweredQuestions(
  limit = 50,
): Promise<UnansweredQuestionRow[]> {
  const { data, error } = await getSupabase()
    .from("agent_unanswered_questions")
    .select("*")
    .eq("status", "new")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return memoryQueue.slice(0, limit);
    }
    wrapSupabaseError(error, "listUnansweredQuestions");
  }

  return (data ?? []) as UnansweredQuestionRow[];
}

export async function markUnansweredReviewed(
  id: string,
  notes?: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from("agent_unanswered_questions")
    .update({
      status: "reviewed",
      reviewed_at: new Date().toISOString(),
      admin_notes: notes ?? null,
    })
    .eq("id", id);

  if (error && !isMissingTableError(error)) {
    wrapSupabaseError(error, "markUnansweredReviewed");
  }
}
