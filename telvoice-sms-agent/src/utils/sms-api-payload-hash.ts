import crypto from "node:crypto";
import type { SmsApiSendPayload } from "../types/sms-api-messages.js";

export type NormalizedSmsApiPayload = {
  to: string;
  message: string;
  sender: string | null;
  country: string | null;
  external_reference: string | null;
};

export function normalizeSmsApiSendPayload(
  payload: SmsApiSendPayload,
): NormalizedSmsApiPayload {
  return {
    to: payload.to.trim(),
    message: payload.message.trim(),
    sender: payload.sender?.trim() ? payload.sender.trim() : null,
    country: payload.country?.trim() ? payload.country.trim().toUpperCase() : null,
    external_reference: payload.external_reference?.trim()
      ? payload.external_reference.trim()
      : null,
  };
}

export function hashSmsApiSendPayload(payload: SmsApiSendPayload): string {
  const normalized = normalizeSmsApiSendPayload(payload);
  const canonical = JSON.stringify({
    country: normalized.country,
    external_reference: normalized.external_reference,
    message: normalized.message,
    sender: normalized.sender,
    to: normalized.to,
  });
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}
