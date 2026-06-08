import { getSupabase } from "../database/supabaseClient.js";
import {
  getAgentPlanDefinition,
  agentPlanStatusLabel,
} from "./clientAgentPlanService.js";
import type {
  AgentPlanCode,
  AgentPlanRequestRow,
  AgentPlanRequestStatus,
  AgentPlanSubscriptionRow,
} from "../types/client-numbers.js";
import { AGENT_PLAN_DEFINITIONS } from "../types/client-numbers.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export type AdminAgentPlanModuleState = {
  available: boolean;
  migrationPending: boolean;
};

export type AdminAgentPlanRequestItem = AgentPlanRequestRow & {
  company_name: string;
};

export type AdminAgentPlanSubscriptionItem = AgentPlanSubscriptionRow & {
  company_name: string;
  number_label: string | null;
};

export type AdminAgentPlanFilters = {
  status?: AgentPlanRequestStatus | "";
  plan_code?: AgentPlanCode | "";
  company_id?: string;
  q?: string;
};

function mapRequest(row: Record<string, unknown>): AgentPlanRequestRow {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    plan_code: row.plan_code as AgentPlanCode,
    preferred_number_type: row.preferred_number_type as AgentPlanRequestRow["preferred_number_type"],
    status: row.status as AgentPlanRequestRow["status"],
    notes: row.notes != null ? String(row.notes) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapSubscription(row: Record<string, unknown>): AgentPlanSubscriptionRow {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    plan_code: row.plan_code as AgentPlanCode,
    status: row.status as AgentPlanSubscriptionRow["status"],
    monthly_price_clp: Number(row.monthly_price_clp),
    included_number_id:
      row.included_number_id != null ? String(row.included_number_id) : null,
    billing_cycle: String(row.billing_cycle ?? "monthly"),
    starts_at: row.starts_at != null ? String(row.starts_at) : null,
    renews_at: row.renews_at != null ? String(row.renews_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function getAdminAgentPlanModuleState(): Promise<AdminAgentPlanModuleState> {
  const sb = getSupabase();
  const { error } = await sb.from("agent_plan_requests").select("id").limit(1);
  if (error) {
    if (isMissingTableError(error)) {
      return { available: false, migrationPending: true };
    }
    throw wrapSupabaseError(error, "agent_plan_requests");
  }
  return { available: true, migrationPending: false };
}

export async function listAdminAgentPlanRequests(
  filters: AdminAgentPlanFilters = {},
  limit = 100,
): Promise<AdminAgentPlanRequestItem[]> {
  const sb = getSupabase();
  let query = sb
    .from("agent_plan_requests")
    .select("*, companies(name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.plan_code) query = query.eq("plan_code", filters.plan_code);
  if (filters.company_id) query = query.eq("company_id", filters.company_id);

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return [];
    throw wrapSupabaseError(error, "agent_plan_requests");
  }

  let rows = (data ?? []).map((row) => {
    const mapped = mapRequest(row as Record<string, unknown>);
    const company = (row as { companies?: { name?: string } }).companies;
    return {
      ...mapped,
      company_name: company?.name ?? "—",
    };
  });

  if (filters.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.company_name.toLowerCase().includes(q) ||
        r.plan_code.includes(q) ||
        r.id.toLowerCase().includes(q),
    );
  }

  return rows;
}

export async function listAdminAgentPlanSubscriptions(
  limit = 100,
): Promise<AdminAgentPlanSubscriptionItem[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("agent_plan_subscriptions")
    .select("*, companies(name), client_numbers(number)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) return [];
    throw wrapSupabaseError(error, "agent_plan_subscriptions");
  }

  return (data ?? []).map((row) => {
    const mapped = mapSubscription(row as Record<string, unknown>);
    const r = row as {
      companies?: { name?: string };
      client_numbers?: { number?: string } | null;
    };
    return {
      ...mapped,
      company_name: r.companies?.name ?? "—",
      number_label: r.client_numbers?.number ?? null,
    };
  });
}

export async function getAdminAgentPlanRequestById(
  id: string,
): Promise<AdminAgentPlanRequestItem | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("agent_plan_requests")
    .select("*, companies(name)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw wrapSupabaseError(error, "agent_plan_requests");
  }
  if (!data) return null;
  const company = (data as { companies?: { name?: string } }).companies;
  return {
    ...mapRequest(data as Record<string, unknown>),
    company_name: company?.name ?? "—",
  };
}

export async function updateAdminAgentPlanRequestStatus(
  requestId: string,
  status: AgentPlanRequestStatus,
  notes?: string,
): Promise<AdminAgentPlanRequestItem> {
  const sb = getSupabase();
  const patch: Record<string, unknown> = { status };
  if (notes !== undefined) patch.notes = notes;

  const { data, error } = await sb
    .from("agent_plan_requests")
    .update(patch)
    .eq("id", requestId)
    .select("*, companies(name)")
    .single();

  if (error) throw wrapSupabaseError(error, "agent_plan_requests");
  const company = (data as { companies?: { name?: string } }).companies;
  return {
    ...mapRequest(data as Record<string, unknown>),
    company_name: company?.name ?? "—",
  };
}

export async function activateAdminAgentPlanRequest(
  requestId: string,
  options?: { includedNumberId?: string | null },
): Promise<{
  request: AdminAgentPlanRequestItem;
  subscription: AgentPlanSubscriptionRow;
}> {
  const request = await getAdminAgentPlanRequestById(requestId);
  if (!request) {
    throw new AppError("Solicitud no encontrada.", 404);
  }
  if (!["pending", "reviewing", "approved"].includes(request.status)) {
    throw new AppError(
      `No se puede activar una solicitud en estado ${agentPlanStatusLabel(request.status)}.`,
      400,
    );
  }

  const plan = getAgentPlanDefinition(request.plan_code);
  if (!plan) throw new AppError("Plan no válido.", 400);

  const sb = getSupabase();

  const { data: existingSub } = await sb
    .from("agent_plan_subscriptions")
    .select("id")
    .eq("company_id", request.company_id)
    .eq("status", "active")
    .maybeSingle();

  if (existingSub) {
    throw new AppError("La empresa ya tiene un plan agente activo.", 409);
  }

  if (options?.includedNumberId) {
    const { data: numberRow } = await sb
      .from("client_numbers")
      .select("id, company_id")
      .eq("id", options.includedNumberId)
      .maybeSingle();
    if (!numberRow || numberRow.company_id !== request.company_id) {
      throw new AppError("La numeración no pertenece a la empresa.", 400);
    }
  }

  const now = new Date();
  const renews = new Date(now);
  renews.setMonth(renews.getMonth() + 1);

  const { data: sub, error: subErr } = await sb
    .from("agent_plan_subscriptions")
    .insert({
      company_id: request.company_id,
      plan_code: request.plan_code,
      status: "active",
      monthly_price_clp: plan.priceClp,
      included_number_id: options?.includedNumberId ?? null,
      billing_cycle: "monthly",
      starts_at: now.toISOString(),
      renews_at: renews.toISOString(),
    })
    .select("*")
    .single();

  if (subErr) throw wrapSupabaseError(subErr, "agent_plan_subscriptions");

  const updated = await updateAdminAgentPlanRequestStatus(
    requestId,
    "activated",
    request.notes ?? undefined,
  );

  return {
    request: updated,
    subscription: mapSubscription(sub as Record<string, unknown>),
  };
}

export { AGENT_PLAN_DEFINITIONS };
