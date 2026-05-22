import type { AsmscApiResponse } from "../types/asmsc.js";
import type { SmsMessageStatus } from "../types/database.js";

export interface ParsedSendSmsResponse {
  provider_status: string | null;
  provider_message_id: string | null;
  remarks: string | null;
  status: SmsMessageStatus;
  sent_at: string | null;
}

export function parseSendSmsResponse(
  response: AsmscApiResponse,
): ParsedSendSmsResponse {
  const providerStatus = pickString(response, "status", "Status");
  const providerMessageId = pickString(
    response,
    "message_id",
    "MessageID",
    "MessageId",
  );
  const remarks = pickString(response, "remarks", "Remarks", "remark", "Remark");

  const normalizedStatus = providerStatus?.toUpperCase();
  let status: SmsMessageStatus = "failed";
  let sentAt: string | null = null;

  if (normalizedStatus === "S") {
    status = "submitted";
    sentAt = new Date().toISOString();
  } else if (normalizedStatus === "F") {
    status = "failed";
  }

  return {
    provider_status: providerStatus,
    provider_message_id: providerMessageId,
    remarks,
    status,
    sent_at: sentAt,
  };
}

export function pickString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return null;
}

export function pickInteger(
  record: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}
