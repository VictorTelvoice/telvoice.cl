import { getSupabase } from "../database/supabaseClient.js";
import type {
  ClientNumberListItem,
  ClientNumberRow,
  ClientNumberStatus,
  ClientNumberType,
} from "../types/client-numbers.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export type AdminClientNumberItem = ClientNumberRow & {
  company_name: string;
};

export type AdminNumeracionesFilters = {
  status?: ClientNumberStatus | "";
  type?: ClientNumberType | "";
  company_id?: string;
  q?: string;
};

export type CreateClientNumberAdminInput = {
  company_id: string;
  number: string;
  country_code?: string;
  type: ClientNumberType;
  status?: ClientNumberStatus;
  provider?: string;
  sim_slot?: string;
  gateway_id?: string;
  capabilities?: Record<string, boolean>;
};

function mapRow(row: Record<string, unknown>): ClientNumberRow {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    number: String(row.number),
    country_code: row.country_code != null ? String(row.country_code) : null,
    type: row.type as ClientNumberType,
    status: row.status as ClientNumberStatus,
    provider: row.provider != null ? String(row.provider) : null,
    sim_slot: row.sim_slot != null ? String(row.sim_slot) : null,
    gateway_id: row.gateway_id != null ? String(row.gateway_id) : null,
    capabilities:
      row.capabilities && typeof row.capabilities === "object"
        ? (row.capabilities as ClientNumberListItem["capabilities"])
        : {},
    assigned_agent_id:
      row.assigned_agent_id != null ? String(row.assigned_agent_id) : null,
    activated_at: row.activated_at != null ? String(row.activated_at) : null,
    renewed_at: row.renewed_at != null ? String(row.renewed_at) : null,
    expires_at: row.expires_at != null ? String(row.expires_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listAdminClientNumbers(
  filters: AdminNumeracionesFilters = {},
  limit = 200,
): Promise<AdminClientNumberItem[]> {
  const sb = getSupabase();
  let query = sb
    .from("client_numbers")
    .select("*, companies(name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.company_id) query = query.eq("company_id", filters.company_id);

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return [];
    throw wrapSupabaseError(error, "client_numbers");
  }

  let rows = (data ?? []).map((row) => {
    const mapped = mapRow(row as Record<string, unknown>);
    const company = (row as { companies?: { name?: string } }).companies;
    return { ...mapped, company_name: company?.name ?? "—" };
  });

  if (filters.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.number.toLowerCase().includes(q) ||
        r.company_name.toLowerCase().includes(q) ||
        (r.provider?.toLowerCase().includes(q) ?? false),
    );
  }

  return rows;
}

export async function getAdminClientNumberById(
  id: string,
): Promise<AdminClientNumberItem | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("client_numbers")
    .select("*, companies(name)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw wrapSupabaseError(error, "client_numbers");
  }
  if (!data) return null;
  const company = (data as { companies?: { name?: string } }).companies;
  return {
    ...mapRow(data as Record<string, unknown>),
    company_name: company?.name ?? "—",
  };
}

export async function createAdminClientNumber(
  input: CreateClientNumberAdminInput,
): Promise<AdminClientNumberItem> {
  const number = input.number.trim();
  if (!number) throw new AppError("El número es obligatorio.", 400);

  const sb = getSupabase();
  const { data, error } = await sb
    .from("client_numbers")
    .insert({
      company_id: input.company_id,
      number,
      country_code: input.country_code?.trim() || "CL",
      type: input.type,
      status: input.status ?? "pending_activation",
      provider: input.provider?.trim() || null,
      sim_slot: input.sim_slot?.trim() || null,
      gateway_id: input.gateway_id?.trim() || null,
      capabilities: input.capabilities ?? {
        receive_sms: true,
        send_sms: false,
        otp_authorized: true,
        api_webhook: false,
      },
      activated_at:
        input.status === "active" ? new Date().toISOString() : null,
    })
    .select("*, companies(name)")
    .single();

  if (error) throw wrapSupabaseError(error, "client_numbers");
  const company = (data as { companies?: { name?: string } }).companies;
  return {
    ...mapRow(data as Record<string, unknown>),
    company_name: company?.name ?? "—",
  };
}

export async function updateAdminClientNumber(
  id: string,
  patch: Partial<{
    company_id: string;
    number: string;
    country_code: string;
    type: ClientNumberType;
    status: ClientNumberStatus;
    provider: string | null;
    sim_slot: string | null;
    gateway_id: string | null;
    capabilities: Record<string, boolean>;
    activated_at: string | null;
    expires_at: string | null;
  }>,
): Promise<AdminClientNumberItem> {
  const sb = getSupabase();
  const update: Record<string, unknown> = { ...patch };
  if (patch.status === "active" && !patch.activated_at) {
    update.activated_at = new Date().toISOString();
  }

  const { data, error } = await sb
    .from("client_numbers")
    .update(update)
    .eq("id", id)
    .select("*, companies(name)")
    .single();

  if (error) throw wrapSupabaseError(error, "client_numbers");
  const company = (data as { companies?: { name?: string } }).companies;
  return {
    ...mapRow(data as Record<string, unknown>),
    company_name: company?.name ?? "—",
  };
}

export async function listClientNumbersByCompanyId(
  companyId: string,
): Promise<AdminClientNumberItem[]> {
  return listAdminClientNumbers({ company_id: companyId }, 50);
}
