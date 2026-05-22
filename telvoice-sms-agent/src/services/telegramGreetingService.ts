import type { AuthorizedTelegramClient } from "./telegramAuthorizationService.js";
import { matchesCommercialBuyIntent, normalizeIntentText } from "./telegramIntentService.js";

const CHILE_TZ = "America/Santiago";

export function getChileHour(date = new Date()): number {
  const hourStr = new Intl.DateTimeFormat("es-CL", {
    timeZone: CHILE_TZ,
    hour: "numeric",
    hour12: false,
  }).format(date);
  return parseInt(hourStr, 10);
}

/** Saludo según hora local Chile (America/Santiago). */
export function getTimeOfDayGreetingChile(date = new Date()): string {
  const hour = getChileHour(date);
  if (hour >= 5 && hour < 12) {
    return "Buenos días";
  }
  if (hour >= 12 && hour < 20) {
    return "Buenas tardes";
  }
  return "Buenas noches";
}

function formatDisplayName(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  const firstWord = trimmed.split(/\s+/)[0] ?? trimmed;
  if (!firstWord) {
    return null;
  }
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}

export function resolveTelegramDisplayName(
  auth: AuthorizedTelegramClient | null,
  telegramFirstName?: string | null,
): string | null {
  const fromDb = formatDisplayName(auth?.telegramUser.first_name ?? null);
  if (fromDb) {
    return fromDb;
  }
  return formatDisplayName(telegramFirstName ?? null);
}

export function buildHumanGreetingMessage(
  auth: AuthorizedTelegramClient | null,
  telegramFirstName?: string | null,
): string {
  const name = resolveTelegramDisplayName(auth, telegramFirstName);
  const timeGreeting = getTimeOfDayGreetingChile();
  const namePart = name ? ` ${name}` : "";
  return `Hola${namePart}, ${timeGreeting.toLowerCase()}. ¿En qué puedo ayudarte hoy?`;
}

/** Saludo simple sin menú (solo hola / buenos días, etc.). */
export function isCasualGreetingOnly(text: string): boolean {
  const normalized = normalizeIntentText(text);
  if (!normalized) {
    return false;
  }

  if (matchesCommercialBuyIntent(normalized)) {
    return false;
  }

  if (/\b(cotizar|comprar|precios|planes|saldo|historial|enviar|buscar)\b/.test(normalized)) {
    return false;
  }

  const greetingPatterns = [
    /^(hola|hello|hi|hey|que tal|como estas)(\s*!*)?$/,
    /^(buenos dias|buenas tardes|buenas noches|buen dia)(\s*!*)?$/,
    /^hola\s+(buenos dias|buenas tardes|buenas noches)$/,
    /^(buenos dias|buenas tardes|buenas noches)\s+hola$/,
  ];

  return greetingPatterns.some((p) => p.test(normalized));
}
