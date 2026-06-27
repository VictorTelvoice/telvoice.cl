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
  "requiero soporte",
  "quiero soporte",
  "necesito ayuda",
  "requiero ayuda",
  "quiero ayuda",
  "ayuda soporte",
  "hablar con soporte",
  "quiero hablar con soporte",
  "abrir soporte",
  "quiero abrir un ticket",
  "quiero crear un ticket",
  "tengo un problema",
  "tengo problemas",
]);

const SUPPORT_PHRASE_RE =
  /\b(crear ticket|abrir ticket|levantar ticket|abrir solicitud|crear solicitud|contactar soporte|necesito soporte|requiero soporte|quiero soporte|necesito ayuda|requiero ayuda|quiero ayuda|hablar con soporte|abrir soporte|quiero abrir|quiero crear|problema con|tengo un problema|tengo problemas|tengo problema|problema en|problema de|no se acredito|no acredito|no puedo enviar)\b/;

const BALANCE_NOT_SUPPORT_RE =
  /\b(ver mi saldo|cuanto saldo|cuanto tengo|cuánto tengo|mi saldo|sms disponibles|revisar saldo|consultar saldo)\b/;

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
  if (/^(codigo|código)\s+de\s+soporte\s+\d/i.test(t)) {
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
  if (BALANCE_NOT_SUPPORT_RE.test(n) && !/\b(problema|soporte|ticket|acredit|ayuda)\b/.test(n)) {
    return false;
  }
  if (EXACT_SUPPORT_COMMANDS.has(n)) {
    return true;
  }
  if (SUPPORT_PHRASE_RE.test(n)) {
    return true;
  }
  if (/\b(quiero|necesito|requiero)\s+ayuda\b/.test(n) && !/\b(comprar|cotizar|sms|mensajes|bolsa)\b/.test(n)) {
    return true;
  }
  if (/\b(quiero|necesito|requiero)\s+soporte\b/.test(n)) {
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
