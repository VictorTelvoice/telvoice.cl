import { normalizeIntentText } from "../telegramIntentService.js";

export type SendSmsDraft = {
  phone: string | null;
  message: string | null;
};

const SEND_SMS_CORE_RE =
  /\b(envia|envía|enviar|mandar|manda)\b.*\b(sms|mensaje|mensajes)\b|\b(sms|mensaje)\b.*\b(envia|envía|enviar|mandar|manda)\b|\bquiero\s+enviar\b|\bnecesito\s+enviar\b|\bnecesito\s+mandar\b|\benvia\s+un\s+sms\b|\bmanda\s+(un\s+)?(sms|mensaje)\b|\benviar\s+mensaje\s+a\b|\benvia\s+sms\s+a\b|\benvía\s+sms\s+al\s+n[uú]mero\b|\bprobar\s+un\s+envio\b|\bprobar\s+un\s+envío\b|\bpuedo\s+enviar\s+un\s+sms\b|\benvia\s+un\s+sms\s+por\s+mi\b|\benvía\s+un\s+sms\s+por\s+mí\b|\bpuedes hacerlo por mi\b|\bpuedes hacerlo por mí\b/;

const SEND_SMS_MASS_RE =
  /\b(sms\s+masivo|envio\s+masivo|envío\s+masivo|varios\s+contactos|lista\s+de\s+contactos|planilla|csv)\b|\b(enviar|mandar).*(campana|campaña|masivo|promocion|promoción|varios)\b|\b(campana|campaña).*(enviar|mandar)\b/;

const CSV_CHOICE_RE =
  /\b(csv|planilla|adjuntar|subir\s+(?:una\s+)?(?:lista|planilla)|tengo\s+una\s+planilla|enviar\s+a\s+varios|varios\s+contactos|lista\s+de\s+numeros)\b/i;

const SINGLE_NUMBER_CHOICE_RE =
  /\b(un\s+numero|un\s+número|enviar\s+a\s+un\s+numero|numero\s+individual|solo\s+un\s+numero)\b/i;

export function matchesSendSmsFlowIntent(text: string): boolean {
  const n = normalizeIntentText(text);
  if (/\b(crear\s+borrador|borrador\s+de\s+campana)\b/.test(n)) {
    return false;
  }
  if (SEND_SMS_MASS_RE.test(n)) {
    return true;
  }
  if (SEND_SMS_CORE_RE.test(n)) {
    return true;
  }
  return (
    /\b(enviar|envia|envía|mandar|manda)\b/.test(n) &&
    /\b(sms|mensaje)\b/.test(n)
  );
}

/** @deprecated alias */
export function matchesSendSmsIntent(text: string): boolean {
  return matchesSendSmsFlowIntent(text);
}

export function matchesCsvDestChoice(text: string): boolean {
  return CSV_CHOICE_RE.test(text.trim());
}

export function matchesSingleDestChoice(text: string): boolean {
  return SINGLE_NUMBER_CHOICE_RE.test(text.trim());
}

export function extractPhoneFromText(text: string): string | null {
  const m = text.match(
    /(?:a\s+|al\s+(?:n[uú]mero\s+)?|destino[:\s]+|n[uú]mero[:\s]+)?(\+?56[\s-]?9[\d\s-]{8,}|\+?569[\d\s-]{7,}|(?<!\d)9[\d\s-]{8})(?!\d)/i,
  );
  const raw = m?.[1]?.replace(/[\s-]/g, "");
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
      /^(?:por\s+mi|por\s+mí|quiero|necesito|puedo|envia|envía|enviar|mandar|manda|claro|si|sí)\s+/gi,
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

  if (!message && !phone && matchesSendSmsFlowIntent(text)) {
    const stripped = stripCommandPrefix(text);
    if (
      stripped.length >= 2 &&
      !matchesSendSmsFlowIntent(stripped) &&
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

/** Cuerpo del SMS en turno de seguimiento del flujo guiado. */
export function parseFollowUpSmsBody(text: string): string | null {
  const t = text.trim();
  if (!t || matchesSendSmsFlowIntent(t)) {
    return null;
  }
  if (extractPhoneFromText(t)) {
    return null;
  }
  if (matchesCsvDestChoice(t) || matchesSingleDestChoice(t)) {
    return null;
  }
  if (/^(confirmo|cancelar|no|sí|si|detener|anular)\b/i.test(t)) {
    return null;
  }
  if (t.length < 4) {
    return null;
  }
  return t;
}

export function isOnlySendIntentStarter(text: string): boolean {
  const draft = parseSendSmsDraft(text);
  return matchesSendSmsFlowIntent(text) && !draft.phone && !draft.message;
}
