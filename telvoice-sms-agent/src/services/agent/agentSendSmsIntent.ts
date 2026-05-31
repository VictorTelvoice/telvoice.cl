import { normalizeIntentText } from "../telegramIntentService.js";

export type SendSmsDraft = {
  phone: string | null;
  message: string | null;
};

const SEND_SMS_CORE_RE =
  /\b(envia|envía|enviar|mandar|manda)\b.*\b(sms|mensaje|mensajes)\b|\b(sms|mensaje)\b.*\b(envia|envía|enviar|mandar|manda)\b|\bquiero\s+enviar\b|\bnecesito\s+enviar\b|\bnecesito\s+mandar\b|\benvia\s+un\s+sms\b|\bmanda\s+(un\s+)?(sms|mensaje)\b|\benviar\s+mensaje\s+a\b|\benvia\s+sms\s+a\b|\benvía\s+sms\s+al\s+n[uú]mero\b|\bprobar\s+un\s+envio\b|\bprobar\s+un\s+envío\b|\bpuedo\s+enviar\s+un\s+sms\b|\benvia\s+un\s+sms\s+por\s+mi\b|\benvía\s+un\s+sms\s+por\s+mí\b|\bpuedes hacerlo por mi\b|\bpuedes hacerlo por mí\b|\bayudame\s+a\s+(enviar|mandar)\b|\bayúdame\s+a\s+(enviar|mandar)\b|\bpuedes\s+(enviar|mandar)\b|\bhacer\s+el\s+envio\b|\bhacer\s+el\s+envío\b/;

const SEND_SMS_MASS_RE =
  /\b(sms\s+masivo|envio\s+masivo|envío\s+masivo|varios\s+contactos|lista\s+de\s+contactos|planilla|csv)\b|\b(enviar|mandar).*(campana|campaña|masivo|promocion|promoción|varios)\b|\b(campana|campaña).*(enviar|mandar)\b/;

const CAMPAIGN_GUIDED_RE =
  /\b(ayudame a crear|ayúdame a crear|armar\s+(?:una\s+)?campana|armar\s+(?:una\s+)?campaña|nueva campaña|nueva campana|quiero\s+(?:una\s+)?campana|quiero\s+(?:una\s+)?campaña|crear\s+(?:una\s+)?campana|crear\s+(?:una\s+)?campaña)\b/;

/** Flujo guiado de campaña (mensaje → destinos → confirmación), sin borrador automático. */
export function matchesCampaignGuidedIntent(text: string): boolean {
  const n = normalizeIntentText(text);
  if (/\b(borrador|solo\s+borrador)\b/.test(n)) {
    return false;
  }
  return CAMPAIGN_GUIDED_RE.test(n);
}

const CSV_CHOICE_RE =
  /\b(csv|planilla|adjuntar|subir\s+(?:una\s+)?(?:lista|planilla)|tengo\s+una\s+planilla|enviar\s+a\s+varios|varios\s+contactos|lista\s+de\s+numeros)\b/i;

const SINGLE_NUMBER_CHOICE_RE =
  /\b(un\s+numero|un\s+número|enviar\s+a\s+un\s+numero|numero\s+individual|solo\s+un\s+numero)\b/i;

const INTENT_FRAGMENT_RE =
  /^(?:puedes\s+hacerlo|hacerlo|por\s+m[ií]|ayuda(?:me)?|por\s+favor)\s*(?:por\s+m[ií])?\.?$/i;

const INTENT_KEYWORD_RE =
  /\b(enviar|envia|envía|mandar|manda|sms|mensaje|campaña|campana|promocion|promoción|quiero|necesito|puedes|puedo|ayuda|ayúdame|ayudame|por\s*m[ií]|hacerlo|clientes|planilla|csv|varios|contactos|envío|envio)\b/gi;

export function matchesSendSmsFlowIntent(text: string): boolean {
  const n = normalizeIntentText(text);
  if (/\b(crear\s+borrador|borrador\s+de\s+campana)\b/.test(n)) {
    return false;
  }
  if (matchesCampaignGuidedIntent(text)) {
    return true;
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

/** Mensaje explícito en la misma frase (marcadores, comillas, "que diga", etc.). */
export function extractExplicitSmsMessage(text: string): string | null {
  const t = text.trim();
  if (!t) {
    return null;
  }

  const quoted = t.match(
    /(?:que\s+)?diga\s+["'«]([^"'»]+)["'»]|["'«]([^"'»]{3,})["'»]/i,
  );
  if (quoted?.[1]?.trim()) {
    return quoted[1].trim();
  }
  if (quoted?.[2]?.trim()) {
    return quoted[2].trim();
  }

  const patterns: RegExp[] = [
    /\bcon\s+el\s+texto\s+(.+)/i,
    /\bcon\s+el\s+mensaje\s+(.+)/i,
    /\bque\s+diga\s+(.+)/i,
    /\bel\s+mensaje\s+es[:\s]+(.+)/i,
    /\bmensaje[:\s]+(.+)/i,
    /\btexto[:\s]+(.+)/i,
    /\b(?:sms|mensaje)\s+que\s+diga\s+(.+)/i,
    /\b(?:sms|mensaje)\s+con\s+el\s+mensaje\s+(.+)/i,
    /\benv[ií]a(?:r)?\s+(?:un\s+)?(?:sms|mensaje)\s+que\s+diga\s+(.+)/i,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]?.trim()) {
      let body = m[1].trim();
      const phone = extractPhoneFromText(body);
      if (phone) {
        body = body
          .replace(new RegExp(phone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "")
          .replace(/\bcon\s+el\s+texto\b/gi, "")
          .replace(/\bque\s+diga\b/gi, "")
          .trim();
      }
      if (body.length >= 2 && !isSendSmsIntentOnly(body)) {
        return body;
      }
    }
  }

  return null;
}

function intentKeywordRatio(text: string): number {
  const n = normalizeIntentText(text);
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return 1;
  }
  const hits = n.match(INTENT_KEYWORD_RE) ?? [];
  return hits.length / words.length;
}

/** Frase que no debe persistirse como pendingSmsMessage. */
export function isCorruptedIntentPhrase(text: string): boolean {
  const t = text.trim();
  if (!t) {
    return true;
  }
  if (extractExplicitSmsMessage(t)) {
    return false;
  }
  if (isSendSmsIntentOnly(t)) {
    return true;
  }
  if (INTENT_FRAGMENT_RE.test(t)) {
    return true;
  }
  if (matchesSendSmsFlowIntent(t) && t.length < 90 && intentKeywordRatio(t) >= 0.45) {
    return true;
  }
  return false;
}

/** Solo intención de envío, sin cuerpo SMS ni destino en el mismo turno. */
export function isSendSmsIntentOnly(text: string): boolean {
  const t = text.trim();
  if (!t) {
    return false;
  }
  if (extractExplicitSmsMessage(t)) {
    return false;
  }
  if (extractPhoneFromText(t)) {
    return false;
  }
  if (!matchesSendSmsFlowIntent(t)) {
    return false;
  }
  return true;
}

/** @deprecated use isSendSmsIntentOnly */
export function isOnlySendIntentStarter(text: string): boolean {
  return isSendSmsIntentOnly(text);
}

export function isMessageRequestedByAgent(memory: {
  waitingForMessage?: boolean;
  sendSmsFlowStep?: string;
}): boolean {
  return (
    memory.waitingForMessage === true ||
    memory.sendSmsFlowStep === "need_message"
  );
}

/** Limpia pendingSmsMessage corrupto (frases de intención guardadas por error). */
export function sanitizePendingSmsMessage(
  stored: string | null | undefined,
): string | null {
  if (!stored?.trim()) {
    return null;
  }
  const t = stored.trim();
  if (isCorruptedIntentPhrase(t)) {
    return null;
  }
  const explicit = extractExplicitSmsMessage(t);
  if (explicit) {
    return explicit;
  }
  if (matchesSendSmsFlowIntent(t)) {
    return null;
  }
  return t;
}

/** Texto plausible como cuerpo SMS en turno de seguimiento (agente pidió el mensaje). */
export function looksLikeActualSmsMessage(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 3) {
    return false;
  }
  if (/^(confirmo|cancelar|no|sí|si|detener|anular)\b/i.test(t)) {
    return false;
  }
  if (matchesCsvDestChoice(t) || matchesSingleDestChoice(t)) {
    return false;
  }
  if (extractExplicitSmsMessage(t)) {
    return true;
  }
  if (isSendSmsIntentOnly(t) || isCorruptedIntentPhrase(t)) {
    return false;
  }
  const onlyPhone = extractPhoneFromText(t);
  if (onlyPhone && t.replace(/\D/g, "").length <= 13) {
    return false;
  }
  if (matchesSendSmsFlowIntent(t)) {
    return false;
  }
  return true;
}

export function parseSendSmsDraft(text: string): SendSmsDraft {
  const phone = extractPhoneFromText(text);
  const message = extractExplicitSmsMessage(text);

  if (message && phone) {
    const phoneDigits = phone.replace(/\D/g, "");
    let cleaned = message
      .replace(new RegExp(phone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "")
      .replace(new RegExp(phoneDigits, "g"), "")
      .replace(/\bcon\s+el\s+texto\b/gi, "")
      .replace(/\bque\s+diga\b/gi, "")
      .trim();
    if (cleaned.length < 2) {
      return { phone, message: null };
    }
    return { phone, message: cleaned };
  }

  return { phone, message };
}

/** Cuerpo del SMS cuando el agente ya pidió el mensaje. */
export function parseFollowUpSmsBody(
  text: string,
  options?: { waitingForMessage?: boolean },
): string | null {
  if (options?.waitingForMessage !== true) {
    return null;
  }
  if (!looksLikeActualSmsMessage(text)) {
    return null;
  }
  return extractExplicitSmsMessage(text) ?? text.trim();
}
