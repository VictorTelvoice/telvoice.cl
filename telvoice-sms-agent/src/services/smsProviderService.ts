import { getSupabase } from "../database/supabaseClient.js";
import type { SmsProviderRow } from "../types/sms-routing.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export async function listSmsProviders(): Promise<SmsProviderRow[]> {
  const { data, error } = await getSupabase()
    .from("sms_providers")
    .select("*")
    .order("priority", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listSmsProviders");
  }
  return (data ?? []) as SmsProviderRow[];
}

export async function getSmsProviderById(id: string): Promise<SmsProviderRow | null> {
  const { data, error } = await getSupabase()
    .from("sms_providers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getSmsProviderById");
  }
  return data as SmsProviderRow | null;
}

export async function getSmsProviderByCode(code: string): Promise<SmsProviderRow | null> {
  const { data, error } = await getSupabase()
    .from("sms_providers")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getSmsProviderByCode");
  }
  return data as SmsProviderRow | null;
}

export async function createSmsProvider(input: {
  name: string;
  code: string;
  type?: string;
  status?: string;
  apiBaseUrl?: string | null;
  defaultSenderId?: string | null;
  supportsDlr?: boolean;
  priority?: number;
}): Promise<SmsProviderRow> {
  const { data, error } = await getSupabase()
    .from("sms_providers")
    .insert({
      name: input.name,
      code: input.code.toLowerCase().trim(),
      type: input.type ?? "http_api",
      status: input.status ?? "active",
      api_base_url: input.apiBaseUrl ?? null,
      auth_type: "env",
      default_sender_id: input.defaultSenderId ?? null,
      supports_dlr: input.supportsDlr ?? true,
      priority: input.priority ?? 100,
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError("Migración 014 no aplicada (sms_providers).", 503);
    }
    wrapSupabaseError(error, "createSmsProvider");
  }
  return data as SmsProviderRow;
}

export async function updateSmsProvider(
  id: string,
  patch: Partial<{
    name: string;
    status: string;
    api_base_url: string | null;
    default_sender_id: string | null;
    priority: number;
  }>,
): Promise<SmsProviderRow> {
  const { data, error } = await getSupabase()
    .from("sms_providers")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updateSmsProvider");
  }
  return data as SmsProviderRow;
}
