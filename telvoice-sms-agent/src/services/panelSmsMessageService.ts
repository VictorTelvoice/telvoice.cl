import { getSupabase } from "../database/supabaseClient.js";
import type {
  PanelSmsMessageRow,
  PanelSmsMessageStatus,
  PanelSmsMessageWithCompany,
} from "../types/sms-panel.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export async function createPanelSmsMessage(input: {
  companyId: string;
  campaignId?: string | null;
  recipientNumber: string;
  senderId?: string | null;
  message: string;
  segments: number;
  costSms: number;
  status?: PanelSmsMessageStatus;
  mode?: string;
  metadata?: Record<string, unknown>;
}): Promise<PanelSmsMessageRow> {
  const { data, error } = await getSupabase()
    .from("panel_sms_messages")
    .insert({
      company_id: input.companyId,
      campaign_id: input.campaignId ?? null,
      recipient_number: input.recipientNumber,
      sender_id: input.senderId ?? null,
      message: input.message,
      segments: input.segments,
      cost_sms: input.costSms,
      provider: "mock",
      status: input.status ?? "queued",
      mode: input.mode ?? "mock",
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError(
        "Tabla panel_sms_messages no disponible. Aplica la migración 012.",
        503,
      );
    }
    wrapSupabaseError(error, "createPanelSmsMessage");
  }

  return data as PanelSmsMessageRow;
}

export async function updatePanelSmsMessage(
  id: string,
  patch: Partial<{
    status: PanelSmsMessageStatus;
    provider_message_id: string | null;
    operator: string | null;
    sent_at: string | null;
    delivered_at: string | null;
    error_code: string | null;
    error_message: string | null;
    metadata: Record<string, unknown>;
  }>,
): Promise<PanelSmsMessageRow> {
  const { data, error } = await getSupabase()
    .from("panel_sms_messages")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updatePanelSmsMessage");
  }

  return data as PanelSmsMessageRow;
}

export async function getPanelSmsMessageById(
  id: string,
): Promise<PanelSmsMessageRow | null> {
  const { data, error } = await getSupabase()
    .from("panel_sms_messages")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getPanelSmsMessageById");
  }

  return data as PanelSmsMessageRow | null;
}

export async function listPanelMessagesByCompany(
  companyId: string,
  limit = 50,
): Promise<PanelSmsMessageRow[]> {
  const { data, error } = await getSupabase()
    .from("panel_sms_messages")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listPanelMessagesByCompany");
  }

  return (data ?? []) as PanelSmsMessageRow[];
}

export async function listAllPanelMessagesWithCompany(
  limit = 100,
): Promise<PanelSmsMessageWithCompany[]> {
  const { data, error } = await getSupabase()
    .from("panel_sms_messages")
    .select("*, companies(name), sms_campaigns(name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listAllPanelMessagesWithCompany");
  }

  return (data ?? []).map((row) => {
    const r = row as PanelSmsMessageRow & {
      companies?: { name: string } | null;
      sms_campaigns?: { name: string } | null;
    };
    return {
      ...r,
      company_name: r.companies?.name ?? "—",
      campaign_name: r.sms_campaigns?.name ?? "—",
    };
  });
}

export async function insertPanelDeliveryEvent(input: {
  companyId: string;
  messageId: string;
  provider: string;
  providerMessageId?: string | null;
  status: string;
  rawPayload?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await getSupabase().from("panel_sms_delivery_events").insert({
    company_id: input.companyId,
    message_id: input.messageId,
    provider: input.provider,
    provider_message_id: input.providerMessageId ?? null,
    status: input.status,
    raw_payload: input.rawPayload ?? {},
  });

  if (error) {
    if (isMissingTableError(error)) {
      return;
    }
    wrapSupabaseError(error, "insertPanelDeliveryEvent");
  }
}
