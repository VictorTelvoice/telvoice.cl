import {
  isMercadoPagoConfigured,
  isSimAgentBundleCheckoutEmailAllowed,
} from "../config/env.js";
import { AppError } from "../utils/errors.js";
import {
  createPublicLandingCheckoutPreference,
  createPublicSimAgentBundlePreference,
  createPublicSimSubscriptionPreapproval,
} from "./mercadoPagoService.js";
import {
  createPublicLandingOrder,
  createPublicSimAgentBundleOrder,
  createPublicSimOrder,
  patchOrderFields,
} from "./smsOrderService.js";
import { resolveSimBundleCheckoutPricing } from "../utils/simTestPricing.js";
import { getSmsPackageById } from "./smsPackageService.js";
import {
  getSimPlan,
  getBundledAgentAddonForSimPlan,
  isSimPlanId,
} from "../utils/simPlans.js";
import { type AgentAddonId, getAgentAddon } from "../utils/agentAddons.js";
import { linkSimActivationInventory } from "./simActivationService.js";
import {
  getPublicAvailability,
  ensureSimInventoryHeldForPendingOrder,
  listPublicAvailableNumbers,
  maskE164ChileMobile,
  releaseReservationForOrder,
  reserveAvailableNumberForCheckout,
  resolvePublicInventoryId,
  inventoryPublicId,
} from "./realNumberInventoryService.js";
import { getSupabase } from "../database/supabaseClient.js";
import { isSimAgentBundleOrder, isSimSubscriptionOrder } from "../utils/order-display.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import type { SmsOrderRow } from "../types/wallet.js";

export type PublicCheckoutStartResult = {
  orderId: string;
  claimToken: string;
  checkoutUrl: string;
  publicCheckoutReference: string;
  preferenceId: string | null;
  productType: "sms_bundle" | "sim_subscription" | "sim_agent_bundle";
};

export type PublicPendingSimCheckoutResult = {
  has_pending_order: boolean;
  public_reference?: string;
  amount?: number;
  payment_url?: string;
  selected_number?: string;
  expires_at?: string;
  reservation_expired?: boolean;
  plan_id?: string;
};

function normalizeCheckoutEmail(email: string): string {
  return email.trim().toLowerCase();
}

function orderPaymentUrl(order: SmsOrderRow): string | null {
  const meta = order.metadata ?? {};
  const url =
    typeof meta.mercadopago_init_point === "string"
      ? meta.mercadopago_init_point.trim()
      : "";
  return url || null;
}

export async function getPublicPendingSimCheckoutForEmail(
  email: string,
): Promise<PublicPendingSimCheckoutResult> {
  const normalized = normalizeCheckoutEmail(email);
  if (!normalized.includes("@")) {
    return { has_pending_order: false };
  }

  const sb = getSupabase();
  const { data, error } = await sb
    .from("sms_orders")
    .select("*")
    .eq("payment_status", "pending")
    .ilike("checkout_email", normalized)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw wrapSupabaseError(error, "getPublicPendingSimCheckoutForEmail");
  }

  const order = (data ?? [])
    .map((row) => row as SmsOrderRow)
    .find((row) => isSimSubscriptionOrder(row) || isSimAgentBundleOrder(row));

  if (!order) {
    return { has_pending_order: false };
  }

  const meta = order.metadata ?? {};
  const inventoryId =
    typeof meta.inventory_number_id === "string"
      ? meta.inventory_number_id
      : null;

  let selectedNumber =
    typeof meta.selected_number_masked === "string"
      ? meta.selected_number_masked
      : undefined;
  let expiresAt: string | undefined;
  let reservationExpired = false;

  if (inventoryId) {
    const hold = await ensureSimInventoryHeldForPendingOrder({
      orderId: order.id,
      inventoryId,
    });

    const { data: invRow } = await sb
      .from("real_number_inventory")
      .select("e164_number, reserved_until, sales_status, current_order_id")
      .eq("id", inventoryId)
      .maybeSingle();

    if (invRow) {
      if (!selectedNumber && invRow.e164_number) {
        selectedNumber = maskE164ChileMobile(String(invRow.e164_number));
      }
      if (invRow.reserved_until) {
        expiresAt = String(invRow.reserved_until);
      } else if (hold.expiresAt) {
        expiresAt = hold.expiresAt;
      }
      reservationExpired =
        !hold.held ||
        invRow.current_order_id !== order.id ||
        invRow.sales_status !== "reserved_pending_payment" ||
        (expiresAt != null && new Date(expiresAt).getTime() <= Date.now());
    } else {
      reservationExpired = true;
    }
  }

  const paymentUrl = orderPaymentUrl(order);

  return {
    has_pending_order: true,
    public_reference: order.public_checkout_reference ?? order.id,
    amount: Math.round(Number(order.amount)),
    payment_url: paymentUrl ?? undefined,
    selected_number: selectedNumber,
    expires_at: expiresAt,
    reservation_expired: reservationExpired,
    plan_id:
      typeof meta.plan_id === "string" ? meta.plan_id : undefined,
  };
}

export async function listPublicSimAvailableNumbers(limit = 10) {
  const numbers = await listPublicAvailableNumbers(limit);
  return {
    available: numbers.length,
    numbers,
  };
}

export async function startPublicLandingCheckout(input: {
  packageId: string;
  checkoutEmail: string;
  payerEmail?: string;
  payerName?: string;
}): Promise<PublicCheckoutStartResult> {
  if (!isMercadoPagoConfigured()) {
    throw new AppError(
      "MercadoPago no está configurado en este servidor.",
      503,
      "MP_NOT_CONFIGURED",
    );
  }

  const pkg = await getSmsPackageById(input.packageId);
  if (!pkg || !pkg.is_active) {
    throw new AppError("Bolsa SMS no encontrada o inactiva.", 404);
  }

  const { order, claimToken } = await createPublicLandingOrder({
    packageId: input.packageId,
    checkoutEmail: input.checkoutEmail,
    payerEmail: input.payerEmail,
  });

  const preference = await createPublicLandingCheckoutPreference({
    orderId: order.id,
    packageId: pkg.id,
    smsQuantity: pkg.sms_quantity,
    totalAmount: Math.round(Number(pkg.total_price)),
    itemTitle: pkg.name,
    itemDescription: `${pkg.sms_quantity.toLocaleString("es-CL")} SMS — Telvoice`,
    payer: {
      email: input.checkoutEmail,
      name: input.payerName?.trim() || "Cliente Telvoice",
    },
    publicCheckoutReference: order.public_checkout_reference ?? order.id,
  });

  await patchOrderFields(order.id, {
    payment_reference: preference.preference_id ?? order.payment_reference,
    metadata: {
      ...(order.metadata ?? {}),
      mercadopago_preference_id: preference.preference_id,
      mercadopago_init_point: preference.checkout_url,
    },
  });

  return {
    orderId: order.id,
    claimToken,
    checkoutUrl: preference.checkout_url,
    publicCheckoutReference: order.public_checkout_reference ?? order.id,
    preferenceId: preference.preference_id,
    productType: "sms_bundle",
  };
}

export async function startPublicSimCheckout(input: {
  planId: string;
  checkoutEmail: string;
  payerEmail?: string;
  payerName: string;
  companyName?: string;
  phone?: string;
  taxId?: string;
  inventoryPublicId: string;
}): Promise<PublicCheckoutStartResult> {
  if (!isMercadoPagoConfigured()) {
    throw new AppError(
      "La suscripción mensual está en preparación. Contáctanos para activar tu numeración.",
      503,
      "SUBSCRIPTION_NOT_READY",
    );
  }

  if (!input.payerName || input.payerName.trim().length < 2) {
    throw new AppError("payer_name es obligatorio.", 400, "VALIDATION_ERROR");
  }

  if (!input.inventoryPublicId?.trim()) {
    throw new AppError(
      "Elige una numeración disponible para continuar.",
      400,
      "VALIDATION_ERROR",
    );
  }

  const pending = await getPublicPendingSimCheckoutForEmail(input.checkoutEmail);
  if (pending.has_pending_order && !pending.reservation_expired && pending.payment_url) {
    throw new AppError(
      "Ya existe una orden pendiente para este correo.",
      409,
      "PENDING_ORDER_EXISTS",
    );
  }

  if (!isSimPlanId(input.planId)) {
    throw new AppError("plan_id SIM no válido.", 400, "INVALID_SIM_PLAN");
  }

  const plan = getSimPlan(input.planId);
  if (!plan) {
    throw new AppError("Plan SIM no encontrado.", 404);
  }

  const availability = await getPublicAvailability();
  if (!availability.in_stock) {
    throw new AppError(
      "No hay números reales disponibles en este momento.",
      409,
      "NO_STOCK",
    );
  }

  const pricing = resolveSimBundleCheckoutPricing(plan, input.checkoutEmail);
  const bundledAgentId = getBundledAgentAddonForSimPlan(plan.plan_id);

  const { order, claimToken } = await createPublicSimOrder({
    plan,
    checkoutEmail: input.checkoutEmail,
    payerEmail: input.payerEmail,
    payerName: input.payerName,
    companyName: input.companyName,
    phone: input.phone,
    taxId: input.taxId,
    checkoutTotalAmount: pricing.totalAmount,
    priceMetadata: {
      ...pricing.priceMetadata,
      billing_mode: "subscription",
      recurring: true,
      checkout_mode: "mercadopago_subscription",
      subscription_status: "pending",
      agent_addon_id: bundledAgentId,
      account_creation_mode: "post_payment_auto",
    },
  });

  let inventoryNumberId: string;
  try {
    const resolvedInventoryId =
      (await resolvePublicInventoryId(input.inventoryPublicId.trim())) ?? undefined;
    if (!resolvedInventoryId) {
      throw new AppError(
        "Esta numeración ya no está disponible. Elige otra numeración.",
        409,
        "NUMBER_UNAVAILABLE",
      );
    }

    const reserved = await reserveAvailableNumberForCheckout({
      orderId: order.id,
      inventoryId: resolvedInventoryId,
    });
    inventoryNumberId = reserved.id;
    await linkSimActivationInventory(order.id, inventoryNumberId);

    const digits = reserved.e164_number.replace(/\D/g, "");
    await patchOrderFields(order.id, {
      metadata: {
        ...(order.metadata ?? {}),
        inventory_number_id: inventoryNumberId,
        inventory_public_id: inventoryPublicId(inventoryNumberId),
        selected_number_masked: maskE164ChileMobile(reserved.e164_number),
        number_suffix: digits.slice(-3),
        selected_by_customer: true,
      },
    });
  } catch (err) {
    await patchOrderFields(order.id, {
      payment_status: "cancelled",
      metadata: {
        ...(order.metadata ?? {}),
        checkout_cancel_reason: "inventory_unavailable",
      },
    });
    throw err;
  }

  let preapproval;
  try {
    preapproval = await createPublicSimSubscriptionPreapproval({
      orderId: order.id,
      plan,
      monthlyAmount: pricing.totalAmount,
      payer: {
        email: input.checkoutEmail,
        name: input.payerName.trim() || "Cliente Telvoice",
      },
      publicCheckoutReference: order.public_checkout_reference ?? order.id,
    });
  } catch (err) {
    await releaseReservationForOrder(order.id);
    if (err instanceof AppError && err.code === "MP_PREAPPROVAL_FAILED") {
      throw new AppError(
        "No pudimos iniciar la suscripción en MercadoPago. Intenta nuevamente.",
        502,
        "MP_PREAPPROVAL_FAILED",
      );
    }
    throw err;
  }

  await patchOrderFields(order.id, {
    payment_reference: preapproval.preapproval_id ?? order.payment_reference,
    metadata: {
      ...(order.metadata ?? {}),
      inventory_number_id: inventoryNumberId,
      inventory_public_id: inventoryPublicId(inventoryNumberId),
      mercadopago_preapproval_id: preapproval.preapproval_id,
      mercadopago_init_point: preapproval.checkout_url,
      subscription_status: "pending",
    },
  });

  return {
    orderId: order.id,
    claimToken,
    checkoutUrl: preapproval.checkout_url,
    publicCheckoutReference: order.public_checkout_reference ?? order.id,
    preferenceId: preapproval.preapproval_id,
    productType: "sim_subscription",
  };
}

export async function startPublicSimAgentBundleCheckout(input: {
  simPlanId: string;
  agentAddonId?: AgentAddonId;
  checkoutEmail: string;
  payerEmail?: string;
  payerName: string;
  companyName?: string;
  phone?: string;
  taxId?: string;
  useCase?: string;
  inventoryPublicId?: string;
}): Promise<PublicCheckoutStartResult> {
  if (!isSimAgentBundleCheckoutEmailAllowed(input.checkoutEmail)) {
    throw new AppError(
      "El checkout de numeración + agente no está habilitado para este correo.",
      403,
      "not_enabled",
    );
  }

  const pending = await getPublicPendingSimCheckoutForEmail(input.checkoutEmail);
  if (pending.has_pending_order && !pending.reservation_expired && pending.payment_url) {
    throw new AppError(
      "Ya existe una orden pendiente para este correo.",
      409,
      "PENDING_ORDER_EXISTS",
    );
  }

  if (!isSimPlanId(input.simPlanId)) {
    throw new AppError("Plan SIM no válido.", 400, "INVALID_SIM_PLAN");
  }

  const plan = getSimPlan(input.simPlanId);
  if (!plan) {
    throw new AppError("Plan SIM no encontrado.", 404);
  }

  const pricing = resolveSimBundleCheckoutPricing(plan, input.checkoutEmail);

  const availability = await getPublicAvailability();
  if (!availability.in_stock) {
    throw new AppError(
      "No hay números reales disponibles en este momento.",
      409,
      "NO_STOCK",
    );
  }

  if (!isMercadoPagoConfigured()) {
    throw new AppError(
      "MercadoPago no está configurado en este servidor.",
      503,
      "MP_NOT_CONFIGURED",
    );
  }

  const bundledAgentId = getBundledAgentAddonForSimPlan(plan.plan_id);
  const agentAddonId = input.agentAddonId ?? bundledAgentId;
  if (agentAddonId !== bundledAgentId && input.agentAddonId) {
    throw new AppError(
      "El plan de agente no coincide con el plan de numeración seleccionado.",
      400,
      "INVALID_AGENT_BUNDLE",
    );
  }

  const addon = getAgentAddon(bundledAgentId);
  if (!addon) {
    throw new AppError("Plan agente no válido.", 400, "INVALID_AGENT_ADDON");
  }

  const { order, claimToken } = await createPublicSimAgentBundleOrder({
    plan,
    agentAddonId: bundledAgentId,
    checkoutEmail: input.checkoutEmail,
    payerEmail: input.payerEmail,
    payerName: input.payerName,
    companyName: input.companyName,
    phone: input.phone,
    taxId: input.taxId,
    useCase: input.useCase,
    checkoutTotalAmount: pricing.totalAmount,
    priceMetadata: pricing.priceMetadata,
  });

  let inventoryNumberId: string;
  let selectedByCustomer = false;
  try {
    let resolvedInventoryId: string | undefined;
    if (input.inventoryPublicId?.trim()) {
      resolvedInventoryId =
        (await resolvePublicInventoryId(input.inventoryPublicId.trim())) ??
        undefined;
      if (!resolvedInventoryId) {
        throw new AppError(
          "Este número acaba de ser reservado. Elige otra numeración disponible.",
          409,
          "NUMBER_UNAVAILABLE",
        );
      }
      selectedByCustomer = true;
    }

    const reserved = await reserveAvailableNumberForCheckout({
      orderId: order.id,
      inventoryId: resolvedInventoryId,
    });
    inventoryNumberId = reserved.id;
    await linkSimActivationInventory(order.id, inventoryNumberId);

    const digits = reserved.e164_number.replace(/\D/g, "");
    await patchOrderFields(order.id, {
      metadata: {
        ...(order.metadata ?? {}),
        inventory_number_id: inventoryNumberId,
        inventory_public_id: inventoryPublicId(inventoryNumberId),
        selected_number_masked: maskE164ChileMobile(reserved.e164_number),
        number_suffix: digits.slice(-3),
        selected_by_customer: selectedByCustomer,
        agent_addon_id: bundledAgentId,
      },
    });
  } catch (err) {
    await patchOrderFields(order.id, {
      payment_status: "cancelled",
      metadata: {
        ...(order.metadata ?? {}),
        checkout_cancel_reason: "no_stock",
      },
    });
    throw err;
  }

  let preference;
  try {
    preference = await createPublicSimAgentBundlePreference({
      orderId: order.id,
      plan,
      agentAddonId: bundledAgentId,
      agentAddon: addon,
      totalAmount: Math.round(Number(order.amount)),
      payer: {
        email: input.checkoutEmail,
        name: input.payerName.trim() || "Cliente Telvoice",
      },
      publicCheckoutReference: order.public_checkout_reference ?? order.id,
    });
  } catch (err) {
    await releaseReservationForOrder(order.id);
    throw err;
  }

  await patchOrderFields(order.id, {
    payment_reference: preference.preference_id ?? order.payment_reference,
    metadata: {
      ...(order.metadata ?? {}),
      inventory_number_id: inventoryNumberId,
      inventory_public_id: inventoryPublicId(inventoryNumberId),
      agent_addon_id: bundledAgentId,
      mercadopago_preference_id: preference.preference_id,
      mercadopago_init_point: preference.checkout_url,
    },
  });

  return {
    orderId: order.id,
    claimToken,
    checkoutUrl: preference.checkout_url,
    publicCheckoutReference: order.public_checkout_reference ?? order.id,
    preferenceId: preference.preference_id,
    productType: "sim_agent_bundle",
  };
}
