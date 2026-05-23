import { env, isMercadoPagoConfigured } from "../config/env.js";
import { CLIENT_PANEL_ORDER_METADATA } from "../utils/order-display.js";
import { AppError } from "../utils/errors.js";
import { getSmsPackageById } from "./smsPackageService.js";
import {
  createOrder,
  getOrderForCompany,
  getOrderById,
  patchOrderFields,
} from "./smsOrderService.js";
import {
  createClientPanelCheckoutPreference,
  type MercadoPagoPayerInput,
} from "./mercadoPagoService.js";

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
  order: { metadata?: Record<string, unknown>; payment_provider?: string | null },
): boolean {
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
