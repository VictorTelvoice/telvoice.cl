import { getSupabase } from "../database/supabaseClient.js";
import type {
  AgentPlanCode,
  ClientNumberCapabilities,
  ClientNumberListItem,
  ClientNumberRow,
  ClientNumberStatus,
  ClientNumberType,
  ClientNumbersModuleState,
} from "../types/client-numbers.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

const PLAN_LABELS: Record<AgentPlanCode, string> = {
  start: "Start",
  pro: "Pro",
  business: "Business",
};

function parseCapabilities(raw: unknown): ClientNumberCapabilities {
  if (!raw || typeof raw !== "object") return {};
  const c = raw as Record<string, unknown>;
  return {
    receive_sms: c.receive_sms === true,
    send_sms: c.send_sms === true,
    otp_authorized: c.otp_authorized === true,
    api_webhook: c.api_webhook === true,
  };
}

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
    capabilities: parseCapabilities(row.capabilities),
    assigned_agent_id:
      row.assigned_agent_id != null ? String(row.assigned_agent_id) : null,
    activated_at: row.activated_at != null ? String(row.activated_at) : null,
    renewed_at: row.renewed_at != null ? String(row.renewed_at) : null,
    expires_at: row.expires_at != null ? String(row.expires_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function getClientNumbersModuleState(): Promise<ClientNumbersModuleState> {
  const sb = getSupabase();
  const { error } = await sb.from("client_numbers").select("id").limit(1);
  if (error) {
    if (isMissingTableError(error)) {
      return { available: false, migrationPending: true };
    }
    throw wrapSupabaseError(error, "client_numbers");
  }
  return { available: true, migrationPending: false };
}

export async function listClientNumbersByCompany(
  companyId: string,
): Promise<ClientNumberListItem[]> {
  const sb = getSupabase();
  const { data: numbers, error } = await sb
    .from("client_numbers")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error)) return [];
    throw wrapSupabaseError(error, "client_numbers");
  }

  if (!numbers?.length) return [];

  const numberIds = numbers.map((n) => n.id as string);

  const [subsRes, smsRes] = await Promise.all([
    sb
      .from("agent_plan_subscriptions")
      .select("plan_code, included_number_id, status")
      .eq("company_id", companyId)
      .in("status", ["active", "pending"]),
    sb
      .from("inbound_sms_messages")
      .select("client_number_id, from_number, received_at")
      .eq("company_id", companyId)
      .in("client_number_id", numberIds)
      .order("received_at", { ascending: false }),
  ]);

  const planByNumber = new Map<string, AgentPlanCode>();
  for (const sub of subsRes.data ?? []) {
    const nid = sub.included_number_id as string | null;
    if (nid && sub.plan_code) {
      planByNumber.set(nid, sub.plan_code as AgentPlanCode);
    }
  }

  const lastSmsByNumber = new Map<
    string,
    { received_at: string; from_number: string | null }
  >();
  for (const sms of smsRes.data ?? []) {
    const nid = sms.client_number_id as string;
    if (!lastSmsByNumber.has(nid)) {
      lastSmsByNumber.set(nid, {
        received_at: String(sms.received_at),
        from_number: sms.from_number != null ? String(sms.from_number) : null,
      });
    }
  }

  return numbers.map((row) => {
    const mapped = mapRow(row as Record<string, unknown>);
    const planCode = planByNumber.get(mapped.id) ?? null;
    const lastSms = lastSmsByNumber.get(mapped.id);
    return {
      ...mapped,
      plan_code: planCode,
      plan_label: planCode ? PLAN_LABELS[planCode] : "Sin plan",
      has_agent: mapped.assigned_agent_id != null,
      last_sms_at: lastSms?.received_at ?? null,
      last_sms_from: lastSms?.from_number ?? null,
    };
  });
}

export async function getClientNumberById(
  companyId: string,
  numberId: string,
): Promise<ClientNumberRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("client_numbers")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", numberId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw wrapSupabaseError(error, "client_numbers");
  }
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

export function clientNumberTypeLabel(type: ClientNumberType): string {
  const map: Record<ClientNumberType, string> = {
    sim_real: "SIM real",
    fixed_line: "Red fija",
    virtual: "Virtual",
    other: "Otro",
  };
  return map[type] ?? type;
}

export function clientNumberStatusLabel(status: ClientNumberStatus): string {
  const map: Record<ClientNumberStatus, string> = {
    available: "Disponible",
    reserved: "Reservado",
    pending_activation: "Pendiente de activación",
    active: "Activo",
    suspended: "Suspendido",
    cancelled: "Cancelado",
  };
  return map[status] ?? status;
}
