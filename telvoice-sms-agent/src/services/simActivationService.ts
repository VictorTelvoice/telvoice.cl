import { getSupabase } from "../database/supabaseClient.js";
import type {
  SimActivationRequestListItem,
  SimActivationRequestRow,
  SimActivationStatus,
} from "../types/sim-activation.js";
import type { SimPlanDefinition } from "../utils/simPlans.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { listAgentPlanRequestsByOrderIds, getAgentPlanDefinition } from "./clientAgentPlanService.js";

export type SimActivationModuleState = {
  available: boolean;
  migrationPending: boolean;
};

const PENDING_ADMIN_STATUSES: SimActivationStatus[] = [
  "paid_pending_activation",
  "activation_review",
  "number_reserved",
  "number_assigned",
];

function mapRow(row: Record<string, unknown>): SimActivationRequestRow {
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    company_id: row.company_id != null ? String(row.company_id) : null,
    checkout_email: String(row.checkout_email),
    payer_name: row.payer_name != null ? String(row.payer_name) : null,
    company_name: row.company_name != null ? String(row.company_name) : null,
    phone: row.phone != null ? String(row.phone) : null,
    tax_id: row.tax_id != null ? String(row.tax_id) : null,
    plan_id: String(row.plan_id),
    plan_name: String(row.plan_name),
    included_sms_monthly: Number(row.included_sms_monthly),
    activation_status: row.activation_status as SimActivationStatus,
    client_number_id:
      row.client_number_id != null ? String(row.client_number_id) : null,
    admin_notes: row.admin_notes != null ? String(row.admin_notes) : null,
    use_case: row.use_case != null ? String(row.use_case) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    activated_at: row.activated_at != null ? String(row.activated_at) : null,
    rejected_at: row.rejected_at != null ? String(row.rejected_at) : null,
  };
}

export async function getSimActivationModuleState(): Promise<SimActivationModuleState> {
  const sb = getSupabase();
  const { error } = await sb.from("sim_activation_requests").select("id").limit(1);
  if (error) {
    if (isMissingTableError(error)) {
      return { available: false, migrationPending: true };
    }
    throw wrapSupabaseError(error, "sim_activation_requests");
  }
  return { available: true, migrationPending: false };
}

export async function getSimActivationById(
  id: string,
): Promise<SimActivationRequestRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("sim_activation_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return null;
    throw wrapSupabaseError(error, "sim_activation_requests");
  }
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function getSimActivationByOrderId(
  orderId: string,
): Promise<SimActivationRequestRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("sim_activation_requests")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return null;
    throw wrapSupabaseError(error, "sim_activation_requests");
  }
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function createSimActivationRequest(input: {
  orderId: string;
  plan: SimPlanDefinition;
  checkoutEmail: string;
  payerName?: string;
  companyName?: string;
  phone?: string;
  taxId?: string;
  useCase?: string;
  activationStatus?: SimActivationStatus;
}): Promise<SimActivationRequestRow> {
  const existing = await getSimActivationByOrderId(input.orderId);
  if (existing) {
    return existing;
  }

  const sb = getSupabase();
  const { data, error } = await sb
    .from("sim_activation_requests")
    .insert({
      order_id: input.orderId,
      checkout_email: input.checkoutEmail.trim().toLowerCase(),
      payer_name: input.payerName?.trim() || null,
      company_name: input.companyName?.trim() || null,
      phone: input.phone?.trim() || null,
      tax_id: input.taxId?.trim() || null,
      use_case: input.useCase?.trim() || null,
      plan_id: input.plan.plan_id,
      plan_name: input.plan.name,
      included_sms_monthly: input.plan.sms_quantity,
      activation_status: input.activationStatus ?? "pending_payment",
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const again = await getSimActivationByOrderId(input.orderId);
      if (again) return again;
    }
    throw wrapSupabaseError(error, "createSimActivationRequest");
  }

  return mapRow(data as Record<string, unknown>);
}

export async function markSimActivationPaidPending(
  orderId: string,
): Promise<SimActivationRequestRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("sim_activation_requests")
    .update({ activation_status: "paid_pending_activation" })
    .eq("order_id", orderId)
    .neq("activation_status", "paid_pending_activation")
    .select("*")
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw wrapSupabaseError(error, "markSimActivationPaidPending");
  }

  if (data) {
    return mapRow(data as Record<string, unknown>);
  }

  const { data: existing } = await sb
    .from("sim_activation_requests")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (existing) {
    return mapRow(existing as Record<string, unknown>);
  }

  return null;
}

export async function linkSimActivationToCompany(
  orderId: string,
  companyId: string,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("sim_activation_requests")
    .update({ company_id: companyId })
    .eq("order_id", orderId);
  if (error) {
    if (isMissingTableError(error)) return;
    throw wrapSupabaseError(error, "linkSimActivationToCompany");
  }
}

export async function listPendingSimActivationsForCompany(
  companyId: string,
): Promise<SimActivationRequestRow[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("sim_activation_requests")
    .select("*")
    .eq("company_id", companyId)
    .in("activation_status", PENDING_ADMIN_STATUSES)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTableError(error)) return [];
    throw wrapSupabaseError(error, "listPendingSimActivationsForCompany");
  }
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function listAdminPendingSimActivations(
  limit = 100,
): Promise<SimActivationRequestListItem[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("sim_activation_requests")
    .select(
      "*, sms_orders(amount, currency, public_checkout_reference), companies(name)",
    )
    .in("activation_status", PENDING_ADMIN_STATUSES)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) return [];
    throw wrapSupabaseError(error, "listAdminPendingSimActivations");
  }

  const orderIds = (data ?? []).map((row) => String((row as { order_id?: string }).order_id));
  const agentByOrder = await listAgentPlanRequestsByOrderIds(orderIds);

  return (data ?? []).map((row) => {
    const mapped = mapRow(row as Record<string, unknown>);
    const order = (row as { sms_orders?: Record<string, unknown> }).sms_orders;
    const company = (row as { companies?: { name?: string } }).companies;
    const agentReq = agentByOrder.get(mapped.order_id);
    const agentDef = agentReq ? getAgentPlanDefinition(agentReq.plan_code) : null;
    return {
      ...mapped,
      public_checkout_reference:
        order?.public_checkout_reference != null
          ? String(order.public_checkout_reference)
          : null,
      order_amount: order?.amount != null ? Number(order.amount) : null,
      order_currency: order?.currency != null ? String(order.currency) : null,
      company_display_name: company?.name ?? mapped.company_name,
      agent_plan_name: agentDef?.name ?? null,
      agent_plan_status: agentReq?.status ?? null,
      agent_use_case: agentReq?.use_case ?? mapped.use_case,
    };
  });
}

export async function updateSimActivationStatus(
  id: string,
  status: SimActivationStatus,
  adminNotes?: string,
): Promise<SimActivationRequestRow> {
  const allowed: SimActivationStatus[] = [
    "paid_pending_activation",
    "activation_review",
    "number_reserved",
    "number_assigned",
    "active",
    "rejected",
    "cancelled",
  ];
  if (!allowed.includes(status)) {
    throw new AppError("Estado de activación no válido.", 400);
  }

  const patch: Record<string, unknown> = { activation_status: status };
  if (adminNotes !== undefined) {
    patch.admin_notes = adminNotes.trim() || null;
  }
  if (status === "rejected") {
    patch.rejected_at = new Date().toISOString();
  }
  if (status === "active") {
    patch.activated_at = new Date().toISOString();
  }

  const sb = getSupabase();
  const { data, error } = await sb
    .from("sim_activation_requests")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw wrapSupabaseError(error, "updateSimActivationStatus");
  }

  return mapRow(data as Record<string, unknown>);
}

export function simActivationStatusLabel(status: SimActivationStatus): string {
  const map: Record<SimActivationStatus, string> = {
    pending_payment: "Pago pendiente",
    paid_pending_activation: "Pagado — pendiente activación",
    activation_review: "En revisión",
    number_reserved: "Número reservado",
    number_assigned: "Número asignado",
    active: "Activo",
    rejected: "Rechazado",
    cancelled: "Cancelado",
  };
  return map[status] ?? status;
}

