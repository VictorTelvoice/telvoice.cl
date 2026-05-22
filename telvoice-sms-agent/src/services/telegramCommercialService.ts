import { createPublicLead } from "./publicLeadService.js";
import { quoteFromText, quoteSmsQuantity } from "./commercialQuoteService.js";
import { resolveCheckoutUrlForQuantity } from "./commercialCheckoutService.js";
import {
  buildCommercialTelegramReply,
  detectCommercialIntent,
} from "./telegramIntentService.js";
import type { AuthorizedTelegramClient } from "./telegramAuthorizationService.js";
import {
  rememberCommercialSession,
} from "./telegramCommercialContext.js";
import {
  deliverQuoteToTelegramChat,
  TELEGRAM_COMMERCIAL_REPLY_SENT,
} from "./telegramQuoteDelivery.js";
import {
  clearPendingLead,
  getPendingLead,
  setPendingLead,
} from "./telegram/pendingLeads.js";

export { detectCommercialIntent } from "./telegramIntentService.js";
export type { CommercialIntentDetail } from "./telegramIntentService.js";

function shouldAskQuantity(commercial: {
  hasQuantity: boolean;
  kind: string;
}): boolean {
  if (commercial.hasQuantity) {
    return false;
  }
  return (
    commercial.kind === "comprar" ||
    commercial.kind === "mas_sms" ||
    commercial.kind === "use_case_chile" ||
    commercial.kind === "cotizar" ||
    commercial.kind === "cuanto_cuesta"
  );
}

export async function handleCommercialText(
  text: string,
  auth: AuthorizedTelegramClient | null = null,
  options?: { userId?: number; chatId?: number },
): Promise<string | null | typeof TELEGRAM_COMMERCIAL_REPLY_SENT> {
  const commercial = detectCommercialIntent(text);
  if (!commercial) {
    return null;
  }

  if (
    options?.userId !== undefined &&
    options.chatId !== undefined &&
    commercial.hasQuantity &&
    commercial.quantity !== null
  ) {
    const quote =
      (await quoteFromText(text)) ??
      (await quoteSmsQuantity(commercial.quantity));
    return deliverQuoteToTelegramChat(
      options.chatId,
      options.userId,
      quote,
    );
  }

  const reply = await buildCommercialTelegramReply(text, commercial, auth);

  if (options?.userId !== undefined && options.chatId !== undefined) {
    if (shouldAskQuantity(commercial)) {
      rememberCommercialSession(options.userId, options.chatId, "awaiting_quantity");
    }
  }

  return reply;
}

export async function startLeadCapture(
  userId: number,
  chatId: number,
  initialQuantity?: number,
): Promise<string> {
  setPendingLead({
    telegram_user_id: userId,
    chat_id: chatId,
    step: "name",
    requested_quantity: initialQuantity,
    created_at: Date.now(),
  });

  return (
    "Para registrar tu solicitud comercial Telvoice.cl, necesito algunos datos.\n\n" +
    "1/4 — ¿Nombre o empresa?"
  );
}

export async function continueLeadCapture(
  userId: number,
  chatId: number,
  text: string,
): Promise<string | null> {
  const pending = getPendingLead(userId);
  if (!pending || pending.chat_id !== chatId) {
    return null;
  }

  const value = text.trim();
  if (!value) {
    return "Por favor envía una respuesta válida.";
  }

  if (value.toUpperCase() === "CANCELAR") {
    clearPendingLead(userId);
    return "Registro de solicitud cancelado.";
  }

  switch (pending.step) {
    case "name": {
      pending.name = value;
      pending.step = "contact";
      setPendingLead(pending);
      return "2/4 — ¿Email o WhatsApp de contacto?";
    }
    case "contact": {
      pending.contact = value;
      pending.step = "quantity";
      setPendingLead(pending);
      if (pending.requested_quantity) {
        pending.step = "use_case";
        setPendingLead(pending);
        return `3/4 — Cantidad registrada: ${pending.requested_quantity.toLocaleString("es-CL")} SMS.\n4/4 — ¿Uso principal? (campañas, OTP, ecommerce, etc.)`;
      }
      return "3/4 — ¿Cantidad aproximada de SMS? (solo número)";
    }
    case "quantity": {
      const qty = parseInt(value.replace(/\D/g, ""), 10);
      if (!Number.isFinite(qty) || qty < 1) {
        return "Indica un número válido de SMS, por ejemplo: 15000";
      }
      pending.requested_quantity = qty;
      pending.step = "use_case";
      setPendingLead(pending);
      return "4/4 — ¿Uso principal? (campañas, OTP, ecommerce, retail, etc.)";
    }
    case "use_case": {
      pending.use_case = value;
      clearPendingLead(userId);

      const contact = pending.contact ?? "";
      const isEmail = contact.includes("@");
      const email = isEmail ? contact.trim() : null;
      const phone = isEmail ? null : contact.trim();
      const qty = pending.requested_quantity ?? null;

      if (qty && email) {
        try {
          return await resolveCheckoutUrlForQuantity(qty, {
            kind: "lead",
            data: {
              name: pending.name ?? "Cliente Telvoice",
              email,
              phone: phone ?? "56900000000",
              company: pending.name ?? null,
            },
          });
        } catch (checkoutError) {
          console.error(
            "[telegram] Lead checkout:",
            checkoutError instanceof Error
              ? checkoutError.message
              : checkoutError,
          );
        }
      }

      try {
        await createPublicLead({
          name: pending.name ?? null,
          company: pending.company ?? null,
          email,
          phone,
          country: "CL",
          message: pending.use_case,
          requested_quantity: qty,
          source: "telegram_agent",
        });
      } catch (leadError) {
        console.error(
          "[telegram] createPublicLead:",
          leadError instanceof Error ? leadError.message : leadError,
        );
        return (
          "Registré tu interés, pero hubo un problema al guardar en el sistema.\n\n" +
          "Un ejecutivo Telvoice te contactará. También puedes escribir: cotizar 1000 sms"
        );
      }

      let quoteNote = "";
      if (qty) {
        try {
          const quote = await quoteSmsQuantity(qty);
          quoteNote = `\n\n${quote.commercial_message}`;
        } catch {
          /* ignore */
        }
      }

      return (
        "Solicitud registrada. Un ejecutivo Telvoice te contactará o te enviará el link de pago." +
        quoteNote
      );
    }
    default:
      clearPendingLead(userId);
      return null;
  }
}

export function isInLeadCapture(userId: number): boolean {
  return getPendingLead(userId) !== null;
}
