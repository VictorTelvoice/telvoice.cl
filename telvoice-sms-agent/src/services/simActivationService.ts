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
import {
  assignInventoryNumberToCompany,
  getInventoryById,
  isInventoryTechnicallyReady,
} from "./realNumberInventoryService.js";
import { activateAdminAgentPlanRequest } from "./adminAgentPlanService.js";
import { createAdminClientNumber } from "./adminClientNumberService.js";
import { insertAuditLog } from "./auditLogService.js";
import {
  sendSimActivationInProgressEmail,
  sendSimNumberActiveEmail,
} from "./transactionalEmailService.js";
import { getBundledAgentAddonForSimPlan, getSimPlan, isSimPlanId } from "../utils/simPlans.js";
import type { SimPlanId } from "../utils/simPlans.js";

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
    inventory_number_id:
      row.inventory_number_id != null ? String(row.inventory_number_id) : null,
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
  inventoryNumberId?: string;
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
      inventory_number_id: input.inventoryNumberId ?? null,
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

export async function linkSimActivationInventory(
  orderId: string,
  inventoryNumberId: string,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("sim_activation_requests")
    .update({ inventory_number_id: inventoryNumberId })
    .eq("order_id", orderId);
  if (error) {
    if (isMissingTableError(error)) return;
    throw wrapSupabaseError(error, "linkSimActivationInventory");
  }
}

function simClientNumberCapabilities(agentEnabled: boolean) {
  return {
    receive_sms: true,
    send_sms: true,
    otp_authorized: true,
    api_webhook: true,
    inbox_enabled: true,
    agent_enabled: agentEnabled,
    outbound_sms: true,
    inbound_sms: true,
  };
}

export type SimPostPaymentActivationResult = {
  autoActivated: boolean;
  activationId: string | null;
  reason?: string;
};

/** Tras pago aprobado: auto-asignar si el inventario está técnicamente listo. */
export async function processSimPostPaymentActivation(
  orderId: string,
): Promise<SimPostPaymentActivationResult> {
  const activation = await getSimActivationByOrderId(orderId);
  if (!activation) {
    return { autoActivated: false, activationId: null, reason: "no_activation" };
  }
  if (activation.activation_status === "active") {
    return { autoActivated: true, activationId: activation.id, reason: "already_active" };
  }
  if (!activation.company_id) {
    return { autoActivated: false, activationId: activation.id, reason: "no_company" };
  }
  if (!activation.inventory_number_id) {
    return { autoActivated: false, activationId: activation.id, reason: "no_inventory" };
  }

  const inventory = await getInventoryById(activation.inventory_number_id);
  if (!inventory) {
    return { autoActivated: false, activationId: activation.id, reason: "inventory_missing" };
  }

  if (!isInventoryTechnicallyReady(inventory)) {
    try {
      await sendSimActivationInProgressEmail(orderId);
    } catch (err) {
      console.error("[sim-activation] activation-in-progress email failed", orderId, err);
    }
    return {
      autoActivated: false,
      activationId: activation.id,
      reason: "inventory_not_ready",
    };
  }

  try {
    await activatePaidSimActivationRequest(activation.id);
    return { autoActivated: true, activationId: activation.id };
  } catch (err) {
    console.error("[sim-activation] auto-activate failed", orderId, err);
    try {
      await sendSimActivationInProgressEmail(orderId);
    } catch (emailErr) {
      console.error("[sim-activation] activation-in-progress email failed", orderId, emailErr);
    }
    return {
      autoActivated: false,
      activationId: activation.id,
      reason: "activate_failed",
    };
  }
}

export async function activatePaidSimActivationRequest(
  activationId: string,
  options?: { sendActivationEmail?: boolean },
): Promise<SimActivationRequestRow> {
  const activation = await getSimActivationById(activationId);
  if (!activation) {
    throw new AppError("Activación SIM no encontrada.", 404);
  }
  if (
    !["paid_pending_activation", "activation_review", "number_reserved", "number_assigned"].includes(
      activation.activation_status,
    )
  ) {
    throw new AppError(
      `No se puede activar en estado ${simActivationStatusLabel(activation.activation_status)}.`,
      400,
    );
  }
  if (!activation.company_id) {
    throw new AppError(
      "La activación no tiene empresa vinculada. Espera el aprovisionamiento post-pago.",
      400,
    );
  }
  if (!activation.inventory_number_id) {
    throw new AppError("La activación no tiene número de inventario asignado.", 400);
  }

  const inventory = await getInventoryById(activation.inventory_number_id);
  if (!inventory) {
    throw new AppError("Número de inventario no encontrado.", 404);
  }

  const planId = activation.plan_id as SimPlanId;
  const simPlan = getSimPlan(planId);
  const agentByOrderPre = await listAgentPlanRequestsByOrderIds([activation.order_id]);
  const agentReqPre = agentByOrderPre.get(activation.order_id);
  const agentEnabled =
    Boolean(agentReqPre) ||
    (isSimPlanId(planId) && Boolean(getBundledAgentAddonForSimPlan(planId)));
  const caps = simClientNumberCapabilities(agentEnabled);

  let clientNumberId = activation.client_number_id;

  if (!clientNumberId) {
    const sbLookup = getSupabase();
    const { data: existingCn } = await sbLookup
      .from("client_numbers")
      .select("id")
      .eq("company_id", activation.company_id)
      .eq("number", inventory.e164_number)
      .limit(1)
      .maybeSingle();
    if (existingCn?.id) {
      clientNumberId = String(existingCn.id);
    }
  }

  if (!clientNumberId) {
    const created = await createAdminClientNumber({
      company_id: activation.company_id,
      number: inventory.e164_number,
      country_code: inventory.country_code,
      type: "sim_real",
      status: "active",
      provider: inventory.provider,
      sim_slot: inventory.sim_slot ?? undefined,
      gateway_id: inventory.gateway_id ?? undefined,
      capabilities: caps,
    });
    clientNumberId = created.id;
  } else {
    const { updateAdminClientNumber } = await import("./adminClientNumberService.js");
    await updateAdminClientNumber(clientNumberId, {
      status: "active",
      capabilities: caps,
    });
  }

  await assignInventoryNumberToCompany({
    inventoryId: inventory.id,
    companyId: activation.company_id,
    clientNumberId,
    simActivationRequestId: activation.id,
  });

  const agentByOrder = await listAgentPlanRequestsByOrderIds([activation.order_id]);
  const agentReq = agentByOrder.get(activation.order_id);
  if (agentReq && agentReq.status === "paid_pending_setup") {
    await activateAdminAgentPlanRequest(agentReq.id, {
      includedNumberId: clientNumberId,
    });
  }

  const sb = getSupabase();
  const { data, error } = await sb
    .from("sim_activation_requests")
    .update({
      activation_status: "active",
      client_number_id: clientNumberId,
      activated_at: new Date().toISOString(),
    })
    .eq("id", activationId)
    .select("*")
    .single();

  if (error) throw wrapSupabaseError(error, "activatePaidSimActivationRequest");

  const activated = mapRow(data as Record<string, unknown>);

  await insertAuditLog({
    companyId: activation.company_id,
    action: "sim.number.activated",
    entityType: "sim_activation_request",
    entityId: activationId,
    metadata: {
      order_id: activation.order_id,
      client_number_id: clientNumberId,
      inventory_number_id: inventory.id,
      plan_id: planId,
      auto: options?.sendActivationEmail !== false,
    },
  });

  if (options?.sendActivationEmail !== false) {
    try {
      await sendSimNumberActiveEmail(activation.order_id, {
        assignedNumber: inventory.e164_number,
        planName: simPlan?.name ?? activation.plan_name,
      });
    } catch (err) {
      console.error("[sim-activation] number-active email failed", activation.order_id, err);
    }
  }

  return activated;
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

