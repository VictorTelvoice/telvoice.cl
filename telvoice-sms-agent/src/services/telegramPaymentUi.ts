import { env } from "../config/env.js";
import type { CommercialQuoteResult } from "../types/commercial.js";
import type { InlineKeyboardMarkup } from "../providers/telegram/telegramClient.js";
import { buildQuoteCommercialMessage } from "./commercialQuoteService.js";

export const TELEGRAM_COMMERCIAL_REPLY_SENT = "__TELEGRAM_COMMERCIAL_QUOTE_SENT__";

export const PAY_CALLBACK_MP = "tva_pay_mp";
export const PAY_CALLBACK_WEB = "tva_pay_web";
export const PAY_CALLBACK_LEAD = "tva_pay_lead";

export function buildSiteCheckoutUrl(quotedQuantity: number): string {
  const base = env.publicSiteUrl.replace(/\/$/, "");
  const url = new URL(`${base}/`);
  url.searchParams.set("agent_calc", String(quotedQuantity));
  url.hash = "precios";
  return url.toString();
}

export function buildQuoteInlineKeyboard(
  quote: Pick<CommercialQuoteResult, "quoted_quantity" | "checkout_url">,
): InlineKeyboardMarkup {
  const qty = quote.quoted_quantity;
  const rows: InlineKeyboardMarkup["inline_keyboard"] = [];

  if (quote.checkout_url) {
    rows.push([
      {
        text: "Pagar ahora (MercadoPago)",
        url: quote.checkout_url,
      },
    ]);
  } else {
    rows.push([
      {
        text: "Pagar ahora",
        callback_data: `${PAY_CALLBACK_MP}:${qty}`,
      },
    ]);
  }

  rows.push([
    {
      text: "Continuar en telvoice.cl",
      url: buildSiteCheckoutUrl(qty),
    },
  ]);

  rows.push([
    {
      text: "Dejar mis datos en el chat",
      callback_data: `${PAY_CALLBACK_LEAD}:${qty}`,
    },
  ]);

  return { inline_keyboard: rows };
}

export function buildPaymentLinkKeyboard(
  checkoutUrl: string | null,
  quantity: number,
): InlineKeyboardMarkup {
  const rows: InlineKeyboardMarkup["inline_keyboard"] = [];
  if (checkoutUrl) {
    rows.push([{ text: "Abrir MercadoPago", url: checkoutUrl }]);
  }
  rows.push([
    { text: "Continuar en telvoice.cl", url: buildSiteCheckoutUrl(quantity) },
  ]);
  return { inline_keyboard: rows };
}

export function quoteMessageForTelegram(
  quote: Omit<CommercialQuoteResult, "commercial_message" | "includes">,
): string {
  return buildQuoteCommercialMessage(quote);
}

export function parsePaymentCallbackData(
  data: string,
): { action: string; quantity: number } | null {
  const parts = data.split(":");
  if (parts.length !== 2) {
    return null;
  }
  const [action, qtyRaw] = parts;
  const quantity = parseInt(qtyRaw ?? "", 10);
  if (!Number.isFinite(quantity) || quantity < 1) {
    return null;
  }
  if (
    action !== PAY_CALLBACK_MP &&
    action !== PAY_CALLBACK_WEB &&
    action !== PAY_CALLBACK_LEAD
  ) {
    return null;
  }
  return { action, quantity };
}

export function matchesPaymentRequest(normalized: string): boolean {
  if (!normalized) {
    return false;
  }
  if (
    /\b(link|enlace|url)\b/.test(normalized) &&
    /\b(pago|pagar|mercadopago|checkout)\b/.test(normalized)
  ) {
    return true;
  }
  return (
    /\bdame\b.*\b(link|enlace)\b/.test(normalized) ||
    /\b(link|enlace)\b.*\bpago\b/.test(normalized) ||
    /\benvia\b.*\b(link|enlace)\b/.test(normalized) ||
    /\bquiero pagar\b/.test(normalized) ||
    /\bpagar ahora\b/.test(normalized) ||
    /\bcomo pago\b/.test(normalized) ||
    /\bpago\b.*\b(online|mercadopago|ahora)\b/.test(normalized)
  );
}
