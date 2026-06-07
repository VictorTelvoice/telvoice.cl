import { env, isMercadoPagoConfigured } from "../config/env.js";
import {
  CLIENT_PANEL_ORDER_METADATA,
  isPublicCheckoutOrder,
} from "../utils/order-display.js";
import { AppError } from "../utils/errors.js";
import { getSmsPackageById } from "./smsPackageService.js";
import {
  createOrder,
  getOrderForCompany,
  getOrderById,
  patchOrderFields,
} from "./smsOrderService.js";
import { saveCompanyPaymentCardPreferences } from "./companyPaymentCardService.js";
import {
  createClientPanelCheckoutPreference,
  createMercadoPagoPreapproval,
  type MercadoPagoPayerInput,
} from "./mercadoPagoService.js";
import {
  attachPreapprovalToSubscription,
  createPendingSmsMpSubscription,
} from "./smsMpSubscriptionService.js";

export type ClientPanelCheckoutResult = {
  orderId: string;
  checkoutUrl: string;
  preferenceId: string | null;
};

export async function startClientPanelMercadoPagoCheckout(input: {
  companyId: string;
  packageId: string;
  createdBy?: string | null;
  payer: MercadoPagoPayerInput;
}): Promise<ClientPanelCheckoutResult> {
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

  const order = await createOrder({
    companyId: input.companyId,
    packageId: input.packageId,
    createdBy: input.createdBy,
    paymentProvider: "mercadopago",
    paymentReference: `APP-MP-${Date.now()}`,
    metadata: {
      ...CLIENT_PANEL_ORDER_METADATA,
      checkout_mode: "mercadopago",
    },
  });

  const preference = await createClientPanelCheckoutPreference({
    orderId: order.id,
    companyId: input.companyId,
    packageId: pkg.id,
    smsQuantity: pkg.sms_quantity,
    totalAmount: Math.round(Number(pkg.total_price)),
    itemTitle: pkg.name,
    itemDescription: `${pkg.sms_quantity.toLocaleString("es-CL")} SMS — Telvoice`,
    payer: input.payer,
  });

  await patchOrderFields(order.id, {
    payment_reference: preference.preference_id ?? order.payment_reference,
    metadata: {
      ...(order.metadata ?? {}),
      ...CLIENT_PANEL_ORDER_METADATA,
      checkout_mode: "mercadopago",
      mercadopago_preference_id: preference.preference_id,
      mercadopago_init_point: preference.init_point,
      mercadopago_sandbox_init_point: preference.sandbox_init_point,
    },
  });

  return {
    orderId: order.id,
    checkoutUrl: preference.checkout_url,
    preferenceId: preference.preference_id,
  };
}

export function resolveMercadoPagoInitPoint(
  order: { metadata?: Record<string, unknown> },
): string | null {
  const meta = order.metadata ?? {};
  if (env.mercadopago.sandbox) {
    const sandbox = meta.mercadopago_sandbox_init_point;
    if (typeof sandbox === "string" && sandbox) {
      return sandbox;
    }
  }
  const prod = meta.mercadopago_init_point;
  if (typeof prod === "string" && prod) {
    return prod;
  }
  return null;
}

export async function assertOrderBelongsToCompany(
  orderId: string,
  companyId: string,
) {
  const order = await getOrderForCompany(orderId, companyId);
  if (!order) {
    throw new AppError("Orden no encontrada.", 404);
  }
  return order;
}

export function isClientPanelMercadoPagoOrder(
  order: {
    metadata?: Record<string, unknown>;
    payment_provider?: string | null;
    company_id?: string | null;
  },
): boolean {
  if (isPublicCheckoutOrder({
    metadata: order.metadata ?? {},
    company_id: order.company_id ?? null,
  })) {
    return false;
  }
  const meta = order.metadata ?? {};
  return (
    meta.source === "client_panel" ||
    meta.checkout_mode === "mercadopago" ||
    order.payment_provider === "mercadopago"
  );
}

export async function loadOrderForWebhook(orderId: string) {
  const order = await getOrderById(orderId);
  if (!order) {
    return null;
  }
  if (!isClientPanelMercadoPagoOrder(order)) {
    return null;
  }
  return order;
}

/** Checkout Mercado Pago para vincular tarjeta y acreditar bolsa (misma orden). */
export async function startPaymentCardSetupCheckout(input: {
  companyId: string;
  packageId: string;
  createdBy?: string | null;
  payer: MercadoPagoPayerInput;
  billingMode: "recurring" | "on_demand";
  autoRechargeEnabled: boolean;
}): Promise<ClientPanelCheckoutResult> {
  const result = await startClientPanelMercadoPagoCheckout({
    companyId: input.companyId,
    packageId: input.packageId,
    createdBy: input.createdBy,
    payer: input.payer,
  });

  const order = await getOrderById(result.orderId);
  if (order) {
    await patchOrderFields(order.id, {
      metadata: {
        ...(order.metadata ?? {}),
        ...CLIENT_PANEL_ORDER_METADATA,
        payment_card_setup: true,
        payment_card_billing_mode: input.billingMode,
        payment_card_auto_recharge: input.autoRechargeEnabled,
        payment_card_default_package_id: input.packageId,
      },
    });
    await saveCompanyPaymentCardPreferences(input.companyId, {
      billingMode: input.billingMode,
      autoRechargeEnabled: input.autoRechargeEnabled,
      defaultPackageId: input.packageId,
    });
  }

  return result;
}

/** Suscripción mensual Mercado Pago (Preapproval) para bolsa de la calculadora. */
export async function startClientPanelMercadoPagoSubscription(input: {
  companyId: string;
  packageId: string;
  smsQuantity: number;
  monthlyAmount: number;
  createdBy?: string | null;
  payer: MercadoPagoPayerInput;
}): Promise<ClientPanelCheckoutResult & { subscriptionId: string }> {
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

  const expected = Math.round(Number(pkg.total_price));
  if (Math.round(input.monthlyAmount) !== expected) {
    throw new AppError("El monto de la suscripción no coincide con la bolsa.", 400);
  }

  const subscription = await createPendingSmsMpSubscription({
    companyId: input.companyId,
    packageId: input.packageId,
    smsQuantity: input.smsQuantity,
    monthlyAmount: expected,
    currency: pkg.currency,
  });

  const preapproval = await createMercadoPagoPreapproval({
    externalReference: subscription.id,
    reason: `Suscripción mensual — ${pkg.name}`,
    monthlyAmount: expected,
    payerEmail: input.payer.email,
    backUrl: `${env.publicAppUrl}/app/payments/mercadopago/success?subscription=1`,
    metadata: {
      source: "client_panel",
      checkout_mode: "mercadopago_subscription",
      company_id: input.companyId,
      package_id: input.packageId,
      sms_quantity: String(input.smsQuantity),
      subscription_id: subscription.id,
    },
  });

  await attachPreapprovalToSubscription({
    companyId: input.companyId,
    subscriptionId: subscription.id,
    mpPreapprovalId: preapproval.preapproval_id ?? "",
    mpInitPoint: preapproval.checkout_url,
  });

  return {
    orderId: subscription.id,
    checkoutUrl: preapproval.checkout_url,
    preferenceId: preapproval.preapproval_id,
    subscriptionId: subscription.id,
  };
}
