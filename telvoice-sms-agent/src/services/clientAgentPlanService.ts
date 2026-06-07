import { getSupabase } from "../database/supabaseClient.js";
import {
  AGENT_PLAN_DEFINITIONS,
  type AgentPlanCode,
  type AgentPlanRequestRow,
  type AgentPlanSubscriptionRow,
} from "../types/client-numbers.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

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

export function getAgentPlanDefinition(code: AgentPlanCode) {
  return AGENT_PLAN_DEFINITIONS.find((p) => p.code === code);
}

export async function getActiveAgentPlanSubscription(
  companyId: string,
): Promise<AgentPlanSubscriptionRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("agent_plan_subscriptions")
    .select("*")
    .eq("company_id", companyId)
    .in("status", ["active", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw wrapSupabaseError(error, "agent_plan_subscriptions");
  }
  if (!data) return null;
  return mapSubscription(data as Record<string, unknown>);
}

export async function listAgentPlanRequests(
  companyId: string,
): Promise<AgentPlanRequestRow[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("agent_plan_requests")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    if (isMissingTableError(error)) return [];
    throw wrapSupabaseError(error, "agent_plan_requests");
  }
  return (data ?? []).map((r) => mapRequest(r as Record<string, unknown>));
}

export async function createAgentPlanRequest(
  companyId: string,
  planCode: AgentPlanCode,
  preferredNumberType: "sim_real" | "fixed_line" | "either" = "either",
): Promise<AgentPlanRequestRow> {
  const plan = getAgentPlanDefinition(planCode);
  if (!plan) {
    throw new AppError("Plan no válido.", 400);
  }

  const sb = getSupabase();

  const { data: existing } = await sb
    .from("agent_plan_requests")
    .select("id, status")
    .eq("company_id", companyId)
    .eq("plan_code", planCode)
    .in("status", ["pending", "reviewing", "approved"])
    .maybeSingle();

  if (existing) {
    throw new AppError(
      "Ya existe una solicitud pendiente para este plan. Telvoice la revisará pronto.",
      409,
    );
  }

  const { data, error } = await sb
    .from("agent_plan_requests")
    .insert({
      company_id: companyId,
      plan_code: planCode,
      preferred_number_type: preferredNumberType,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError(
        "Módulo de planes del agente no disponible. Aplica la migración 054.",
        503,
      );
    }
    throw wrapSupabaseError(error, "agent_plan_requests");
  }

  return mapRequest(data as Record<string, unknown>);
}

export type AgentDashboardData = {
  subscription: AgentPlanSubscriptionRow | null;
  pendingRequests: AgentPlanRequestRow[];
  planDefinition: (typeof AGENT_PLAN_DEFINITIONS)[number] | null;
};

export async function getAgentDashboardData(
  companyId: string,
): Promise<AgentDashboardData> {
  const [subscription, pendingRequests] = await Promise.all([
    getActiveAgentPlanSubscription(companyId),
    listAgentPlanRequests(companyId),
  ]);

  const activePending = pendingRequests.filter((r) =>
    ["pending", "reviewing", "approved"].includes(r.status),
  );

  const planDefinition = subscription
    ? getAgentPlanDefinition(subscription.plan_code) ?? null
    : null;

  return {
    subscription,
    pendingRequests: activePending,
    planDefinition,
  };
}

export function agentPlanStatusLabel(
  status: AgentPlanSubscriptionRow["status"] | AgentPlanRequestRow["status"],
): string {
  const map: Record<string, string> = {
    pending: "Pendiente",
    reviewing: "En revisión",
    approved: "Aprobado",
    rejected: "Rechazado",
    activated: "Activado",
    active: "Activo",
    suspended: "Suspendido",
    cancelled: "Cancelado",
  };
  return map[status] ?? status;
}
