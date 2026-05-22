import {
  extractSmsQuantityFromText,
  quoteSmsQuantity,
} from "./commercialQuoteService.js";
import { resolveCheckoutForAuthorizedUser } from "./commercialCheckoutService.js";
import type { AuthorizedTelegramClient } from "./telegramAuthorizationService.js";
import { normalizeIntentText } from "./telegramIntentService.js";
import {
  clearPendingCommercial,
  getPendingCommercial,
  setPendingCommercial,
  type PendingCommercialSession,
} from "./telegram/pendingCommercial.js";
import { startLeadCapture } from "./telegramCommercialService.js";
import { AppError, ValidationError } from "../utils/errors.js";
import {
  deliverPaymentLinkToTelegramChat,
  deliverQuoteToTelegramChat,
  TELEGRAM_COMMERCIAL_REPLY_SENT,
} from "./telegramQuoteDelivery.js";
export function matchesCommercialFollowUp(normalized: string): boolean {
  if (!normalized) {
    return false;
  }

  if (
    /\b(link|enlace|url)\b/.test(normalized) &&
    /\b(pago|pagar|mercadopago|checkout)\b/.test(normalized)
  ) {
    return true;
  }

  if (
    /\bdame\b.*\b(link|enlace)\b/.test(normalized) ||
    /\b(link|enlace)\b/.test(normalized) ||
    /\benvia\b.*\b(link|enlace)\b/.test(normalized) ||
    /\bquiero pagar\b/.test(normalized) ||
    /\bpagar ahora\b/.test(normalized) ||
    /\bcomo pago\b/.test(normalized) ||
    /\bregistr(ar|o)\b.*\b(solicitud|pedido)\b/.test(normalized)
  ) {
    return true;
  }

  if (
    /^(si|sí|ok|dale|claro|perfecto|bueno|de acuerdo|listo)(\s|$)/.test(
      normalized,
    ) ||
    /\bconfirmo\b/.test(normalized)
  ) {
    return true;
  }

  return false;
}

export function extractQuantityOnlyReply(text: string): number | null {
  const normalized = normalizeIntentText(text);
  const digitsOnly = normalized.replace(/\s/g, "");
  if (!/^\d+$/.test(digitsOnly)) {
    return null;
  }
  const qty = parseInt(digitsOnly, 10);
  if (!Number.isFinite(qty) || qty < 1) {
    return null;
  }
  return qty;
}

export function rememberCommercialSession(
  userId: number,
  chatId: number,
  step: PendingCommercialSession["step"],
  options?: { quoted_quantity?: number; checkout_url?: string | null },
): void {
  setPendingCommercial({
    telegram_user_id: userId,
    chat_id: chatId,
    step,
    quoted_quantity: options?.quoted_quantity,
    checkout_url: options?.checkout_url ?? null,
    created_at: Date.now(),
  });
}

export function rememberQuoteSession(
  userId: number,
  chatId: number,
  quotedQuantity: number,
  checkoutUrl: string | null,
): void {
  rememberCommercialSession(userId, chatId, "quoted", {
    quoted_quantity: quotedQuantity,
    checkout_url: checkoutUrl,
  });
}

function extractFirstHttpsUrl(text: string): string | null {
  const match = text.match(/https:\/\/[^\s]+/);
  return match ? match[0] : null;
}

async function replyWithPaymentOrLead(
  userId: number,
  chatId: number,
  quantity: number,
  checkoutUrl: string | null,
  auth: AuthorizedTelegramClient | null,
): Promise<string | typeof TELEGRAM_COMMERCIAL_REPLY_SENT> {
  if (auth) {
    try {
      const msg = await resolveCheckoutForAuthorizedUser(quantity, auth);
      const url = extractFirstHttpsUrl(msg) ?? checkoutUrl;
      await deliverPaymentLinkToTelegramChat(chatId, msg, quantity, url);
      return TELEGRAM_COMMERCIAL_REPLY_SENT;
    } catch (error) {
      const msg =
        error instanceof ValidationError || error instanceof AppError
          ? error.message
          : error instanceof Error
            ? error.message
            : "No se pudo generar el link de pago.";
      console.error("[telegram] Checkout autorizado:", msg, error);
      return `${msg}\n\nSi persiste, contacta a soporte Telvoice o usa «Continuar en telvoice.cl» tras cotizar.`;
    }
  }

  if (checkoutUrl) {
    await deliverPaymentLinkToTelegramChat(
      chatId,
      `Listo — pago MercadoPago para ${quantity.toLocaleString("es-CL")} SMS según tu cotización.`,
      quantity,
      checkoutUrl,
    );
    return TELEGRAM_COMMERCIAL_REPLY_SENT;
  }

  return startLeadCapture(userId, chatId, quantity);
}

export async function continueCommercialConversation(
  userId: number,
  chatId: number,
  text: string,
  auth: AuthorizedTelegramClient | null = null,
): Promise<string | null | typeof TELEGRAM_COMMERCIAL_REPLY_SENT> {
  const session = getPendingCommercial(userId);
  if (!session || session.chat_id !== chatId) {
    return null;
  }

  const normalized = normalizeIntentText(text);

  if (normalized === "cancelar") {
    clearPendingCommercial(userId);
    return "Conversación comercial cancelada. Puedes escribir planes o cotizar 30000 sms cuando quieras.";
  }

  if (session.step === "awaiting_quantity") {
    const qtyFromText = extractQuantityOnlyReply(text);
    if (qtyFromText !== null) {
      const quote = await quoteSmsQuantity(qtyFromText);
      return deliverQuoteToTelegramChat(chatId, userId, quote);
    }

    const embedded = extractSmsQuantityFromText(text);
    if (embedded !== null) {
      const quote = await quoteSmsQuantity(embedded);
      return deliverQuoteToTelegramChat(chatId, userId, quote);
    }

    if (matchesCommercialFollowUp(normalized)) {
      return (
        "Para enviarte el link de pago o una cotización, primero indícame cuántos SMS lleva tu bolsa.\n\n" +
        "Ejemplo: 30000 o cotizar 30000 sms"
      );
    }

    return null;
  }

  if (session.step === "quoted" && session.quoted_quantity) {
    const qty = session.quoted_quantity;

    if (matchesCommercialFollowUp(normalized)) {
      return replyWithPaymentOrLead(
        userId,
        chatId,
        qty,
        session.checkout_url ?? null,
        auth,
      );
    }

    const qtyOnly = extractQuantityOnlyReply(text);
    if (qtyOnly !== null && qtyOnly !== qty) {
      const quote = await quoteSmsQuantity(qtyOnly);
      return deliverQuoteToTelegramChat(chatId, userId, quote);
    }
  }

  return null;
}

export function hasActiveCommercialSession(userId: number): boolean {
  return getPendingCommercial(userId) !== null;
}
