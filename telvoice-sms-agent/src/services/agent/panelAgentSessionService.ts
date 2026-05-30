import { randomUUID } from "node:crypto";
import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabase } from "../../database/supabaseClient.js";
import { isMissingTableError } from "../../utils/db-table.js";
import { formatSupabaseError } from "../../utils/supabase-errors.js";
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
  {
    companyId: string;
    userId: string | null;
    channel: AgentChannel;
    messages: PanelAgentMessageRow[];
  }
>();

function isPersistRecoverableError(error: PostgrestError | null): boolean {
  if (!error) {
    return false;
  }
  if (isMissingTableError(error)) {
    return true;
  }
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "23503" ||
    msg.includes("foreign key") ||
    msg.includes("violates foreign key constraint")
  );
}

function activateMemorySession(
  sessionId: string,
  input: { companyId: string; userId: string | null; channel: AgentChannel },
): void {
  if (!memorySessions.has(sessionId)) {
    memorySessions.set(sessionId, {
      companyId: input.companyId,
      userId: input.userId,
      channel: input.channel,
      messages: [],
    });
  }
}

function warnPersist(context: string, error: PostgrestError | null): void {
  console.warn(`[panelAgentSession] ${context}: ${formatSupabaseError(error ?? { message: "unknown" })}`);
}

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
  const row = {
    id,
    company_id: input.companyId,
    user_id: input.userId,
    channel: input.channel,
  };

  const { error } = await getSupabase().from("panel_agent_sessions").insert(row);

  if (error) {
    if (isPersistRecoverableError(error)) {
      warnPersist("ensurePanelAgentSession fallback (memory)", error);
      activateMemorySession(id, input);
      return id;
    }
    warnPersist("ensurePanelAgentSession unexpected error, memory fallback", error);
    activateMemorySession(id, input);
    return id;
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
    warnPersist("getSessionMeta", error);
    return null;
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
    if (mem.companyId !== input.companyId) {
      return;
    }
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

  const session = await getSessionMeta(input.sessionId);
  if (!session || session.company_id !== input.companyId) {
    return;
  }

  const { error } = await getSupabase().from("panel_agent_messages").insert({
    session_id: input.sessionId,
    role: input.role,
    content: input.content,
    metadata: input.metadata ?? {},
  });

  if (error) {
    if (isPersistRecoverableError(error)) {
      warnPersist("appendPanelAgentMessage fallback (memory)", error);
      activateMemorySession(input.sessionId, {
        companyId: input.companyId,
        userId: null,
        channel: "web_client",
      });
      const fallback = memorySessions.get(input.sessionId);
      if (fallback) {
        fallback.messages.push({
          id: randomUUID(),
          session_id: input.sessionId,
          role: input.role,
          content: input.content,
          metadata: input.metadata ?? null,
          created_at: new Date().toISOString(),
        });
      }
      return;
    }
    warnPersist("appendPanelAgentMessage", error);
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
    warnPersist("listPanelAgentMessages", error);
    return [];
  }

  return (data ?? []) as PanelAgentMessageRow[];
}

/** Solo para tests: simula fallo de FK en insert de sesión. */
export function __resetPanelAgentMemorySessionsForTests(): void {
  memorySessions.clear();
}

export function __memorySessionCountForTests(): number {
  return memorySessions.size;
}

/** Admin: historial de sesión sin filtro por empresa. */
export async function listPanelAgentMessagesForAdmin(
  sessionId: string,
  limit = 50,
): Promise<PanelAgentMessageRow[]> {
  const mem = memorySessions.get(sessionId);
  if (mem) {
    return mem.messages.slice(-limit);
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
    warnPersist("listPanelAgentMessagesForAdmin", error);
    return [];
  }

  return (data ?? []) as PanelAgentMessageRow[];
}
