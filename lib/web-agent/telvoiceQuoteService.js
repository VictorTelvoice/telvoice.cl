import {
  IVA_RATE,
  normalizeSmsQuantity,
  getUnitPriceForQuantity,
  getPublicPricingTiers,
  fetchMinQuantityTiers,
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

export async function ensurePricingTiersLoaded() {
  return fetchMinQuantityTiers();
}

export function calculateQuote(requestedQuantity, tiers) {
  const norm = normalizeSmsQuantity(requestedQuantity, { applyCalcMaxCap: false });
  const pricing = getUnitPriceForQuantity(norm.normalized_quantity, tiers);
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

export async function calculateQuoteAsync(requestedQuantity) {
  const tiers = await fetchMinQuantityTiers();
  return calculateQuote(requestedQuantity, tiers);
}

const fmt = (n) =>
  new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n);

export function formatQuoteForChat(quote) {
  const lines = [];
  const displayQty = quote.quoted_quantity;

  if (quote.was_rounded && quote.requested_quantity !== quote.quoted_quantity) {
    lines.push(`Te cotizo ${fmt(displayQty)} SMS para Chile.`, "");
  }

  lines.push(
    `Cantidad solicitada: ${fmt(displayQty)} SMS`,
    `Precio unitario: $${quote.unit_price} + IVA por SMS`,
    `Subtotal: $${fmt(quote.subtotal)}`,
    `IVA 19%: $${fmt(quote.iva)}`,
    `Total IVA incluido: $${fmt(quote.total_with_iva)}`,
    "",
    "El pago se realiza online mediante MercadoPago en pesos chilenos.",
  );

  return lines.join("\n");
}

export function formatPricesCatalogMessage(tiers) {
  const list = getPublicPricingTiers(tiers);
  const lines = list.map(
    (t) => `• ${t.label}: $${t.unit_price} + IVA por SMS`,
  );
  return (
    lines.join("\n") +
    "\n\nIndica cuántos SMS necesitas y te preparo la cotización con botón Ir a pagar."
  );
}

export async function formatPricesCatalogMessageAsync() {
  const tiers = await fetchMinQuantityTiers();
  return formatPricesCatalogMessage(tiers);
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
