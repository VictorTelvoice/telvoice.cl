import { isMercadoPagoConfigured } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import {
  createPublicLandingCheckoutPreference,
  createPublicSimAgentBundlePreference,
  createPublicSimCheckoutPreference,
} from "./mercadoPagoService.js";
import {
  createPublicLandingOrder,
  createPublicSimAgentBundleOrder,
  createPublicSimOrder,
  patchOrderFields,
} from "./smsOrderService.js";
import { getSmsPackageById } from "./smsPackageService.js";
import {
  getSimPlan,
  getBundledAgentAddonForSimPlan,
  isSimPlanId,
  simCheckoutItemDescription,
  simCheckoutItemTitle,
} from "../utils/simPlans.js";
import { type AgentAddonId, getAgentAddon } from "../utils/agentAddons.js";
import { linkSimActivationInventory } from "./simActivationService.js";
import {
  getPublicAvailability,
  releaseReservationForOrder,
  reserveAvailableNumberForCheckout,
} from "./realNumberInventoryService.js";

export type PublicCheckoutStartResult = {
  orderId: string;
  claimToken: string;
  checkoutUrl: string;
  publicCheckoutReference: string;
  preferenceId: string | null;
  productType: "sms_bundle" | "sim_subscription" | "sim_agent_bundle";
};

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
  payerName?: string;
  companyName?: string;
  phone?: string;
  taxId?: string;
}): Promise<PublicCheckoutStartResult> {
  if (!isMercadoPagoConfigured()) {
    throw new AppError(
      "MercadoPago no está configurado en este servidor.",
      503,
      "MP_NOT_CONFIGURED",
    );
  }

  if (!isSimPlanId(input.planId)) {
    throw new AppError("Plan SIM no válido.", 400, "INVALID_SIM_PLAN");
  }

  const plan = getSimPlan(input.planId);
  if (!plan) {
    throw new AppError("Plan SIM no encontrado.", 404);
  }

  const { order, claimToken } = await createPublicSimOrder({
    plan,
    checkoutEmail: input.checkoutEmail,
    payerEmail: input.payerEmail,
    payerName: input.payerName,
    companyName: input.companyName,
    phone: input.phone,
    taxId: input.taxId,
  });

  const preference = await createPublicSimCheckoutPreference({
    orderId: order.id,
    planId: plan.plan_id,
    smsQuantity: plan.sms_quantity,
    totalAmount: plan.total_amount,
    itemTitle: simCheckoutItemTitle(plan),
    itemDescription: simCheckoutItemDescription(plan),
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
}): Promise<PublicCheckoutStartResult> {
  if (!isSimPlanId(input.simPlanId)) {
    throw new AppError("Plan SIM no válido.", 400, "INVALID_SIM_PLAN");
  }

  const plan = getSimPlan(input.simPlanId);
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
  });

  let inventoryNumberId: string;
  try {
    const reserved = await reserveAvailableNumberForCheckout({
      orderId: order.id,
    });
    inventoryNumberId = reserved.id;
    await linkSimActivationInventory(order.id, inventoryNumberId);
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

  await patchOrderFields(order.id, {
    metadata: {
      ...(order.metadata ?? {}),
      inventory_number_id: inventoryNumberId,
      agent_addon_id: bundledAgentId,
    },
  });

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
