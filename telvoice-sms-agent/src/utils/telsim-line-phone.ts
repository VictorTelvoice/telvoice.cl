import { validateRecipientNumber } from "../services/smsSegmentService.js";

const LINE_PHONE_KEYS = [
  "to",
  "recipient",
  "recipient_number",
  "phone_number",
  "sim_number",
  "line_number",
  "number",
  "msisdn",
  "destination",
  "our_number",
  "receiver",
  "line_phone",
] as const;

/** Normaliza teléfono chileno a E.164 (+569xxxxxxxx). */
export function normalizeTelsimLinePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const validated = validateRecipientNumber(trimmed);
  if (validated.ok && validated.normalized) {
    return validated.normalized;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("9")) {
    return `+56${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("569")) {
    return `+${digits}`;
  }
  return null;
}

/** Intenta obtener el número de la línea que recibió el SMS (chip telsim). */
export function extractLinePhoneFromTelsimBody(
  body: Record<string, unknown>,
): string | null {
  for (const key of LINE_PHONE_KEYS) {
    const val = body[key];
    if (typeof val === "string" && val.trim()) {
      const normalized = normalizeTelsimLinePhone(val);
      if (normalized) {
        return normalized;
      }
    }
  }

  const nested = body.data ?? body.payload ?? body.sim;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return extractLinePhoneFromTelsimBody(nested as Record<string, unknown>);
  }

  return null;
}
