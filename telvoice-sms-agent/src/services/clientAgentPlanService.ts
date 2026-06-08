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
    order_id: row.order_id != null ? String(row.order_id) : null,
    checkout_email: row.checkout_email != null ? String(row.checkout_email) : null,
    use_case: row.use_case != null ? String(row.use_case) : null,
    source: row.source != null ? String(row.source) : null,
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

export function agentPlanRequestStatusMessage(
  status: AgentPlanRequestRow["status"],
): string {
  const map: Record<AgentPlanRequestRow["status"], string> = {
    pending:
      "Solicitud recibida. Estamos revisando disponibilidad de línea.",
    reviewing: "Solicitud en revisión comercial.",
    approved: "Solicitud aprobada. Falta activación de numeración.",
    activated: "Plan activo.",
    paid_pending_setup:
      "Pago recibido. Estamos configurando tu agente Telvoice.",
    rejected:
      "No fue posible activar esta solicitud. Contacta a Telvoice.",
  };
  return map[status] ?? agentPlanStatusLabel(status);
}

export function preferredNumberTypeLabel(
  type: AgentPlanRequestRow["preferred_number_type"],
): string {
  const map: Record<AgentPlanRequestRow["preferred_number_type"], string> = {
    sim_real: "SIM real",
    fixed_line: "Red fija",
    either: "Cualquiera según disponibilidad",
  };
  return map[type] ?? type;
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

  const activeSubscription = await getActiveAgentPlanSubscription(companyId);
  if (activeSubscription?.status === "active") {
    throw new AppError("Ya tienes un plan agente activo.", 409);
  }

  const { data: existing } = await sb
    .from("agent_plan_requests")
    .select("id, status")
    .eq("company_id", companyId)
    .eq("plan_code", planCode)
    .in("status", ["pending", "reviewing", "approved"])
    .maybeSingle();

  if (existing) {
    throw new AppError(
      "Ya tienes una solicitud pendiente para este plan.",
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

export async function createAgentPlanRequestFromCheckout(input: {
  companyId: string;
  orderId: string;
  planCode: AgentPlanCode;
  checkoutEmail: string;
  useCase?: string;
}): Promise<AgentPlanRequestRow> {
  const plan = getAgentPlanDefinition(input.planCode);
  if (!plan) {
    throw new AppError("Plan agente no válido.", 400);
  }

  const sb = getSupabase();

  const { data: existingByOrder } = await sb
    .from("agent_plan_requests")
    .select("*")
    .eq("order_id", input.orderId)
    .maybeSingle();

  if (existingByOrder) {
    return mapRequest(existingByOrder as Record<string, unknown>);
  }

  const { data, error } = await sb
    .from("agent_plan_requests")
    .insert({
      company_id: input.companyId,
      order_id: input.orderId,
      plan_code: input.planCode,
      preferred_number_type: "sim_real",
      status: "paid_pending_setup",
      checkout_email: input.checkoutEmail.trim().toLowerCase(),
      use_case: input.useCase?.trim() || null,
      source: "landing_sim_agent_bundle",
      notes: `Checkout bundle ${input.orderId.slice(0, 8)}`,
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError(
        "Módulo de planes del agente no disponible. Aplica la migración 056.",
        503,
      );
    }
    if (error.code === "23505") {
      const { data: again } = await sb
        .from("agent_plan_requests")
        .select("*")
        .eq("order_id", input.orderId)
        .maybeSingle();
      if (again) return mapRequest(again as Record<string, unknown>);
    }
    throw wrapSupabaseError(error, "agent_plan_requests.checkout");
  }

  return mapRequest(data as Record<string, unknown>);
}

export async function getAgentPlanRequestByOrderId(
  orderId: string,
): Promise<AgentPlanRequestRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("agent_plan_requests")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return null;
    throw wrapSupabaseError(error, "agent_plan_requests.byOrder");
  }
  return data ? mapRequest(data as Record<string, unknown>) : null;
}

export async function listPendingCheckoutAgentRequestsForCompany(
  companyId: string,
): Promise<AgentPlanRequestRow[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("agent_plan_requests")
    .select("*")
    .eq("company_id", companyId)
    .in("status", ["paid_pending_setup", "pending", "reviewing", "approved"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    if (isMissingTableError(error)) return [];
    throw wrapSupabaseError(error, "agent_plan_requests.pendingCheckout");
  }

  return (data ?? []).map((row) => mapRequest(row as Record<string, unknown>));
}

export async function listAgentPlanRequestsByOrderIds(
  orderIds: string[],
): Promise<Map<string, AgentPlanRequestRow>> {
  const map = new Map<string, AgentPlanRequestRow>();
  if (!orderIds.length) return map;

  const sb = getSupabase();
  const { data, error } = await sb
    .from("agent_plan_requests")
    .select("*")
    .in("order_id", orderIds);

  if (error) {
    if (isMissingTableError(error)) return map;
    throw wrapSupabaseError(error, "agent_plan_requests.byOrderIds");
  }

  for (const row of data ?? []) {
    const mapped = mapRequest(row as Record<string, unknown>);
    if (mapped.order_id) {
      map.set(mapped.order_id, mapped);
    }
  }
  return map;
}

export type AgentPlanStatusPayload = {
  subscription: AgentPlanSubscriptionRow | null;
  requests: AgentPlanRequestRow[];
  pendingRequests: AgentPlanRequestRow[];
};

export async function getAgentPlanStatusPayload(
  companyId: string,
): Promise<AgentPlanStatusPayload> {
  const [subscription, requests] = await Promise.all([
    getActiveAgentPlanSubscription(companyId),
    listAgentPlanRequests(companyId),
  ]);
  const pendingRequests = requests.filter((r) =>
    ["pending", "reviewing", "approved", "rejected", "activated"].includes(
      r.status,
    ),
  );
  return { subscription, requests, pendingRequests };
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
    paid_pending_setup: "Pagado — pendiente configuración",
    active: "Activo",
    suspended: "Suspendido",
    cancelled: "Cancelado",
  };
  return map[status] ?? status;
}
