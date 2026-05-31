import { getSupabase } from "../../database/supabaseClient.js";
import { isMissingTableError } from "../../utils/db-table.js";
import { NotFoundError } from "../../utils/errors.js";
import { wrapSupabaseError } from "../../utils/supabase-errors.js";
import {
  listPanelAgentMessagesForAdmin,
  type PanelAgentMessageRow,
} from "./panelAgentSessionService.js";
import {
  deriveQaFromMessages,
  resolveFeedbackQaFromSession,
} from "./agentFeedbackContext.js";
import { recordUnansweredQuestion } from "./agentUnansweredService.js";
import type { AgentChannel } from "./types.js";

export type AgentFeedbackStatus =
  | "new"
  | "reviewed"
  | "converted_to_article"
  | "ignored";

export type AgentFeedbackRow = {
  id: string;
  channel: string;
  session_id: string;
  user_id: string | null;
  company_id: string | null;
  message_id: string | null;
  user_message_id: string | null;
  agent_message_id: string | null;
  rating: number | null;
  feedback_text: string | null;
  resolved: boolean | null;
  status: string;
  reviewed_at: string | null;
  admin_notes: string | null;
  proposed_answer: string | null;
  knowledge_article_id: string | null;
  detected_intent: string | null;
  confidence: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type AgentFeedbackListItem = AgentFeedbackRow & {
  user_question: string | null;
  agent_response: string | null;
};

export type AgentFeedbackDetail = AgentFeedbackRow & {
  user_question: string | null;
  agent_response: string | null;
  company_name: string | null;
  messages: PanelAgentMessageRow[];
};

export type FeedbackListFilters = {
  rating?: "helpful" | "not_helpful" | "all";
  channel?: string;
  status?: string;
  companyId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
};

export type FeedbackStats = {
  helpful: number;
  notHelpful: number;
  pendingReview: number;
  convertedToArticle: number;
  ignored: number;
  total: number;
};

const memoryFeedback: AgentFeedbackRow[] = [];

function normalizeRow(raw: Record<string, unknown>): AgentFeedbackRow {
  return {
    id: String(raw.id),
    channel: String(raw.channel),
    session_id: String(raw.session_id),
    user_id: raw.user_id != null ? String(raw.user_id) : null,
    company_id: raw.company_id != null ? String(raw.company_id) : null,
    message_id: raw.message_id != null ? String(raw.message_id) : null,
    user_message_id:
      raw.user_message_id != null ? String(raw.user_message_id) : null,
    agent_message_id:
      raw.agent_message_id != null ? String(raw.agent_message_id) : null,
    rating: raw.rating != null ? Number(raw.rating) : null,
    feedback_text: raw.feedback_text != null ? String(raw.feedback_text) : null,
    resolved: raw.resolved != null ? Boolean(raw.resolved) : null,
    status: String(raw.status ?? "new"),
    reviewed_at: raw.reviewed_at != null ? String(raw.reviewed_at) : null,
    admin_notes: raw.admin_notes != null ? String(raw.admin_notes) : null,
    proposed_answer:
      raw.proposed_answer != null ? String(raw.proposed_answer) : null,
    knowledge_article_id:
      raw.knowledge_article_id != null
        ? String(raw.knowledge_article_id)
        : null,
    detected_intent:
      raw.detected_intent != null ? String(raw.detected_intent) : null,
    confidence: raw.confidence != null ? Number(raw.confidence) : null,
    metadata:
      raw.metadata && typeof raw.metadata === "object"
        ? (raw.metadata as Record<string, unknown>)
        : null,
    created_at: String(raw.created_at),
  };
}

function metaString(
  meta: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!meta || meta[key] == null) {
    return null;
  }
  const v = String(meta[key]).trim();
  return v || null;
}

function qaForListRow(
  row: AgentFeedbackRow,
  messages: PanelAgentMessageRow[],
): { user_question: string | null; agent_response: string | null } {
  const fromMeta = {
    user_question: metaString(row.metadata, "user_question"),
    agent_response: metaString(row.metadata, "agent_response"),
  };
  if (fromMeta.user_question && fromMeta.agent_response) {
    return fromMeta;
  }
  const fromSession = deriveQaFromMessages(messages, row.created_at);
  return {
    user_question: fromMeta.user_question ?? fromSession.user_question,
    agent_response: fromMeta.agent_response ?? fromSession.agent_response,
  };
}

export async function recordAgentFeedback(input: {
  channel: AgentChannel;
  sessionId: string;
  userId?: string | null;
  companyId?: string | null;
  messageId?: string | null;
  userMessageId?: string | null;
  agentMessageId?: string | null;
  rating: number;
  feedbackText?: string | null;
  lastQuestion?: string;
  lastReply?: string;
  intent?: string | null;
  confidence?: number | null;
}): Promise<void> {
  let lastQuestion = input.lastQuestion?.trim() ?? "";
  let lastReply = input.lastReply?.trim() ?? "";
  let intent = input.intent ?? null;
  let confidence = input.confidence ?? null;

  if ((!lastQuestion || !lastReply) && input.sessionId) {
    const resolved = await resolveFeedbackQaFromSession({
      sessionId: input.sessionId,
    });
    if (!lastQuestion && resolved.user_question) {
      lastQuestion = resolved.user_question;
    }
    if (!lastReply && resolved.agent_response) {
      lastReply = resolved.agent_response;
    }
    if (!intent && resolved.intent) {
      intent = resolved.intent;
    }
    if (confidence == null && resolved.confidence != null) {
      confidence = resolved.confidence;
    }
  }

  const metadata: Record<string, unknown> = {};
  if (lastQuestion) {
    metadata.user_question = lastQuestion.slice(0, 2000);
  }
  if (lastReply) {
    metadata.agent_response = lastReply.slice(0, 4000);
  }
  if (intent) {
    metadata.intent = intent;
  }
  if (confidence != null && Number.isFinite(confidence)) {
    metadata.confidence = confidence;
  }

  const row = {
    channel: input.channel,
    session_id: input.sessionId,
    user_id: input.userId ?? null,
    company_id: input.companyId ?? null,
    message_id: input.messageId ?? input.agentMessageId ?? null,
    user_message_id: input.userMessageId ?? null,
    agent_message_id: input.agentMessageId ?? null,
    rating: input.rating,
    feedback_text: input.feedbackText?.trim().slice(0, 2000) ?? null,
    resolved: input.rating >= 4,
    status: input.rating >= 4 ? "reviewed" : "new",
    detected_intent: intent,
    confidence:
      confidence != null && Number.isFinite(confidence) ? confidence : null,
    metadata,
  };

  const { error } = await getSupabase().from("agent_feedback").insert(row);

  if (error) {
    if (isMissingTableError(error)) {
      memoryFeedback.unshift({
        id: `mem-${Date.now()}`,
        ...row,
        reviewed_at: null,
        admin_notes: null,
        proposed_answer: null,
        knowledge_article_id: null,
        created_at: new Date().toISOString(),
      } as AgentFeedbackRow);
    } else {
      wrapSupabaseError(error, "recordAgentFeedback");
    }
  }

  if (input.rating <= 2 && lastQuestion) {
    await recordUnansweredQuestion({
      channel: input.channel,
      sessionId: input.sessionId,
      userId: input.userId,
      companyId: input.companyId,
      question: lastQuestion,
      detectedIntent: intent ?? "negative_feedback",
      confidence: confidence ?? 0.4,
      suggestedCategory: "soporte",
    });
  }
}

export async function listAgentFeedback(
  filters: FeedbackListFilters = {},
): Promise<AgentFeedbackListItem[]> {
  const limit = filters.limit ?? 150;
  let query = getSupabase()
    .from("agent_feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.channel) {
    query = query.eq("channel", filters.channel);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.companyId) {
    query = query.eq("company_id", filters.companyId);
  }
  if (filters.dateFrom) {
    query = query.gte("created_at", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte("created_at", filters.dateTo);
  }
  if (filters.rating === "helpful") {
    query = query.gte("rating", 4);
  } else if (filters.rating === "not_helpful") {
    query = query.lte("rating", 2);
  }
  if (filters.search) {
    const q = filters.search.replace(/[%_]/g, "").slice(0, 120);
    if (q) {
      query = query.or(
        `feedback_text.ilike.%${q}%,detected_intent.ilike.%${q}%,session_id.ilike.%${q}%`,
      );
    }
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) {
      return enrichFeedbackListRows(
        filterMemoryFeedback(memoryFeedback, filters).slice(0, limit),
      );
    }
    wrapSupabaseError(error, "listAgentFeedback");
  }

  let rows = (data ?? []).map((r) =>
    normalizeRow(r as Record<string, unknown>),
  );

  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter((r) => {
      const metaQ = metaString(r.metadata, "user_question") ?? "";
      const metaA = metaString(r.metadata, "agent_response") ?? "";
      return (
        (r.feedback_text ?? "").toLowerCase().includes(q) ||
        metaQ.toLowerCase().includes(q) ||
        metaA.toLowerCase().includes(q)
      );
    });
  }

  return enrichFeedbackListRows(rows);
}

async function enrichFeedbackListRows(
  rows: AgentFeedbackRow[],
): Promise<AgentFeedbackListItem[]> {
  if (!rows.length) return [];

  const sessionIds = [...new Set(rows.map((r) => r.session_id))];
  const messagesBySession = new Map<string, PanelAgentMessageRow[]>();

  await Promise.all(
    sessionIds.map(async (sid) => {
      const msgs = await listPanelAgentMessagesForAdmin(sid, 40);
      messagesBySession.set(sid, msgs);
    }),
  );

  return rows.map((row) => {
    const msgs = messagesBySession.get(row.session_id) ?? [];
    const qa = qaForListRow(row, msgs);
    const fromSession = deriveQaFromMessages(msgs, row.created_at);
    return {
      ...row,
      user_question: qa.user_question,
      agent_response: qa.agent_response,
      detected_intent:
        row.detected_intent ??
        metaString(row.metadata, "intent") ??
        fromSession.intent,
      confidence:
        row.confidence ??
        (metaString(row.metadata, "confidence")
          ? Number(metaString(row.metadata, "confidence"))
          : null) ??
        fromSession.confidence,
    };
  });
}

function filterMemoryFeedback(
  rows: AgentFeedbackRow[],
  filters: FeedbackListFilters,
): AgentFeedbackRow[] {
  return rows.filter((r) => {
    if (filters.channel && r.channel !== filters.channel) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.rating === "helpful" && (r.rating == null || r.rating < 4)) {
      return false;
    }
    if (filters.rating === "not_helpful" && (r.rating == null || r.rating > 2)) {
      return false;
    }
    return true;
  });
}

export async function getAgentFeedbackStats(): Promise<FeedbackStats> {
  const { data, error } = await getSupabase().from("agent_feedback").select(
    "rating, status",
  );

  if (error) {
    if (isMissingTableError(error)) {
      const rows = memoryFeedback;
      return statsFromRows(rows);
    }
    wrapSupabaseError(error, "getAgentFeedbackStats");
  }

  return statsFromRows(
    (data ?? []).map((r) =>
      normalizeRow(r as Record<string, unknown>),
    ),
  );
}

function statsFromRows(rows: AgentFeedbackRow[]): FeedbackStats {
  let helpful = 0;
  let notHelpful = 0;
  let pendingReview = 0;
  let convertedToArticle = 0;
  let ignored = 0;

  for (const r of rows) {
    if (r.rating != null && r.rating >= 4) helpful += 1;
    else if (r.rating != null && r.rating <= 2) notHelpful += 1;

    switch (r.status) {
      case "new":
        pendingReview += 1;
        break;
      case "converted_to_article":
        convertedToArticle += 1;
        break;
      case "ignored":
        ignored += 1;
        break;
      default:
        break;
    }
  }

  return {
    helpful,
    notHelpful,
    pendingReview,
    convertedToArticle,
    ignored,
    total: rows.length,
  };
}

export async function getAgentFeedbackById(
  id: string,
): Promise<AgentFeedbackDetail> {
  const { data, error } = await getSupabase()
    .from("agent_feedback")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      const mem = memoryFeedback.find((r) => r.id === id);
      if (!mem) throw new NotFoundError("Feedback no encontrado.");
      return enrichFeedbackDetail(mem, []);
    }
    wrapSupabaseError(error, "getAgentFeedbackById");
  }

  if (!data) {
    throw new NotFoundError("Feedback no encontrado.");
  }

  const row = normalizeRow(data as Record<string, unknown>);
  const messages = await listPanelAgentMessagesForAdmin(row.session_id, 80);
  return enrichFeedbackDetail(row, messages);
}

async function enrichFeedbackDetail(
  row: AgentFeedbackRow,
  messages: PanelAgentMessageRow[],
): Promise<AgentFeedbackDetail> {
  const fromMeta = {
    user_question: metaString(row.metadata, "user_question"),
    agent_response: metaString(row.metadata, "agent_response"),
  };
  const fromMessages = deriveQaFromMessages(messages, row.created_at);

  let company_name: string | null = null;
  if (row.company_id) {
    const { data: company } = await getSupabase()
      .from("companies")
      .select("name")
      .eq("id", row.company_id)
      .maybeSingle();
    company_name = company?.name != null ? String(company.name) : null;
  }

  return {
    ...row,
    user_question: fromMeta.user_question ?? fromMessages.user_question,
    agent_response: fromMeta.agent_response ?? fromMessages.agent_response,
    detected_intent:
      row.detected_intent ?? fromMessages.intent ?? metaString(row.metadata, "intent"),
    confidence:
      row.confidence ??
      fromMessages.confidence ??
      (metaString(row.metadata, "confidence")
        ? Number(metaString(row.metadata, "confidence"))
        : null),
    company_name,
    messages,
  };
}

export async function backfillFeedbackContext(id: string): Promise<AgentFeedbackDetail> {
  const detail = await getAgentFeedbackById(id);
  const meta = { ...(detail.metadata ?? {}) };
  if (detail.user_question) meta.user_question = detail.user_question;
  if (detail.agent_response) meta.agent_response = detail.agent_response;
  if (detail.detected_intent) meta.intent = detail.detected_intent;
  if (detail.confidence != null) meta.confidence = detail.confidence;

  await getSupabase()
    .from("agent_feedback")
    .update({
      metadata: meta,
      detected_intent: detail.detected_intent,
      confidence: detail.confidence,
    })
    .eq("id", id);

  return getAgentFeedbackById(id);
}

export async function markFeedbackReviewed(
  id: string,
  adminNotes?: string | null,
): Promise<void> {
  const { error } = await getSupabase()
    .from("agent_feedback")
    .update({
      status: "reviewed",
      reviewed_at: new Date().toISOString(),
      resolved: true,
      ...(adminNotes?.trim() ? { admin_notes: adminNotes.trim().slice(0, 4000) } : {}),
    })
    .eq("id", id);

  if (error) {
    wrapSupabaseError(error, "markFeedbackReviewed");
  }
}

export async function markFeedbackIgnored(
  id: string,
  adminNotes?: string | null,
): Promise<void> {
  const { error } = await getSupabase()
    .from("agent_feedback")
    .update({
      status: "ignored",
      reviewed_at: new Date().toISOString(),
      resolved: true,
      ...(adminNotes?.trim() ? { admin_notes: adminNotes.trim().slice(0, 4000) } : {}),
    })
    .eq("id", id);

  if (error) {
    wrapSupabaseError(error, "markFeedbackIgnored");
  }
}

export async function proposeFeedbackAnswer(
  id: string,
  input: {
    title?: string;
    category?: string;
    keywords?: string;
    proposedAnswer: string;
    allowedChannels?: string;
    audience?: string;
    priority?: number;
    adminNotes?: string;
  },
): Promise<void> {
  const detail = await getAgentFeedbackById(id);
  const meta = { ...(detail.metadata ?? {}) };
  if (input.title) meta.proposed_title = input.title.slice(0, 200);
  if (input.category) meta.proposed_category = input.category;
  if (input.keywords) meta.proposed_keywords = input.keywords.slice(0, 500);
  if (input.allowedChannels) {
    meta.proposed_allowed_channels = input.allowedChannels;
  }
  if (input.audience) meta.proposed_audience = input.audience;
  if (input.priority != null) meta.proposed_priority = input.priority;

  const { error } = await getSupabase()
    .from("agent_feedback")
    .update({
      proposed_answer: input.proposedAnswer.trim().slice(0, 8000),
      admin_notes: input.adminNotes?.trim().slice(0, 4000) ?? detail.admin_notes,
      metadata: meta,
    })
    .eq("id", id);

  if (error) {
    wrapSupabaseError(error, "proposeFeedbackAnswer");
  }
}

export async function markFeedbackConvertedToArticle(
  id: string,
  articleId: string,
  adminNotes?: string | null,
): Promise<void> {
  const { error } = await getSupabase()
    .from("agent_feedback")
    .update({
      status: "converted_to_article",
      knowledge_article_id: articleId,
      reviewed_at: new Date().toISOString(),
      resolved: true,
      ...(adminNotes?.trim() ? { admin_notes: adminNotes.trim().slice(0, 4000) } : {}),
    })
    .eq("id", id);

  if (error) {
    wrapSupabaseError(error, "markFeedbackConvertedToArticle");
  }
}

export async function createUnansweredFromFeedback(id: string): Promise<string> {
  const detail = await getAgentFeedbackById(id);
  const question =
    detail.user_question?.trim() ||
    detail.feedback_text?.trim() ||
    "Feedback negativo sin pregunta explícita";

  await recordUnansweredQuestion({
    channel: detail.channel as AgentChannel,
    sessionId: detail.session_id,
    userId: detail.user_id,
    companyId: detail.company_id,
    question,
    detectedIntent: detail.detected_intent ?? "negative_feedback",
    confidence: detail.confidence ?? 0.35,
    suggestedCategory: "soporte",
  });

  const meta = { ...(detail.metadata ?? {}), unanswered_from_feedback: id };
  await getSupabase()
    .from("agent_feedback")
    .update({ metadata: meta })
    .eq("id", id);

  return question;
}
