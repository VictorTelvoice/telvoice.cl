import { normalizeIntentText } from "../telegramIntentService.js";

export type SendSmsDraft = {
  phone: string | null;
  message: string | null;
};

const SEND_SMS_INTENT_RE =
  /\b(envia|envía|enviar|mandar|manda)\b.*\b(sms|mensaje|mensajes)\b|\b(sms|mensaje)\b.*\b(envia|envía|enviar|mandar|manda)\b|\bquiero\s+enviar\b.*\b(sms|mensaje)\b|\bnecesito\s+enviar\b.*\b(sms|mensaje|mensajes)\b|\benvia\s+un\s+sms\b|\bmanda\s+(un\s+)?(sms|mensaje)\b|\benviar\s+mensaje\s+a\b|\benvia\s+sms\s+a\b|\benvía\s+sms\s+al\s+n[uú]mero\b|\bprobar\s+un\s+envio\b|\bprobar\s+un\s+envío\b|\bpuedo\s+enviar\s+un\s+sms\b|\benvia\s+un\s+sms\s+por\s+mi\b|\benvía\s+un\s+sms\s+por\s+mí\b/;

export function matchesSendSmsIntent(text: string): boolean {
  const n = normalizeIntentText(text);
  if (/\b(campana|campaña|campanas|campañas)\b/.test(n)) {
    return false;
  }
  if (SEND_SMS_INTENT_RE.test(n)) {
    return true;
  }
  return (
    /\b(enviar|envia|envía|mandar|manda)\b/.test(n) &&
    /\b(sms|mensaje)\b/.test(n)
  );
}

export function extractPhoneFromText(text: string): string | null {
  const m = text.match(
    /(?:a\s+|al\s+(?:n[uú]mero\s+)?|destino[:\s]+|n[uú]mero[:\s]+)(\+?56\s?9[\d\s]{8,}|\+?569[\d\s]{7,}|9\d{8})|(\+?56\s?9[\d\s]{8,}|\+?569[\d\s]{7,})/i,
  );
  const raw = (m?.[1] ?? m?.[2] ?? m?.[3])?.replace(/\s/g, "");
  if (!raw) {
    return null;
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("569") && digits.length >= 11) {
    return digits.slice(0, 11);
  }
  if (digits.startsWith("56") && digits.length >= 11) {
    return digits.slice(0, 11);
  }
  if (digits.startsWith("9") && digits.length >= 9) {
    return `56${digits.slice(0, 9)}`;
  }
  return null;
}

function stripCommandPrefix(text: string): string {
  return text
    .replace(
      /^(?:por\s+mi|por\s+mí|quiero|necesito|puedo|envia|envía|enviar|mandar|manda)\s+/gi,
      "",
    )
    .replace(/^(?:un\s+)?(?:sms|mensaje)\s+/gi, "")
    .replace(/^(?:a\s+|al\s+(?:n[uú]mero\s+)?)\S+\s*/i, "")
    .trim();
}

export function parseSendSmsDraft(text: string): SendSmsDraft {
  const phone = extractPhoneFromText(text);
  let message: string | null = null;

  const conTexto = text.match(/\bcon\s+el\s+texto\s+(.+)/i);
  if (conTexto?.[1]) {
    message = conTexto[1].trim();
  }

  const queDiga = text.match(/\bque\s+diga\s+(.+)/i);
  if (queDiga?.[1]) {
    message = queDiga[1].trim();
  }

  const mensajeLabel = text.match(/\bmensaje[:\s]+(.+)/i);
  if (mensajeLabel?.[1] && !phone) {
    message = mensajeLabel[1].trim();
  }

  if (!message && /\b(sms|mensaje)\s+que\s+diga\b/i.test(text)) {
    const m = text.match(/\b(?:sms|mensaje)\s+que\s+diga\s+(.+)/i);
    if (m?.[1]) {
      message = m[1].trim();
    }
  }

  if (!message && !phone && matchesSendSmsIntent(text)) {
    const stripped = stripCommandPrefix(text);
    if (
      stripped.length >= 2 &&
      !matchesSendSmsIntent(stripped) &&
      !extractPhoneFromText(stripped)
    ) {
      message = stripped;
    }
  }

  if (message && phone) {
    const phoneDigits = phone.replace(/\D/g, "");
    message = message
      .replace(new RegExp(phone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "")
      .replace(new RegExp(phoneDigits, "g"), "")
      .replace(/\bcon\s+el\s+texto\b/gi, "")
      .replace(/\bque\s+diga\b/gi, "")
      .trim();
    if (message.length < 2) {
      message = null;
    }
  }

  return { phone, message };
}

/** Mensaje en turno de seguimiento cuando ya se pidió el cuerpo del SMS. */
export function parseFollowUpSmsBody(text: string): string | null {
  const t = text.trim();
  if (!t || matchesSendSmsIntent(t) || extractPhoneFromText(t)) {
    return null;
  }
  if (/^(confirmo|cancelar|no|sí|si)\b/i.test(t)) {
    return null;
  }
  return t;
}
