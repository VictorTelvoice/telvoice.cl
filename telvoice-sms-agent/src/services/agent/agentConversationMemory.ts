import { getSupabase } from "../../database/supabaseClient.js";
import { isMissingTableError } from "../../utils/db-table.js";
import { wrapSupabaseError } from "../../utils/supabase-errors.js";
import type { CommercialQuoteResult } from "../../types/commercial.js";
import type { AgentChannel, AgentIntent } from "./types.js";
import type { LeadFields } from "./agentLeadCapture.js";

export type ConversationMemory = {
  lastIntent?: AgentIntent | string;
  lastQuantity?: number;
  lastQuote?: CommercialQuoteResult | null;
  leadPartial?: LeadFields;
  lastTopic?: string;
  pendingLeadStep?: string;
  campaignDraftStep?: string;
  campaignDraftMessage?: string;
  userDisplayName?: string;
  pendingFeedback?: boolean;
  lastUserQuestion?: string;
  pendingSmsPhone?: string;
  pendingSmsMessage?: string;
  sendSmsFlowActive?: boolean;
  sendSmsFlowStep?: string;
  sendSmsDestMode?: "single" | "csv";
  waitingForMessage?: boolean;
  waitingForRecipient?: boolean;
  waitingForCsv?: boolean;
  pendingCsvUploadId?: string;
  campaignGuided?: boolean;
  updatedAt?: string;
};

const memoryStore = new Map<string, ConversationMemory>();

function memoryKey(sessionId: string, channel: AgentChannel): string {
  return `${channel}:${sessionId}`;
}

export async function getConversationMemory(
  sessionId: string,
  channel: AgentChannel,
): Promise<ConversationMemory> {
  const key = memoryKey(sessionId, channel);
  const cached = memoryStore.get(key);
  if (cached) {
    return { ...cached };
  }

  const { data, error } = await getSupabase()
    .from("agent_conversation_memory")
    .select("memory")
    .eq("session_id", sessionId)
    .eq("channel", channel)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return {};
    }
    wrapSupabaseError(error, "getConversationMemory");
  }

  const mem = (data?.memory ?? {}) as ConversationMemory;
  memoryStore.set(key, mem);
  return { ...mem };
}

export async function updateConversationMemory(
  sessionId: string,
  channel: AgentChannel,
  patch: Partial<ConversationMemory>,
  companyId?: string | null,
): Promise<ConversationMemory> {
  const current = await getConversationMemory(sessionId, channel);
  const next: ConversationMemory = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const key = memoryKey(sessionId, channel);
  memoryStore.set(key, next);

  const { error } = await getSupabase()
    .from("agent_conversation_memory")
    .upsert(
      {
        session_id: sessionId,
        channel,
        company_id: companyId ?? null,
        memory: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id,channel" },
    );

  if (error) {
    if (isMissingTableError(error)) {
      return next;
    }
    const fk = /foreign key|violates foreign key/i.test(String(error.message ?? ""));
    if (fk) {
      return next;
    }
    wrapSupabaseError(error, "updateConversationMemory");
  }

  if (channel === "web_client" && companyId) {
    await getSupabase()
      .from("panel_agent_sessions")
      .update({ conversation_memory: next })
      .eq("id", sessionId)
      .then(() => {});
  }

  return next;
}

export async function clearConversationMemory(
  sessionId: string,
  channel: AgentChannel,
): Promise<void> {
  memoryStore.delete(memoryKey(sessionId, channel));
  const { error } = await getSupabase()
    .from("agent_conversation_memory")
    .delete()
    .eq("session_id", sessionId)
    .eq("channel", channel);
  if (error && !isMissingTableError(error)) {
    wrapSupabaseError(error, "clearConversationMemory");
  }
}

export function summarizeRecentContext(memory: ConversationMemory): string {
  const parts: string[] = [];
  if (memory.lastQuantity) {
    parts.push(`${memory.lastQuantity.toLocaleString("es-CL")} SMS`);
  }
  if (memory.lastQuote?.total_with_iva) {
    parts.push(`cotización $${memory.lastQuote.total_with_iva.toLocaleString("es-CL")} IVA incl.`);
  }
  if (memory.lastIntent) {
    parts.push(`tema: ${memory.lastIntent}`);
  }
  if (memory.leadPartial?.name) {
    parts.push(`contacto: ${memory.leadPartial.name}`);
  }
  return parts.length ? parts.join(" · ") : "";
}
