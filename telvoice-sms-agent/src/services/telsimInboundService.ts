import { findVerifyNumberBySlotId, getRegisteredVerifyNumbers } from "../config/verifyNumbers.js";
import { getSupabase } from "../database/supabaseClient.js";
import type {
  TelsimInboundSmsRow,
  TelsimSmsReceivedPayload,
} from "../types/telsim.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import {
  extractLinePhoneFromTelsimBody,
  normalizeTelsimLinePhone,
} from "../utils/telsim-line-phone.js";

export async function insertTelsimInboundSms(input: {
  payload: TelsimSmsReceivedPayload;
  rawPayload: Record<string, unknown>;
  linePhone?: string | null;
}): Promise<TelsimInboundSmsRow | null> {
  const p = input.payload;
  const linePhone =
    input.linePhone ??
    extractLinePhoneFromTelsimBody(input.rawPayload) ??
    findVerifyNumberBySlotId(p.slot_id)?.phone ??
    null;

  const { data, error } = await getSupabase()
    .from("telsim_inbound_sms")
    .insert({
      event: p.event,
      sender_from: p.from,
      content: p.content,
      verification_code: p.verification_code,
      service: p.service || null,
      slot_id: p.slot_id || null,
      line_phone: linePhone,
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

  const row = data as TelsimInboundSmsRow;
  if (p.slot_id) {
    const boundPhone =
      linePhone ??
      findVerifyNumberBySlotId(p.slot_id)?.phone ??
      (await resolveAutoBindVerifyPhone(p.slot_id));
    if (boundPhone) {
      await upsertTelsimSlotBinding(p.slot_id, boundPhone).catch((err) => {
        console.warn("[telsim] No se pudo guardar binding slot→línea:", err);
      });
    }
  }

  return row;
}

async function resolveAutoBindVerifyPhone(slotId: string): Promise<string | null> {
  if (await isSlotIdBound(slotId)) {
    return null;
  }
  const entries = getRegisteredVerifyNumbers();
  for (const entry of entries) {
    if (entry.slotId?.trim()) {
      continue;
    }
    const boundForLine = await getBoundSlotIdForVerifyPhone(entry.phone);
    if (boundForLine) {
      continue;
    }
    return entry.phone;
  }
  return null;
}

async function isSlotIdBound(slotId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("telsim_slot_bindings")
    .select("slot_id")
    .eq("slot_id", slotId.trim())
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) {
      return false;
    }
    return false;
  }
  return Boolean(data);
}

export async function upsertTelsimSlotBinding(
  slotId: string,
  verifyPhone: string,
): Promise<void> {
  const normalized = normalizeTelsimLinePhone(verifyPhone);
  if (!normalized) {
    return;
  }
  const { error } = await getSupabase()
    .from("telsim_slot_bindings")
    .upsert(
      {
        slot_id: slotId.trim(),
        verify_phone: normalized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slot_id" },
    );
  if (error && !isMissingTableError(error)) {
    wrapSupabaseError(error, "upsertTelsimSlotBinding");
  }
}

export async function getBoundSlotIdForVerifyPhone(
  verifyPhone: string,
): Promise<string | null> {
  const normalized = normalizeTelsimLinePhone(verifyPhone);
  if (!normalized) {
    return null;
  }
  const { data, error } = await getSupabase()
    .from("telsim_slot_bindings")
    .select("slot_id")
    .eq("verify_phone", normalized)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getBoundSlotIdForVerifyPhone");
  }

  const slot = (data as { slot_id?: string } | null)?.slot_id?.trim();
  return slot || null;
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

export async function getLatestTelsimInboundByLinePhone(
  verifyPhone: string,
): Promise<TelsimInboundSmsRow | null> {
  const normalized = normalizeTelsimLinePhone(verifyPhone);
  if (!normalized) {
    return null;
  }

  const { data, error } = await getSupabase()
    .from("telsim_inbound_sms")
    .select("*")
    .eq("line_phone", normalized)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    if (isMissingColumnError(error)) {
      return getLatestTelsimInboundByBoundSlotOnly(normalized);
    }
    wrapSupabaseError(error, "getLatestTelsimInboundByLinePhone");
  }

  return (data as TelsimInboundSmsRow | null) ?? null;
}

async function getLatestTelsimInboundByBoundSlotOnly(
  verifyPhone: string,
): Promise<TelsimInboundSmsRow | null> {
  const slotId = await getBoundSlotIdForVerifyPhone(verifyPhone);
  if (!slotId) {
    return null;
  }
  return getLatestTelsimInboundBySlot(slotId);
}

function isMissingColumnError(error: { code?: string; message?: string }): boolean {
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42703" ||
    msg.includes("line_phone") ||
    msg.includes("column") && msg.includes("does not exist")
  );
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
