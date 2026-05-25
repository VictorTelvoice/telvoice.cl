import { getSupabase } from "../database/supabaseClient.js";
import type {
  TelsimInboundSmsRow,
  TelsimSmsReceivedPayload,
} from "../types/telsim.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export async function insertTelsimInboundSms(input: {
  payload: TelsimSmsReceivedPayload;
  rawPayload: Record<string, unknown>;
}): Promise<TelsimInboundSmsRow | null> {
  const p = input.payload;
  const { data, error } = await getSupabase()
    .from("telsim_inbound_sms")
    .insert({
      event: p.event,
      sender_from: p.from,
      content: p.content,
      verification_code: p.verification_code,
      service: p.service || null,
      slot_id: p.slot_id || null,
      received_at: p.received_at,
      raw_payload: input.rawPayload,
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      console.warn(
        "[telsim] Tabla telsim_inbound_sms no existe. Ejecuta migración 018.",
      );
      return null;
    }
    wrapSupabaseError(error, "insertTelsimInboundSms");
  }

  return data as TelsimInboundSmsRow;
}

export async function getLatestTelsimInboundBySlot(
  slotId: string,
): Promise<TelsimInboundSmsRow | null> {
  const { data, error } = await getSupabase()
    .from("telsim_inbound_sms")
    .select("*")
    .eq("slot_id", slotId)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getLatestTelsimInboundBySlot");
  }

  return (data as TelsimInboundSmsRow | null) ?? null;
}

export async function getLatestTelsimInboundBySender(
  senderFrom: string,
): Promise<TelsimInboundSmsRow | null> {
  const { data, error } = await getSupabase()
    .from("telsim_inbound_sms")
    .select("*")
    .eq("sender_from", senderFrom)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getLatestTelsimInboundBySender");
  }

  return (data as TelsimInboundSmsRow | null) ?? null;
}

export async function listRecentTelsimInbound(
  limit = 20,
): Promise<TelsimInboundSmsRow[]> {
  const { data, error } = await getSupabase()
    .from("telsim_inbound_sms")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listRecentTelsimInbound");
  }

  return (data ?? []) as TelsimInboundSmsRow[];
}
