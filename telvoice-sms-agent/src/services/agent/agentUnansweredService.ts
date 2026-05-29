import { getSupabase } from "../../database/supabaseClient.js";
import { isMissingTableError } from "../../utils/db-table.js";
import { NotFoundError } from "../../utils/errors.js";
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
  metadata: Record<string, unknown> | null;
  created_at: string;
  reviewed_at: string | null;
};

export type UnansweredListFilters = {
  status?: string;
  channel?: string;
  detectedIntent?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

export type UnansweredStats = {
  newCount: number;
  reviewedCount: number;
  ignoredCount: number;
  articlesFromQuestions: number;
};

const memoryQueue: UnansweredQuestionRow[] = [];

export function normalizeQuestion(q: string): string {
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
  const normalized = normalizeQuestion(input.question);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: dup, error: dupErr } = await getSupabase()
    .from("agent_unanswered_questions")
    .select("id, metadata")
    .eq("status", "new")
    .eq("channel", input.channel)
    .eq("normalized_question", normalized)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();

  if (!dupErr && dup?.id) {
    const meta =
      dup.metadata && typeof dup.metadata === "object"
        ? (dup.metadata as Record<string, unknown>)
        : {};
    const count =
      typeof meta.count === "number" && Number.isFinite(meta.count)
        ? meta.count + 1
        : 2;
    await getSupabase()
      .from("agent_unanswered_questions")
      .update({
        metadata: { ...meta, count, last_seen_at: new Date().toISOString() },
      })
      .eq("id", dup.id);
    return;
  }

  const row = {
    channel: input.channel,
    session_id: input.sessionId,
    user_id: input.userId ?? null,
    company_id: input.companyId ?? null,
    question: input.question.slice(0, 2000),
    normalized_question: normalized,
    detected_intent: input.detectedIntent,
    confidence: input.confidence,
    suggested_category: input.suggestedCategory ?? null,
    status: "new",
    metadata: { count: 1 },
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
  filters: UnansweredListFilters = {},
): Promise<UnansweredQuestionRow[]> {
  const limit = filters.limit ?? 100;
  let query = getSupabase()
    .from("agent_unanswered_questions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.channel) {
    query = query.eq("channel", filters.channel);
  }
  if (filters.detectedIntent) {
    query = query.eq("detected_intent", filters.detectedIntent);
  }
  if (filters.dateFrom) {
    query = query.gte("created_at", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte("created_at", filters.dateTo);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) {
      let rows = [...memoryQueue];
      if (filters.status) {
        rows = rows.filter((r) => r.status === filters.status);
      }
      if (filters.channel) {
        rows = rows.filter((r) => r.channel === filters.channel);
      }
      return rows.slice(0, limit);
    }
    wrapSupabaseError(error, "listUnansweredQuestions");
  }

  return (data ?? []) as UnansweredQuestionRow[];
}

export async function getUnansweredQuestionById(
  id: string,
): Promise<UnansweredQuestionRow> {
  const { data, error } = await getSupabase()
    .from("agent_unanswered_questions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      const mem = memoryQueue.find((r) => r.id === id);
      if (!mem) {
        throw new NotFoundError("Pregunta no encontrada.");
      }
      return mem;
    }
    wrapSupabaseError(error, "getUnansweredQuestionById");
  }

  if (!data) {
    throw new NotFoundError("Pregunta no encontrada.");
  }

  return data as UnansweredQuestionRow;
}

export async function getUnansweredStats(): Promise<UnansweredStats> {
  const counts = await Promise.all(
    (["new", "reviewed", "ignored"] as const).map(async (status) => {
      const { count, error } = await getSupabase()
        .from("agent_unanswered_questions")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (error && !isMissingTableError(error)) {
        wrapSupabaseError(error, "getUnansweredStats");
      }
      return count ?? 0;
    }),
  );

  let articlesFromQuestions = 0;
  const { count, error: kErr } = await getSupabase()
    .from("knowledge_articles")
    .select("id", { count: "exact", head: true })
    .not("source_unanswered_question_id", "is", null);

  if (!kErr) {
    articlesFromQuestions = count ?? 0;
  } else if (!isMissingTableError(kErr)) {
    const notesMatch = await getSupabase()
      .from("agent_unanswered_questions")
      .select("id", { count: "exact", head: true })
      .eq("status", "reviewed")
      .ilike("admin_notes", "%knowledge_article:%");
    if (!notesMatch.error) {
      articlesFromQuestions = notesMatch.count ?? 0;
    }
  }

  return {
    newCount: counts[0] ?? 0,
    reviewedCount: counts[1] ?? 0,
    ignoredCount: counts[2] ?? 0,
    articlesFromQuestions,
  };
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

export async function markUnansweredIgnored(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from("agent_unanswered_questions")
    .update({
      status: "ignored",
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error && !isMissingTableError(error)) {
    wrapSupabaseError(error, "markUnansweredIgnored");
  }
}
