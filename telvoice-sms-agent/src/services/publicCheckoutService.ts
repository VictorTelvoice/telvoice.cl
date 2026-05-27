import { isMercadoPagoConfigured } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { createPublicLandingCheckoutPreference } from "./mercadoPagoService.js";
import { createPublicLandingOrder, patchOrderFields } from "./smsOrderService.js";
import { getSmsPackageById } from "./smsPackageService.js";

export type PublicCheckoutStartResult = {
  orderId: string;
  claimToken: string;
  checkoutUrl: string;
  publicCheckoutReference: string;
  preferenceId: string | null;
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
  };
}
