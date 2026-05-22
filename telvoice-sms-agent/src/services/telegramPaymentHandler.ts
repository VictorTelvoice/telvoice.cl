import { isMercadoPagoConfigured } from "../config/env.js";
import { AppError, ValidationError } from "../utils/errors.js";
import type { AuthorizedTelegramClient } from "./telegramAuthorizationService.js";
import { resolveCheckoutForAuthorizedUser } from "./commercialCheckoutService.js";
import { quoteSmsQuantity } from "./commercialQuoteService.js";
import {
  getPendingCommercial,
} from "./telegram/pendingCommercial.js";
import {
  continueCommercialConversation,
  rememberQuoteSession,
} from "./telegramCommercialContext.js";
import { matchesPaymentRequest } from "./telegramPaymentUi.js";
import { normalizeIntentText } from "./telegramIntentService.js";
import { extractSmsQuantityFromText } from "./commercialQuoteService.js";
import { startLeadCapture } from "./telegramCommercialService.js";
import {
  deliverPaymentLinkToTelegramChat,
  deliverQuoteToTelegramChat,
  deliverSiteCheckoutHint,
  sendTelegramText,
  TELEGRAM_COMMERCIAL_REPLY_SENT,
} from "./telegramQuoteDelivery.js";
import {
  PAY_CALLBACK_LEAD,
  PAY_CALLBACK_MP,
  PAY_CALLBACK_WEB,
  parsePaymentCallbackData,
} from "./telegramPaymentUi.js";

function extractFirstHttpsUrl(text: string): string | null {
  const match = text.match(/https:\/\/[^\s]+/);
  return match ? match[0] : null;
}

export async function handleTelegramPaymentRequest(
  chatId: number,
  userId: number,
  text: string,
  auth: AuthorizedTelegramClient | null,
): Promise<boolean> {
  const normalized = normalizeIntentText(text);
  if (!matchesPaymentRequest(normalized)) {
    return false;
  }

  const thread = await continueCommercialConversation(
    userId,
    chatId,
    text,
    auth,
  );
  if (thread === TELEGRAM_COMMERCIAL_REPLY_SENT) {
    return true;
  }
  if (thread !== null) {
    await sendTelegramText(chatId, thread);
    return true;
  }

  const session = getPendingCommercial(userId);
  if (session?.quoted_quantity && session.chat_id === chatId) {
    const qty = session.quoted_quantity;
    if (auth) {
      try {
        const msg = await resolveCheckoutForAuthorizedUser(qty, auth);
        const url =
          extractFirstHttpsUrl(msg) ?? session.checkout_url ?? null;
        await deliverPaymentLinkToTelegramChat(chatId, msg, qty, url);
        return true;
      } catch (error) {
        const msg =
          error instanceof ValidationError || error instanceof AppError
            ? error.message
            : error instanceof Error
              ? error.message
              : "No se pudo generar el link de pago.";
        await sendTelegramText(chatId, msg);
        return true;
      }
    }
    if (session.checkout_url) {
      await deliverPaymentLinkToTelegramChat(
        chatId,
        `Pago MercadoPago — ${qty.toLocaleString("es-CL")} SMS`,
        qty,
        session.checkout_url,
      );
      return true;
    }
    await sendTelegramText(
      chatId,
      await startLeadCapture(userId, chatId, qty),
    );
    return true;
  }

  const qtyFromText = extractSmsQuantityFromText(text);
  if (qtyFromText !== null) {
    const quote = await quoteSmsQuantity(qtyFromText);
    await deliverQuoteToTelegramChat(chatId, userId, quote);
    return true;
  }

  await sendTelegramText(
    chatId,
    "Para pagar, primero cotiza tu bolsa.\n\nEjemplo: cotizar 30000 sms\n\nLuego usa el botón «Pagar ahora» o escribe: quiero pagar",
  );
  return true;
}

export async function handleTelegramPaymentCallback(
  chatId: number,
  userId: number,
  data: string,
  auth: AuthorizedTelegramClient | null,
): Promise<void> {
  const parsed = parsePaymentCallbackData(data);
  if (!parsed) {
    await sendTelegramText(chatId, "Acción no reconocida. Escribe cotizar 30000 sms.");
    return;
  }

  const { action, quantity } = parsed;
  rememberQuoteSession(userId, chatId, quantity, null);

  if (action === PAY_CALLBACK_WEB) {
    await deliverSiteCheckoutHint(chatId, quantity);
    return;
  }

  if (action === PAY_CALLBACK_LEAD) {
    await sendTelegramText(
      chatId,
      await startLeadCapture(userId, chatId, quantity),
    );
    return;
  }

  if (action === PAY_CALLBACK_MP) {
    const session = getPendingCommercial(userId);
    const cachedUrl =
      session?.checkout_url && session.quoted_quantity === quantity
        ? session.checkout_url
        : null;

    if (cachedUrl) {
      await deliverPaymentLinkToTelegramChat(
        chatId,
        `Pagar ${quantity.toLocaleString("es-CL")} SMS con MercadoPago:`,
        quantity,
        cachedUrl,
      );
      return;
    }

    if (auth) {
      try {
        const msg = await resolveCheckoutForAuthorizedUser(quantity, auth);
        const url = extractFirstHttpsUrl(msg);
        rememberQuoteSession(userId, chatId, quantity, url);
        await deliverPaymentLinkToTelegramChat(chatId, msg, quantity, url);
        return;
      } catch (error) {
        const msg =
          error instanceof ValidationError || error instanceof AppError
            ? error.message
            : error instanceof Error
              ? error.message
              : "No se pudo generar el link.";
        await sendTelegramText(
          chatId,
          `${msg}\n\nPrueba «Continuar en telvoice.cl» o «Dejar mis datos».`,
        );
        return;
      }
    }

    if (!isMercadoPagoConfigured()) {
      await sendTelegramText(
        chatId,
        "MercadoPago no está configurado en el servidor. Usa «Continuar en telvoice.cl» o «Dejar mis datos» para completar el pago.",
      );
      await deliverSiteCheckoutHint(chatId, quantity);
      return;
    }

    await sendTelegramText(
      chatId,
      "Para generar tu link de MercadoPago necesito tus datos.\n\n" +
        (await startLeadCapture(userId, chatId, quantity)),
    );
  }
}
