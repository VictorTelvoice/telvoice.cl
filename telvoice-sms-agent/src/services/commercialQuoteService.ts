import type { CommercialQuoteResult, SmsProductRow } from "../types/commercial.js";
import {
  calcIvaFromSubtotal,
  formatClp,
  HIGH_VOLUME_SMS_THRESHOLD,
} from "../utils/clp-format.js";
import { ValidationError } from "../utils/errors.js";
import {
  getUnitPriceForQuantity,
  getPricingTiersForQuote,
  SMS_MIN_QUANTITY,
  SMS_QUANTITY_STEP,
} from "./smsPricingTierService.js";
import { listActiveSmsProducts } from "./smsProductService.js";

const BUNDLE_INCLUDES = [
  "Plataforma web para gestión de envíos",
  "Reportería de campañas",
  "Acceso API sujeto a solicitud",
];

export { getUnitPriceForQuantity, normalizeQuoteQuantity } from "./smsPricingTierService.js";

export function extractSmsQuantityFromText(text: string): number | null {
  const normalized = text.toLowerCase().replace(/\./g, "");

  const patterns = [
    /cotizar\s+(\d[\d\s]*)\s*sms?/i,
    /cotiza\s+(\d[\d\s]*)\s*sms?/i,
    /quiero\s+comprar\s+(\d[\d\s]*)\s*sms?/i,
    /comprar\s+(\d[\d\s]*)\s*sms?/i,
    /quiero\s+(\d[\d\s]*)\s*sms?/i,
    /necesito\s+(\d[\d\s]*)\s*sms?/i,
    /cu[aá]nto\s+cuesta\s+(\d[\d\s]*)\s*sms?/i,
    /(\d[\d\s]*)\s*sms?\s+en\s+chile/i,
    /(\d[\d\s]*)\s*sms?/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (match?.[1]) {
      const qty = parseInt(match[1].replace(/\s/g, ""), 10);
      if (Number.isFinite(qty) && qty > 0) {
        return qty;
      }
    }
  }

  return null;
}

function findCheckoutUrlForQuantity(
  products: SmsProductRow[],
  quotedQuantity: number,
): string | null {
  const exact = products.find(
    (p) =>
      p.product_type === "sms_bundle" &&
      p.sms_quantity === quotedQuantity &&
      p.checkout_url,
  );
  return exact?.checkout_url ?? null;
}

function findFeaturedProduct(
  products: SmsProductRow[],
  quotedQuantity: number,
): SmsProductRow | null {
  return (
    products.find(
      (p) => p.product_type === "sms_bundle" && p.sms_quantity === quotedQuantity,
    ) ?? null
  );
}

export function buildQuoteCommercialMessage(
  quote: Omit<CommercialQuoteResult, "commercial_message" | "includes">,
): string {
  const lines: string[] = ["Cotización Telvoice.cl para Chile", ""];

  if (quote.was_rounded && quote.requested_quantity !== quote.quoted_quantity) {
    lines.push(
      `Las bolsas Telvoice.cl se calculan en múltiplos de ${SMS_QUANTITY_STEP.toLocaleString("es-CL")} SMS.`,
      `Cantidad solicitada: ${quote.requested_quantity.toLocaleString("es-CL")} SMS`,
      `Cantidad cotizada: ${quote.quoted_quantity.toLocaleString("es-CL")} SMS`,
      "",
    );
  } else {
    lines.push(
      `Cantidad solicitada: ${quote.requested_quantity.toLocaleString("es-CL")} SMS`,
    );
    if (quote.requested_quantity !== quote.quoted_quantity) {
      lines.push(
        `Cantidad cotizada: ${quote.quoted_quantity.toLocaleString("es-CL")} SMS`,
      );
    }
    lines.push("");
  }

  if (quote.quote_type === "high_volume") {
    lines.push(
      "Cotización alto volumen Telvoice.cl",
      `Para volúmenes superiores a ${HIGH_VOLUME_SMS_THRESHOLD.toLocaleString("es-CL")} SMS se aplica $5 + IVA por SMS.`,
      "",
    );
  }

  lines.push(
    `Tramo aplicado: ${quote.tier_label}`,
    `Precio unitario: $${quote.unit_price} + IVA por SMS`,
    "",
    `Subtotal: ${formatClp(quote.subtotal)} + IVA`,
    `IVA 19%: ${formatClp(quote.iva)}`,
    `Total IVA incluido: ${formatClp(quote.total_with_iva)}`,
    "",
    "Incluye:",
    ...BUNDLE_INCLUDES.map((i) => `• ${i}`),
    "",
    "Cobertura Chile: Entel, Movistar, Claro y WOM.",
  );

  lines.push(
    "",
    "Usa el botón «Pagar ahora» para MercadoPago, «Continuar en telvoice.cl» para el checkout web, o «Dejar mis datos» para completar el pago en este chat.",
  );

  return lines.join("\n");
}

/** Cotización según calculadora oficial Telvoice.cl (tramos + múltiplos de 1.000). */
export async function createQuickQuote(
  requestedQuantity: number,
  countryCode = "CL",
): Promise<CommercialQuoteResult> {
  if (!Number.isFinite(requestedQuantity) || requestedQuantity < 1) {
    throw new ValidationError("quantity debe ser un entero positivo.");
  }

  const pricing = await getUnitPriceForQuantity(requestedQuantity, countryCode);
  const quoted_quantity = pricing.normalized_quantity;
  const subtotal = quoted_quantity * pricing.unit_price;
  const { iva, total_with_iva } = calcIvaFromSubtotal(subtotal);

  let products: SmsProductRow[] = [];
  try {
    products = await listActiveSmsProducts(countryCode);
  } catch (error) {
    console.warn(
      "[commercialQuoteService] No se pudieron cargar productos SMS; cotización sin checkout_url.",
      error,
    );
  }
  const product = findFeaturedProduct(products, quoted_quantity);
  const checkout_url = findCheckoutUrlForQuantity(products, quoted_quantity);

  const quote_type: CommercialQuoteResult["quote_type"] =
    quoted_quantity > HIGH_VOLUME_SMS_THRESHOLD ? "high_volume" : "calculator";

  const base: Omit<CommercialQuoteResult, "commercial_message" | "includes"> = {
    country_code: countryCode,
    requested_quantity: pricing.requested_quantity,
    quoted_quantity,
    quantity: quoted_quantity,
    quote_type,
    product,
    unit_price: pricing.unit_price,
    tier_label: pricing.tier_label,
    was_rounded: pricing.was_rounded,
    subtotal,
    iva,
    total_with_iva,
    currency: pricing.currency,
    checkout_url,
  };

  return {
    ...base,
    commercial_message: buildQuoteCommercialMessage(base),
    includes: BUNDLE_INCLUDES,
  };
}

/** Alias usado por API y Telegram. */
export async function quoteSmsQuantity(
  quantity: number,
  countryCode = "CL",
): Promise<CommercialQuoteResult> {
  return createQuickQuote(quantity, countryCode);
}

export async function formatPlansCatalogMessage(
  countryCode = "CL",
): Promise<string> {
  const tiers = await getPricingTiersForQuote(countryCode);
  const tierLines = tiers
    .map((t) => `• ${t.label}: $${t.unit_price} + IVA por SMS`)
    .join("\n");

  return (
    `Planes Telvoice.cl (Chile)\n\n` +
    `Calculadora — tramos por volumen (múltiplos de ${SMS_QUANTITY_STEP.toLocaleString("es-CL")} SMS, mínimo ${SMS_MIN_QUANTITY.toLocaleString("es-CL")}):\n` +
    `${tierLines}\n\n` +
    `Bolsas destacadas en el landing:\n` +
    `• Starter: 1.000 SMS\n` +
    `• Business: 15.000 SMS (más popular)\n` +
    `• Corporativo: 100.000 SMS\n\n` +
    `Cobertura: Entel, Movistar, Claro y WOM.\n` +
    `Pago online con MercadoPago.\n\n` +
    `Ejemplos:\n` +
    `• cotizar 30000 sms\n` +
    `• cotizar 12500 sms\n` +
    `• cuánto cuesta 70000 sms`
  );
}

export async function quoteFromText(
  text: string,
  countryCode = "CL",
): Promise<CommercialQuoteResult | null> {
  const quantity = extractSmsQuantityFromText(text);
  if (quantity === null) {
    return null;
  }
  return createQuickQuote(quantity, countryCode);
}
