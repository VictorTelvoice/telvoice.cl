import { isMercadoPagoConfigured } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import {
  createPublicLandingCheckoutPreference,
  createPublicSimCheckoutPreference,
} from "./mercadoPagoService.js";
import {
  createPublicLandingOrder,
  createPublicSimOrder,
  patchOrderFields,
} from "./smsOrderService.js";
import { getSmsPackageById } from "./smsPackageService.js";
import { getSimPlan, isSimPlanId, simCheckoutItemDescription, simCheckoutItemTitle } from "../utils/simPlans.js";

export type PublicCheckoutStartResult = {
  orderId: string;
  claimToken: string;
  checkoutUrl: string;
  publicCheckoutReference: string;
  preferenceId: string | null;
  productType: "sms_bundle" | "sim_subscription";
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
