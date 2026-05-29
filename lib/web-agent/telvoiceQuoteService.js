import {
  IVA_RATE,
  normalizeSmsQuantity,
  getUnitPriceForQuantity,
  getPublicPricingTiers,
} from "../telvoice-pricing-tiers.js";

function parseQuantityDigits(raw) {
  if (!raw) {
    return null;
  }
  const qty = parseInt(String(raw).replace(/\s/g, "").replace(/\./g, ""), 10);
  return Number.isFinite(qty) && qty > 0 ? qty : null;
}

/** Solo número (ej. 20000 o 40.000) cuando el usuario responde a «¿cuántos SMS?». */
export function parseBareQuantity(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed || /[a-z]/i.test(trimmed.replace(/\d/g, ""))) {
    return null;
  }
  return parseQuantityDigits(trimmed);
}

import { normalizeCommercialText } from "./commercialText.js";

export function extractQuantityFromText(text) {
  const normalized = normalizeCommercialText(text);

  const patterns = [
    /cotizar\s+(\d[\d\s]*)(?:\s*sms)?/i,
    /comprar\s+(\d[\d\s]*)(?:\s*sms)?/i,
    /quiero\s+comprar\s+(\d[\d\s]*)(?:\s*sms)?/i,
    /quiero\s+(\d[\d\s]*)(?:\s*sms)?/i,
    /necesito\s+(\d[\d\s]*)(?:\s*sms)?/i,
    /cuanto\s+cuesta\s+(\d[\d\s]*)(?:\s*sms)?/i,
    /(\d[\d\s]*)\s*sms/i,
    /^(\d[\d\s]*)$/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (match?.[1]) {
      const qty = parseQuantityDigits(match[1]);
      if (qty) {
        return qty;
      }
    }
  }

  return parseBareQuantity(text);
}

export function calculateQuote(requestedQuantity) {
  const norm = normalizeSmsQuantity(requestedQuantity, { applyCalcMaxCap: false });
  const pricing = getUnitPriceForQuantity(norm.normalized_quantity);
  const subtotal = norm.normalized_quantity * pricing.unit_price;
  const iva = Math.round(subtotal * IVA_RATE);
  const total_with_iva = subtotal + iva;

  return {
    requested_quantity: norm.requested_quantity,
    quoted_quantity: norm.normalized_quantity,
    unit_price: pricing.unit_price,
    tier_label: pricing.tier_label,
    tier_applied: pricing.tier_applied,
    subtotal,
    iva,
    total_with_iva,
    currency: pricing.currency,
    was_rounded: norm.was_rounded,
    rounded_to_minimum: norm.rounded_to_minimum,
    rounded_up_to_step: norm.rounded_up_to_step,
  };
}

const fmt = (n) =>
  new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n);

export function formatQuoteForChat(quote) {
  const lines = ["Cotización Telvoice.cl para Chile:", ""];

  if (
    quote.rounded_up_to_step &&
    quote.requested_quantity !== quote.quoted_quantity
  ) {
    lines.push(
      "Las bolsas Telvoice.cl se venden en múltiplos de 1.000 SMS.",
      `Cantidad solicitada: ${fmt(quote.requested_quantity)} SMS`,
      `Te recomendamos una bolsa de ${fmt(quote.quoted_quantity)} SMS (múltiplo de 1.000 superior).`,
      "",
    );
  } else if (
    quote.was_rounded &&
    quote.rounded_to_minimum &&
    quote.requested_quantity !== quote.quoted_quantity
  ) {
    lines.push(
      "El mínimo de compra es 1.000 SMS.",
      `Cantidad solicitada: ${fmt(quote.requested_quantity)} SMS`,
      `Cotización ajustada a ${fmt(quote.quoted_quantity)} SMS.`,
      "",
    );
  } else if (
    quote.was_rounded &&
    quote.requested_quantity !== quote.quoted_quantity
  ) {
    lines.push(
      `Cantidad solicitada: ${fmt(quote.requested_quantity)} SMS`,
      `Cantidad cotizada: ${fmt(quote.quoted_quantity)} SMS`,
      "",
    );
  } else {
    lines.push(`Cantidad solicitada: ${fmt(quote.requested_quantity)} SMS`);
    if (quote.quoted_quantity !== quote.requested_quantity) {
      lines.push(`Cantidad cotizada: ${fmt(quote.quoted_quantity)} SMS`);
    }
    lines.push("");
  }

  lines.push(
    `Tramo aplicado: ${quote.tier_applied}`,
    `Precio unitario: $${quote.unit_price} + IVA por SMS`,
    `Subtotal: $${fmt(quote.subtotal)} + IVA`,
    `IVA 19%: $${fmt(quote.iva)}`,
    `Total IVA incluido: $${fmt(quote.total_with_iva)}`,
    "",
    "El pago se realiza online mediante MercadoPago en pesos chilenos.",
    "",
    "¿Quieres registrarte para comprar o dejar tus datos para que Telvoice te contacte?",
  );

  return lines.join("\n");
}

export function formatPricesCatalogMessage() {
  return (
    "Precios Telvoice.cl — bolsas SMS para Chile (múltiplos de 1.000 SMS, mínimo 1.000):\n\n" +
    "• 1.000 a 4.000 SMS → $10 + IVA por SMS\n" +
    "• 5.000 a 9.000 SMS → $9 + IVA por SMS\n" +
    "• 10.000 a 14.000 SMS → $8 + IVA por SMS\n" +
    "• 15.000 a 49.000 SMS → $7 + IVA por SMS\n" +
    "• 50.000 a 99.000 SMS → $6 + IVA por SMS\n" +
    "• 100.000 SMS o más → $5 + IVA por SMS\n\n" +
    "Puedes cotizar cualquier volumen en múltiplos de 1.000 SMS (si pides otro número, se redondea al múltiplo superior).\n\n" +
    "Ejemplos:\n" +
    "• 30.000 SMS → $7/SMS → $249.900 IVA incluido\n" +
    "• 500.000 SMS → $5/SMS → cotización con IVA incluido\n\n" +
    "Indica cuántos SMS necesitas y te preparo la cotización con botón Ir a pagar."
  );
}

export { normalizeSmsQuantity, getUnitPriceForQuantity, getPublicPricingTiers };

/** @deprecated alias */
export function buildWebAgentQuote(qty) {
  return calculateQuote(qty);
}

/** @deprecated alias */
export function formatQuoteMessage(quote) {
  return formatQuoteForChat(quote);
}
