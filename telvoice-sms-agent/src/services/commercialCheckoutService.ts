import { isMercadoPagoConfigured } from "../config/env.js";
import type { AuthorizedTelegramClient } from "./telegramAuthorizationService.js";
import { quoteSmsQuantity } from "./commercialQuoteService.js";
import { createSmsCheckoutPreference } from "./mercadoPagoService.js";
import {
  createSmsProduct,
  findActiveSmsProductByQuantity,
  updateSmsProduct,
} from "./smsProductService.js";
import { AppError, ValidationError } from "../utils/errors.js";

export interface CheckoutPayerFromLead {
  name: string;
  email: string;
  phone: string;
  company?: string | null;
}

function buildPayerFromAuth(auth: AuthorizedTelegramClient): CheckoutPayerFromLead {
  const email = auth.client.email?.trim();
  if (!email) {
    throw new ValidationError(
      `Tu cuenta (${auth.client.company_name}) no tiene email registrado. Pide al administrador que lo configure en Telvoice para generar links de pago automáticos.`,
    );
  }

  const phone =
    auth.client.phone?.trim() ||
    auth.client.whatsapp_number?.trim() ||
    "56900000000";

  return {
    name: auth.client.company_name,
    email,
    phone,
    company: auth.client.company_name,
  };
}

function formatPaymentLinkMessage(
  quantity: number,
  checkoutUrl: string,
  totalWithIva: number,
): string {
  return (
    `Link de pago MercadoPago — ${quantity.toLocaleString("es-CL")} SMS\n` +
    `${checkoutUrl}\n\n` +
    `Total a pagar (IVA incl.): $${totalWithIva.toLocaleString("es-CL")} CLP\n\n` +
    `Tras el pago, Telvoice acreditará tu bolsa. Otra cantidad: cotizar 15000 sms`
  );
}

async function persistProductCheckout(
  quantity: number,
  quote: Awaited<ReturnType<typeof quoteSmsQuantity>>,
  checkoutUrl: string,
): Promise<void> {
  const existing = await findActiveSmsProductByQuantity(quantity);
  const productName = `Bolsa ${quantity.toLocaleString("es-CL")} SMS`;

  if (existing) {
    if (existing.checkout_url !== checkoutUrl) {
      await updateSmsProduct(existing.id, { checkout_url: checkoutUrl });
    }
    return;
  }

  try {
    await createSmsProduct({
      product_name: productName,
      description: `Bolsa SMS Chile generada desde Telegram (${quantity.toLocaleString("es-CL")} SMS).`,
      sms_quantity: quantity,
      price_amount: quote.total_with_iva,
      unit_price: quote.unit_price,
      checkout_url: checkoutUrl,
      is_featured: false,
      is_active: true,
      product_type: "sms_bundle",
    });
  } catch (error) {
    console.warn(
      "[commercialCheckoutService] No se pudo guardar producto en BD;",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Devuelve URL de checkout: producto existente, o crea preferencia MP y opcionalmente la bolsa en sms_products.
 */
export async function resolveCheckoutUrlForQuantity(
  quantity: number,
  payer:
    | { kind: "authorized"; auth: AuthorizedTelegramClient }
    | { kind: "lead"; data: CheckoutPayerFromLead },
): Promise<string> {
  const quote = await quoteSmsQuantity(quantity);

  const existing = await findActiveSmsProductByQuantity(quote.quoted_quantity);
  if (existing?.checkout_url) {
    return formatPaymentLinkMessage(
      quote.quoted_quantity,
      existing.checkout_url,
      quote.total_with_iva,
    );
  }

  if (!isMercadoPagoConfigured()) {
    throw new AppError(
      "MercadoPago no está configurado en el servidor del agente. Un ejecutivo te enviará el link manualmente.",
      503,
      "MP_NOT_CONFIGURED",
    );
  }

  const payerData =
    payer.kind === "authorized"
      ? buildPayerFromAuth(payer.auth)
      : payer.data;

  const { checkout_url } = await createSmsCheckoutPreference({
    smsQuantity: quote.quoted_quantity,
    itemTitle: `Bolsa ${quote.quoted_quantity.toLocaleString("es-CL")} SMS — Telvoice.cl`,
    itemDescription: `${quote.tier_label} · $${quote.unit_price} + IVA/SMS`,
    totalAmount: quote.total_with_iva,
    payer: {
      email: payerData.email,
      name: payerData.name,
      phone: payerData.phone,
    },
    externalReference: `tg-${payer.kind}-${quote.quoted_quantity}-${Date.now()}`,
  });

  await persistProductCheckout(quote.quoted_quantity, quote, checkout_url);

  return formatPaymentLinkMessage(
    quote.quoted_quantity,
    checkout_url,
    quote.total_with_iva,
  );
}

export async function resolveCheckoutForAuthorizedUser(
  quantity: number,
  auth: AuthorizedTelegramClient,
): Promise<string> {
  return resolveCheckoutUrlForQuantity(quantity, {
    kind: "authorized",
    auth,
  });
}
