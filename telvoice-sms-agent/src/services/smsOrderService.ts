import { getSupabase } from "../database/supabaseClient.js";
import { insertAuditLog } from "./auditLogService.js";
import { isDuplicateKeyError } from "../utils/supabase-errors.js";
import { getSmsPackageById } from "./smsPackageService.js";
import { applyPurchaseCredit } from "./smsWalletService.js";
import type { SmsOrderRow, SmsOrderWithDetails } from "../types/wallet.js";
import { isMissingTableError } from "../utils/db-table.js";
import {
  CLIENT_PANEL_ORDER_METADATA,
  PUBLIC_LANDING_ORDER_METADATA,
  PUBLIC_SIM_AGENT_BUNDLE_METADATA,
  PUBLIC_SIM_CHECKOUT_METADATA,
  isWalletSmsCreditOrder,
  resolveWalletCreditSmsAmount,
} from "../utils/order-display.js";
import {
  encryptClaimTokenForMetadata,
  generateClaimToken,
  generatePublicCheckoutReference,
  hashClaimToken,
} from "../utils/claim-token.js";
import type { SimPlanDefinition } from "../utils/simPlans.js";
import type { AgentAddonId } from "../utils/agentAddons.js";
import { getAgentAddon } from "../utils/agentAddons.js";
import { createSimActivationRequest } from "./simActivationService.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { AppError } from "../utils/errors.js";

export async function getOrderById(id: string): Promise<SmsOrderRow | null> {
  const { data, error } = await getSupabase()
    .from("sms_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getOrderById");
  }

  return data as SmsOrderRow | null;
}

export async function getOrderByPublicCheckoutReference(
  reference: string,
): Promise<SmsOrderRow | null> {
  const ref = reference.trim();
  if (!ref) {
    return null;
  }

  const { data, error } = await getSupabase()
    .from("sms_orders")
    .select("*")
    .eq("public_checkout_reference", ref)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getOrderByPublicCheckoutReference");
  }

  return data as SmsOrderRow | null;
}

export async function getOrderByMercadoPagoPaymentId(
  paymentId: string,
): Promise<SmsOrderRow | null> {
  const id = paymentId.trim();
  if (!id) {
    return null;
  }

  const { data, error } = await getSupabase()
    .from("sms_orders")
    .select("*")
    .filter("metadata->>mercadopago_payment_id", "eq", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getOrderByMercadoPagoPaymentId");
  }

  return data as SmsOrderRow | null;
}

export async function getOrderForCompany(
  orderId: string,
  companyId: string,
): Promise<SmsOrderRow | null> {
  const order = await getOrderById(orderId);
  if (!order || order.company_id !== companyId) {
    return null;
  }
  return order;
}

export async function getOrderWithDetailsForCompany(
  orderId: string,
  companyId: string,
): Promise<SmsOrderWithDetails | null> {
  const order = await getOrderForCompany(orderId, companyId);
  if (!order) {
    return null;
  }

  let package_name: string | undefined;
  if (order.package_id) {
    const pkg = await getSmsPackageById(order.package_id);
    package_name = pkg?.name;
  }

  const { data: company } = await getSupabase()
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .maybeSingle();

  return {
    ...order,
    company_name: (company as { name?: string } | null)?.name,
    package_name,
  };
}

export async function listSmsOrdersByCompany(
  companyId: string,
  limit = 50,
): Promise<SmsOrderWithDetails[]> {
  const { data, error } = await getSupabase()
    .from("sms_orders")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listSmsOrdersByCompany");
  }

  const orders = (data ?? []) as SmsOrderRow[];
  if (orders.length === 0) {
    return [];
  }

  const packageIds = [
    ...new Set(orders.map((o) => o.package_id).filter(Boolean)),
  ] as string[];

  const { data: packages } =
    packageIds.length > 0
      ? await getSupabase()
          .from("sms_packages")
          .select("id, name")
          .in("id", packageIds)
      : { data: [] };

  const packageMap = new Map(
    ((packages ?? []) as { id: string; name: string }[]).map((p) => [
      p.id,
      p.name,
    ]),
  );

  const { data: company } = await getSupabase()
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .maybeSingle();

  const companyName = (company as { name?: string } | null)?.name;

  return orders.map((o) => ({
    ...o,
    company_name: companyName,
    package_name: o.package_id ? packageMap.get(o.package_id) : undefined,
  }));
}

export async function getOrderWithDetails(
  orderId: string,
): Promise<SmsOrderWithDetails | null> {
  const order = await getOrderById(orderId);
  if (!order) {
    return null;
  }

  let package_name: string | undefined;
  if (order.package_id) {
    const pkg = await getSmsPackageById(order.package_id);
    package_name = pkg?.name;
  }

  let company_name: string | undefined;
  if (order.company_id) {
    const { data: company } = await getSupabase()
      .from("companies")
      .select("id, name")
      .eq("id", order.company_id)
      .maybeSingle();
    company_name = (company as { name?: string } | null)?.name;
  }

  return {
    ...order,
    company_name,
    package_name,
  };
}

export async function listSmsOrders(limit = 100): Promise<SmsOrderWithDetails[]> {
  const { data, error } = await getSupabase()
    .from("sms_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listSmsOrders");
  }

  const orders = (data ?? []) as SmsOrderRow[];
  if (orders.length === 0) {
    return [];
  }

  const companyIds = [
    ...new Set(orders.map((o) => o.company_id).filter(Boolean)),
  ] as string[];
  const packageIds = [
    ...new Set(orders.map((o) => o.package_id).filter(Boolean)),
  ] as string[];

  const { data: companies } = await getSupabase()
    .from("companies")
    .select("id, name")
    .in("id", companyIds);

  const { data: packages } =
    packageIds.length > 0
      ? await getSupabase()
          .from("sms_packages")
          .select("id, name")
          .in("id", packageIds)
      : { data: [] };

  const companyMap = new Map(
    ((companies ?? []) as { id: string; name: string }[]).map((c) => [
      c.id,
      c.name,
    ]),
  );
  const packageMap = new Map(
    ((packages ?? []) as { id: string; name: string }[]).map((p) => [
      p.id,
      p.name,
    ]),
  );

  return orders.map((o) => ({
    ...o,
    company_name: o.company_id ? companyMap.get(o.company_id) : undefined,
    package_name: o.package_id ? packageMap.get(o.package_id) : undefined,
  }));
}

const CLAIM_TTL_DAYS = 14;

export async function createPublicLandingOrder(input: {
  packageId: string;
  checkoutEmail: string;
  payerEmail?: string;
}): Promise<{ order: SmsOrderRow; claimToken: string }> {
  const pkg = await getSmsPackageById(input.packageId);
  if (!pkg || !pkg.is_active) {
    throw new AppError("Bolsa SMS no encontrada o inactiva.", 404);
  }

  const checkoutEmail = input.checkoutEmail.trim().toLowerCase();
  const payerEmail = (input.payerEmail ?? checkoutEmail).trim().toLowerCase();
  if (!checkoutEmail.includes("@")) {
    throw new AppError("checkout_email inválido.", 400);
  }

  const claimToken = generateClaimToken();
  const claimExpires = new Date();
  claimExpires.setDate(claimExpires.getDate() + CLAIM_TTL_DAYS);
  const publicRef = generatePublicCheckoutReference();

  const { data, error } = await getSupabase()
    .from("sms_orders")
    .insert({
      company_id: null,
      package_id: pkg.id,
      sms_quantity: pkg.sms_quantity,
      amount: pkg.total_price,
      currency: pkg.currency,
      payment_provider: "mercadopago",
      payment_reference: publicRef,
      payment_status: "pending",
      credit_status: "pending_claim",
      claim_token_hash: hashClaimToken(claimToken),
      claim_status: "unclaimed",
      claim_expires_at: claimExpires.toISOString(),
      checkout_email: checkoutEmail,
      payer_email: payerEmail,
      public_checkout_reference: publicRef,
      metadata: {
        ...PUBLIC_LANDING_ORDER_METADATA,
        claim_token_enc: encryptClaimTokenForMetadata(claimToken),
      },
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "createPublicLandingOrder");
  }

  return { order: data as SmsOrderRow, claimToken };
}

export async function createPublicSimOrder(input: {
  plan: SimPlanDefinition;
  checkoutEmail: string;
  payerEmail?: string;
  payerName?: string;
  companyName?: string;
  phone?: string;
  taxId?: string;
  checkoutTotalAmount?: number;
  priceMetadata?: Record<string, unknown>;
}): Promise<{ order: SmsOrderRow; claimToken: string }> {
  const checkoutEmail = input.checkoutEmail.trim().toLowerCase();
  const payerEmail = (input.payerEmail ?? checkoutEmail).trim().toLowerCase();
  if (!checkoutEmail.includes("@")) {
    throw new AppError("checkout_email inválido.", 400);
  }

  const claimToken = generateClaimToken();
  const claimExpires = new Date();
  claimExpires.setDate(claimExpires.getDate() + CLAIM_TTL_DAYS);
  const publicRef = generatePublicCheckoutReference();

  const orderMetadata = {
    ...PUBLIC_SIM_CHECKOUT_METADATA,
    plan_id: input.plan.plan_id,
    plan_name: input.plan.name,
    included_sms_monthly: input.plan.sms_quantity,
    billing_period: input.plan.billing_period,
    activation_status: "pending_payment",
    payer_name: input.payerName?.trim() || null,
    company_name: input.companyName?.trim() || null,
    phone: input.phone?.trim() || null,
    tax_id: input.taxId?.trim() || null,
    claim_token_enc: encryptClaimTokenForMetadata(claimToken),
    ...(input.priceMetadata ?? {}),
  };

  const totalAmount = input.checkoutTotalAmount ?? input.plan.total_amount;

  const { data, error } = await getSupabase()
    .from("sms_orders")
    .insert({
      company_id: null,
      package_id: null,
      sms_quantity: input.plan.sms_quantity,
      amount: totalAmount,
      currency: input.plan.currency,
      payment_provider: "mercadopago",
      payment_reference: publicRef,
      payment_status: "pending",
      credit_status: "pending_claim",
      claim_token_hash: hashClaimToken(claimToken),
      claim_status: "unclaimed",
      claim_expires_at: claimExpires.toISOString(),
      checkout_email: checkoutEmail,
      payer_email: payerEmail,
      public_checkout_reference: publicRef,
      metadata: orderMetadata,
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "createPublicSimOrder");
  }

  const order = data as SmsOrderRow;

  await createSimActivationRequest({
    orderId: order.id,
    plan: input.plan,
    checkoutEmail,
    payerName: input.payerName,
    companyName: input.companyName,
    phone: input.phone,
    taxId: input.taxId,
    activationStatus: "pending_payment",
  });

  return { order, claimToken };
}

export async function createPublicSimAgentBundleOrder(input: {
  plan: SimPlanDefinition;
  agentAddonId: AgentAddonId;
  checkoutEmail: string;
  payerEmail?: string;
  payerName: string;
  companyName?: string;
  phone?: string;
  taxId?: string;
  useCase?: string;
  checkoutTotalAmount?: number;
  priceMetadata?: Record<string, unknown>;
}): Promise<{ order: SmsOrderRow; claimToken: string }> {
  const checkoutEmail = input.checkoutEmail.trim().toLowerCase();
  const payerEmail = (input.payerEmail ?? checkoutEmail).trim().toLowerCase();
  if (!checkoutEmail.includes("@")) {
    throw new AppError("checkout_email inválido.", 400);
  }

  const addon = input.agentAddonId === "none" ? null : getAgentAddon(input.agentAddonId);
  if (input.agentAddonId !== "none" && !addon) {
    throw new AppError("Plan agente no válido.", 400, "INVALID_AGENT_ADDON");
  }

  const totalAmount = input.checkoutTotalAmount ?? input.plan.total_amount;

  const claimToken = generateClaimToken();
  const claimExpires = new Date();
  claimExpires.setDate(claimExpires.getDate() + CLAIM_TTL_DAYS);
  const publicRef = generatePublicCheckoutReference();

  const orderMetadata = {
    ...PUBLIC_SIM_AGENT_BUNDLE_METADATA,
    sim_plan_id: input.plan.plan_id,
    sim_plan_name: input.plan.name,
    plan_id: input.plan.plan_id,
    plan_name: input.plan.name,
    included_sms_monthly: input.plan.sms_quantity,
    agent_addon_id: input.agentAddonId,
    agent_addon_name: addon?.name ?? null,
    billing_period: input.plan.billing_period,
    activation_status: "pending_payment",
    payer_name: input.payerName.trim(),
    company_name: input.companyName?.trim() || null,
    phone: input.phone?.trim() || null,
    tax_id: input.taxId?.trim() || null,
    use_case: input.useCase?.trim() || null,
    claim_token_enc: encryptClaimTokenForMetadata(claimToken),
    ...(input.priceMetadata ?? {}),
  };

  const { data, error } = await getSupabase()
    .from("sms_orders")
    .insert({
      company_id: null,
      package_id: null,
      sms_quantity: input.plan.sms_quantity,
      amount: totalAmount,
      currency: input.plan.currency,
      payment_provider: "mercadopago",
      payment_reference: publicRef,
      payment_status: "pending",
      credit_status: "pending_claim",
      claim_token_hash: hashClaimToken(claimToken),
      claim_status: "unclaimed",
      claim_expires_at: claimExpires.toISOString(),
      checkout_email: checkoutEmail,
      payer_email: payerEmail,
      public_checkout_reference: publicRef,
      metadata: orderMetadata,
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "createPublicSimAgentBundleOrder");
  }

  const order = data as SmsOrderRow;

  await createSimActivationRequest({
    orderId: order.id,
    plan: input.plan,
    checkoutEmail,
    payerName: input.payerName,
    companyName: input.companyName,
    phone: input.phone,
    taxId: input.taxId,
    useCase: input.useCase,
    activationStatus: "pending_payment",
  });

  return { order, claimToken };
}

export async function createOrder(input: {
  companyId: string;
  packageId: string;
  createdBy?: string | null;
  paymentProvider?: string;
  paymentReference?: string;
  checkoutEmail?: string | null;
  payerEmail?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<SmsOrderRow> {
  const pkg = await getSmsPackageById(input.packageId);
  if (!pkg || !pkg.is_active) {
    throw new AppError("Bolsa SMS no encontrada o inactiva.", 404);
  }

  const checkoutEmail = input.checkoutEmail?.trim().toLowerCase() || null;
  const payerEmail =
    input.payerEmail?.trim().toLowerCase() || checkoutEmail || null;

  const { data, error } = await getSupabase()
    .from("sms_orders")
    .insert({
      company_id: input.companyId,
      package_id: pkg.id,
      sms_quantity: pkg.sms_quantity,
      amount: pkg.total_price,
      currency: pkg.currency,
      payment_provider: input.paymentProvider ?? "manual",
      payment_reference: input.paymentReference ?? null,
      payment_status: "pending",
      credit_status: "pending",
      created_by: input.createdBy ?? null,
      checkout_email: checkoutEmail,
      payer_email: payerEmail,
      metadata: {
        ...CLIENT_PANEL_ORDER_METADATA,
        ...(input.metadata ?? {}),
        ...(checkoutEmail ? { buyer_email_source: "client_panel_checkout" } : {}),
      },
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "createOrder");
  }

  return data as SmsOrderRow;
}

export async function patchOrderFields(
  orderId: string,
  patch: {
    payment_reference?: string | null;
    payment_status?: SmsOrderRow["payment_status"];
    credit_status?: SmsOrderRow["credit_status"];
    credited_at?: string | null;
    company_id?: string | null;
    claim_status?: SmsOrderRow["claim_status"];
    claimed_at?: string | null;
    checkout_email?: string | null;
    payer_email?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<SmsOrderRow> {
  const current = await getOrderById(orderId);
  if (!current) {
    throw new AppError("Orden no encontrada.", 404);
  }

  const update: Record<string, unknown> = {};
  if (patch.payment_reference !== undefined) {
    update.payment_reference = patch.payment_reference;
  }
  if (patch.payment_status !== undefined) {
    update.payment_status = patch.payment_status;
  }
  if (patch.credit_status !== undefined) {
    update.credit_status = patch.credit_status;
  }
  if (patch.credited_at !== undefined) {
    update.credited_at = patch.credited_at;
  }
  if (patch.company_id !== undefined) {
    update.company_id = patch.company_id;
  }
  if (patch.claim_status !== undefined) {
    update.claim_status = patch.claim_status;
  }
  if (patch.claimed_at !== undefined) {
    update.claimed_at = patch.claimed_at;
  }
  if (patch.checkout_email !== undefined) {
    update.checkout_email = patch.checkout_email?.trim().toLowerCase() || null;
  }
  if (patch.payer_email !== undefined) {
    update.payer_email = patch.payer_email?.trim().toLowerCase() || null;
  }
  if (patch.metadata !== undefined) {
    update.metadata = {
      ...(current.metadata ?? {}),
      ...patch.metadata,
    };
  }

  const { data, error } = await getSupabase()
    .from("sms_orders")
    .update(update)
    .eq("id", orderId)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "patchOrderFields");
  }

  return data as SmsOrderRow;
}

/** Cancela orden con pago pendiente (superadmin). No toca wallet. */
export async function cancelPendingOrder(
  orderId: string,
  actorUserId?: string | null,
): Promise<SmsOrderRow> {
  const order = await getOrderById(orderId);
  if (!order) {
    throw new AppError("Orden no encontrada.", 404);
  }
  if (order.payment_status !== "pending") {
    throw new AppError(
      "Solo se pueden cancelar órdenes con pago pendiente.",
      400,
      "ORDER_NOT_PENDING",
    );
  }
  if (order.credit_status === "credited") {
    throw new AppError(
      "No se puede cancelar una orden ya acreditada.",
      400,
      "ORDER_ALREADY_CREDITED",
    );
  }

  const cancelledAt = new Date().toISOString();
  const updated = await patchOrderFields(orderId, {
    payment_status: "cancelled",
    metadata: {
      cancelled_by: "superadmin",
      cancelled_at: cancelledAt,
    },
  });

  await insertAuditLog({
    actorUserId,
    companyId: order.company_id,
    action: "order.cancel",
    entityType: "sms_order",
    entityId: orderId,
    metadata: { payment_status: "cancelled" },
  });

  return updated;
}

export async function markOrderPaid(
  orderId: string,
  actorUserId?: string | null,
): Promise<SmsOrderRow> {
  const order = await getOrderById(orderId);
  if (!order) {
    throw new AppError("Orden no encontrada.", 404);
  }

  if (order.payment_status === "paid") {
    return order;
  }

  const { data, error } = await getSupabase()
    .from("sms_orders")
    .update({ payment_status: "paid" })
    .eq("id", orderId)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "markOrderPaid");
  }

  await insertAuditLog({
    actorUserId,
    companyId: order.company_id,
    action: "order.confirm",
    entityType: "sms_order",
    entityId: orderId,
    metadata: { step: "mark_paid" },
  });

  return data as SmsOrderRow;
}

async function ensureDefaultRatePlanAfterCredit(
  order: SmsOrderRow,
  orderId: string,
  actorUserId?: string | null,
  source = "order_credit",
): Promise<void> {
  if (!order.company_id) {
    return;
  }
  try {
    const { ensureDefaultRetailRatePlanForCompany } = await import(
      "./defaultRetailRatePlanService.js"
    );
    await ensureDefaultRetailRatePlanForCompany(order.company_id, {
      orderId,
      actorUserId,
      source,
    });
  } catch (ratePlanErr) {
    console.error(
      "[order] default retail rate plan assignment failed",
      orderId,
      ratePlanErr,
    );
  }
}

export async function confirmOrderCredit(
  orderId: string,
  actorUserId?: string | null,
  options?: {
    allowManualWithoutPaid?: boolean;
    ratePlanSource?: string;
  },
): Promise<{
  order: SmsOrderRow;
  alreadyCredited: boolean;
}> {
  const ratePlanSource = options?.ratePlanSource ?? "order_credit";

  const order = await getOrderById(orderId);
  if (!order) {
    throw new AppError("Orden no encontrada.", 404);
  }

  if (order.credit_status === "credited") {
    await ensureDefaultRatePlanAfterCredit(
      order,
      orderId,
      actorUserId,
      ratePlanSource,
    );
    return { order, alreadyCredited: true };
  }

  if (!isWalletSmsCreditOrder(order)) {
    throw new AppError(
      "Esta orden no es una bolsa SMS; no acredita wallet.",
      400,
      "NON_WALLET_PRODUCT",
    );
  }

  if (!order.company_id) {
    throw new AppError(
      "La orden no tiene empresa asociada; no se puede acreditar saldo.",
      400,
      "ORDER_NO_COMPANY",
    );
  }

  if (
    order.payment_status !== "paid" &&
    !options?.allowManualWithoutPaid
  ) {
    throw new AppError(
      "La orden debe estar pagada antes de acreditar saldo.",
      400,
    );
  }

  const { data: existingTx } = await getSupabase()
    .from("wallet_transactions")
    .select("id")
    .eq("reference_type", "sms_order")
    .eq("reference_id", orderId)
    .maybeSingle();

  if (existingTx) {
    const { data: synced } = await getSupabase()
      .from("sms_orders")
      .update({
        credit_status: "credited",
        credited_at: order.credited_at ?? new Date().toISOString(),
      })
      .eq("id", orderId)
      .select("*")
      .single();
    const creditedOrder = (synced ?? order) as SmsOrderRow;
    await ensureDefaultRatePlanAfterCredit(
      creditedOrder,
      orderId,
      actorUserId,
      ratePlanSource,
    );
    return {
      order: creditedOrder,
      alreadyCredited: true,
    };
  }

  try {
    const smsAmount = resolveWalletCreditSmsAmount(order);
    if (smsAmount <= 0) {
      throw new AppError(
        "La orden no tiene cantidad SMS acreditable.",
        400,
        "ZERO_SMS_CREDIT",
      );
    }
    await applyPurchaseCredit({
      companyId: order.company_id,
      smsAmount,
      orderId: order.id,
      actorUserId,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const current = await getOrderById(orderId);
      if (current?.credit_status === "credited") {
        await ensureDefaultRatePlanAfterCredit(
          current,
          orderId,
          actorUserId,
          ratePlanSource,
        );
        return { order: current, alreadyCredited: true };
      }
      const { data: synced } = await getSupabase()
        .from("sms_orders")
        .update({
          credit_status: "credited",
          credited_at: current?.credited_at ?? new Date().toISOString(),
          payment_status:
            current?.payment_status === "pending"
              ? "paid"
              : current?.payment_status,
        })
        .eq("id", orderId)
        .select("*")
        .single();
      const creditedOrder = (synced ?? current ?? order) as SmsOrderRow;
      await ensureDefaultRatePlanAfterCredit(
        creditedOrder,
        orderId,
        actorUserId,
        ratePlanSource,
      );
      return {
        order: creditedOrder,
        alreadyCredited: true,
      };
    }
    throw error;
  }

  const { data, error } = await getSupabase()
    .from("sms_orders")
    .update({
      credit_status: "credited",
      credited_at: new Date().toISOString(),
      payment_status:
        order.payment_status === "pending" ? "paid" : order.payment_status,
    })
    .eq("id", orderId)
    .eq("credit_status", "pending")
    .select("*")
    .maybeSingle();

  if (error) {
    wrapSupabaseError(error, "confirmOrderCredit");
  }

  if (!data) {
    const current = await getOrderById(orderId);
    if (current?.credit_status === "credited") {
      return { order: current, alreadyCredited: true };
    }
    throw new AppError(
      "Saldo acreditado pero la orden no pudo sincronizarse; revisar manualmente.",
      409,
    );
  }

  await insertAuditLog({
    actorUserId,
    companyId: order.company_id,
    action: "order.confirm",
    entityType: "sms_order",
    entityId: orderId,
    metadata: { step: "credit", smsQuantity: order.sms_quantity },
  });

  const creditedOrder = data as SmsOrderRow;
  await ensureDefaultRatePlanAfterCredit(
    creditedOrder,
    orderId,
    actorUserId,
    ratePlanSource,
  );

  return { order: creditedOrder, alreadyCredited: false };
}
