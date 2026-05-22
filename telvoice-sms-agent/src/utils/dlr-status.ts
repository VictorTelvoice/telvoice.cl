import type { SmsMessageStatus } from "../types/database.js";

const FAILED_STATUSES = new Set(
  ["failed", "undeliverable", "rejected", "expired", "dnd"].map((s) =>
    s.toLowerCase(),
  ),
);

const PENDING_STATUSES = new Set(
  ["pending", "accepted", "acknowledged"].map((s) => s.toLowerCase()),
);

export function normalizeDlrToMessageStatus(
  dlrStatus: string | null | undefined,
): SmsMessageStatus {
  if (!dlrStatus || dlrStatus.trim() === "") {
    return "pending";
  }

  const key = dlrStatus.trim().toLowerCase();

  if (key === "delivered") {
    return "delivered";
  }

  if (FAILED_STATUSES.has(key)) {
    return "failed";
  }

  if (PENDING_STATUSES.has(key) || key === "unknown") {
    return "pending";
  }

  return "unknown";
}

export function isDeliveredDlr(dlrStatus: string | null | undefined): boolean {
  return dlrStatus?.trim().toLowerCase() === "delivered";
}
