import type { SendMessageOptions } from "../providers/telegram/telegramClient.js";
import { telegramClient } from "../providers/telegram/index.js";
import type { CommercialQuoteResult } from "../types/commercial.js";
import type { AuthorizedTelegramClient } from "./telegramAuthorizationService.js";
import { rememberQuoteSession } from "./telegramCommercialContext.js";
import {
  buildPaymentLinkKeyboard,
  buildQuoteInlineKeyboard,
  buildSiteCheckoutUrl,
  quoteMessageForTelegram,
  TELEGRAM_COMMERCIAL_REPLY_SENT,
} from "./telegramPaymentUi.js";

export { TELEGRAM_COMMERCIAL_REPLY_SENT };

function requireClient() {
  if (!telegramClient) {
    throw new Error("TELEGRAM_BOT_TOKEN no configurado.");
  }
  return telegramClient;
}

export async function sendTelegramText(
  chatId: number,
  text: string,
  options?: SendMessageOptions,
): Promise<void> {
  await requireClient().sendMessage(chatId, text, options);
}

export async function deliverQuoteToTelegramChat(
  chatId: number,
  userId: number,
  quote: CommercialQuoteResult,
): Promise<typeof TELEGRAM_COMMERCIAL_REPLY_SENT> {
  rememberQuoteSession(
    userId,
    chatId,
    quote.quoted_quantity,
    quote.checkout_url,
  );

  const text = quote.commercial_message || quoteMessageForTelegram(quote);
  await sendTelegramText(chatId, text, {
    reply_markup: buildQuoteInlineKeyboard(quote),
    disable_web_page_preview: true,
  });

  return TELEGRAM_COMMERCIAL_REPLY_SENT;
}

export async function deliverPaymentLinkToTelegramChat(
  chatId: number,
  message: string,
  quantity: number,
  checkoutUrl: string | null,
): Promise<void> {
  await sendTelegramText(chatId, message, {
    reply_markup: buildPaymentLinkKeyboard(checkoutUrl, quantity),
    disable_web_page_preview: true,
  });
}

export async function deliverSiteCheckoutHint(
  chatId: number,
  quantity: number,
): Promise<void> {
  await sendTelegramText(
    chatId,
    `Continúa el pago en Telvoice.cl (${quantity.toLocaleString("es-CL")} SMS). Completa tus datos y paga con MercadoPago en la web.`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Abrir telvoice.cl",
              url: buildSiteCheckoutUrl(quantity),
            },
          ],
        ],
      },
    },
  );
}

export type PaymentDeliveryContext = {
  chatId: number;
  userId: number;
  auth: AuthorizedTelegramClient | null;
};
