import { getSupabase } from "../database/supabaseClient.js";
import type {
  CreatePublicLeadInput,
  PublicLeadRow,
  PublicLeadStatus,
} from "../types/commercial.js";
import { ValidationError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export async function createPublicLead(
  input: CreatePublicLeadInput,
): Promise<PublicLeadRow> {
  const hasContact =
    (input.email?.trim().length ?? 0) > 0 ||
    (input.phone?.trim().length ?? 0) > 0;

  if (!hasContact) {
    throw new ValidationError("Se requiere email o teléfono/WhatsApp.");
  }

  const { data, error } = await getSupabase()
    .from("public_leads")
    .insert({
      name: input.name?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      company: input.company?.trim() || null,
      country: input.country?.trim() || "CL",
      message: input.message?.trim() || null,
      requested_quantity: input.requested_quantity ?? null,
      source: input.source ?? "telegram_agent",
      status: "new",
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "createPublicLead");
  }

  return data as PublicLeadRow;
}

export async function listPublicLeads(options?: {
  status?: PublicLeadStatus;
  limit?: number;
}): Promise<PublicLeadRow[]> {
  let query = getSupabase()
    .from("public_leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (options?.status) {
    query = query.eq("status", options.status);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    wrapSupabaseError(error, "listPublicLeads");
  }

  return (data ?? []) as PublicLeadRow[];
}

export async function updatePublicLeadStatus(
  id: string,
  status: PublicLeadStatus,
): Promise<PublicLeadRow> {
  const { data, error } = await getSupabase()
    .from("public_leads")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updatePublicLeadStatus");
  }

  return data as PublicLeadRow;
}
