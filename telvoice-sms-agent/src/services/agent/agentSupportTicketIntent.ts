import { normalizeIntentText } from "../telegramIntentService.js";

const EXACT_SUPPORT_COMMANDS = new Set([
  "ticket",
  "soporte",
  "crear ticket",
  "abrir ticket",
  "levantar ticket",
  "abrir solicitud",
  "crear solicitud",
  "contactar soporte",
  "necesito soporte",
  "necesito ayuda",
]);

const SUPPORT_PHRASE_RE =
  /\b(crear ticket|abrir ticket|levantar ticket|abrir solicitud|crear solicitud|contactar soporte|necesito soporte|necesito ayuda|problema con|tengo un problema|problema en|problema de)\b/;

/** Frases que contienen "ticket" pero son cuerpo SMS, no intención de soporte. */
export function isSmsTicketBodyPhrase(text: string): boolean {
  const t = text.trim();
  if (!t) {
    return false;
  }
  if (
    /^(tu|su|mi)\s+ticket\s+(es|numero|n[uú]mero)\s+\d/i.test(t) ||
    /^presenta\s+tu\s+ticket/i.test(t) ||
    /^muestra\s+tu\s+ticket/i.test(t)
  ) {
    return true;
  }
  if (
    /\bticket\s+de\s+descuento\b/i.test(t) &&
    !/\b(problema|soporte|crear|abrir|necesito|ayuda)\b/i.test(t)
  ) {
    return true;
  }
  if (
    /\bticket\s+para\s+clientes\b/i.test(t) &&
    !/\b(problema|soporte|crear|abrir|necesito|ayuda)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Intención global de crear ticket de soporte.
 * "ticket" exacto → true; "tu ticket es 1234" → false.
 */
export function isSupportTicketIntent(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (isSmsTicketBodyPhrase(trimmed)) {
    return false;
  }
  const n = normalizeIntentText(trimmed);
  if (EXACT_SUPPORT_COMMANDS.has(n)) {
    return true;
  }
  if (SUPPORT_PHRASE_RE.test(n)) {
    return true;
  }
  return false;
}

export function isSupportTicketConfirm(text: string): boolean {
  const n = normalizeIntentText(text.trim());
  return /^(crear ticket|confirmar ticket|confirmo|confirmar|si|sí|ok|enviar|crear)$/.test(n);
}

export function isSupportTicketEditMessage(text: string): boolean {
  const n = normalizeIntentText(text.trim());
  return /^(editar mensaje|editar|cambiar mensaje|modificar mensaje)$/.test(n);
}

export function isSupportTicketChangeCategory(text: string): boolean {
  const n = normalizeIntentText(text.trim());
  return /^(cambiar categoria|cambiar categoría|otra categoria|otra categoría)$/.test(n);
}
