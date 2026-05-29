import { randomUUID } from "node:crypto";
import { getSupabase } from "../../database/supabaseClient.js";
import { isMissingTableError } from "../../utils/db-table.js";
import { wrapSupabaseError } from "../../utils/supabase-errors.js";
import type { AgentChannel } from "./types.js";

export type PanelAgentMessageRow = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const memorySessions = new Map<
  string,
  { companyId: string; userId: string | null; channel: AgentChannel; messages: PanelAgentMessageRow[] }
>();

export async function ensurePanelAgentSession(input: {
  sessionId?: string | null;
  companyId: string;
  userId: string | null;
  channel: AgentChannel;
}): Promise<string> {
  if (input.sessionId) {
    const existing = await getSessionMeta(input.sessionId);
    if (existing && existing.company_id === input.companyId) {
      return input.sessionId;
    }
  }

  const id = randomUUID();
  const { error } = await getSupabase().from("panel_agent_sessions").insert({
    id,
    company_id: input.companyId,
    user_id: input.userId,
    channel: input.channel,
  });

  if (error) {
    if (isMissingTableError(error)) {
      memorySessions.set(id, {
        companyId: input.companyId,
        userId: input.userId,
        channel: input.channel,
        messages: [],
      });
      return id;
    }
    wrapSupabaseError(error, "ensurePanelAgentSession");
  }

  return id;
}

async function getSessionMeta(
  sessionId: string,
): Promise<{ company_id: string } | null> {
  const mem = memorySessions.get(sessionId);
  if (mem) {
    return { company_id: mem.companyId };
  }

  const { data, error } = await getSupabase()
    .from("panel_agent_sessions")
    .select("company_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getSessionMeta");
  }

  return data as { company_id: string } | null;
}

export async function appendPanelAgentMessage(input: {
  sessionId: string;
  companyId: string;
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const mem = memorySessions.get(input.sessionId);
  if (mem) {
    mem.messages.push({
      id: randomUUID(),
      session_id: input.sessionId,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? null,
      created_at: new Date().toISOString(),
    });
    return;
  }

  const { error } = await getSupabase().from("panel_agent_messages").insert({
    session_id: input.sessionId,
    role: input.role,
    content: input.content,
    metadata: input.metadata ?? {},
  });

  if (error && !isMissingTableError(error)) {
    wrapSupabaseError(error, "appendPanelAgentMessage");
  }
}

export async function listPanelAgentMessages(
  sessionId: string,
  companyId: string,
  limit = 40,
): Promise<PanelAgentMessageRow[]> {
  const mem = memorySessions.get(sessionId);
  if (mem) {
    if (mem.companyId !== companyId) {
      return [];
    }
    return mem.messages.slice(-limit);
  }

  const session = await getSessionMeta(sessionId);
  if (!session || session.company_id !== companyId) {
    return [];
  }

  const { data, error } = await getSupabase()
    .from("panel_agent_messages")
    .select("id, session_id, role, content, metadata, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listPanelAgentMessages");
  }

  return (data ?? []) as PanelAgentMessageRow[];
}
