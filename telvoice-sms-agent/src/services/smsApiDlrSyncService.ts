import { getSupabase } from "../database/supabaseClient.js";
import type { AsmscDlrWebhookBody } from "../types/asmsc.js";
import type { SmsApiMessageRow, SmsApiMessageStatus } from "../types/sms-api-messages.js";
import { isDeliveredDlr, normalizeDlrToMessageStatus } from "../utils/dlr-status.js";
import { sanitizeProviderResponse } from "./sms-providers/sanitize.js";
import { extractDlrFields } from "./smsMessageService.js";
import { rowToSmsApiMessage } from "./smsApiMessageService.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export type SmsApiDlrSyncOutcome = "matched" | "skipped";

export type SmsApiDlrSyncResult = {
  outcome: SmsApiDlrSyncOutcome;
  reason: string;
  apiMessageId: string | null;
  oldStatus: string | null;
  newStatus: string | null;
  oldDlrStatus: string | null;
  newDlrStatus: string | null;
};

export type SmsApiDlrSyncInput = {
  providerMessageId?: string | null;
  uid?: string | null;
  dlrStatus?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
  rawPayload?: Record<string, unknown> | null;
  receivedAt?: string | null;
};

const FAILED_DLR_KEYS = new Set(
  ["failed", "undeliv", "undeliverable", "rejectd", "rejected", "expired", "dnd"].map(
    (s) => s.toLowerCase(),
  ),
);

const PENDING_DLR_KEYS = new Set(
  ["pending", "enroute", "acceptd", "accepted", "acknowledged"].map((s) =>
    s.toLowerCase(),
  ),
);

function normalizeDlrKey(dlrStatus: string | null | undefined): string {
  return (dlrStatus ?? "").trim().toLowerCase();
}

export function mapDlrToSmsApiMessageState(dlrStatus: string | null | undefined): {
  status: SmsApiMessageStatus;
  dlrStatus: string;
} {
  const raw = (dlrStatus ?? "").trim();
  const key = normalizeDlrKey(raw);

  if (key === "delivered" || key === "delivrd") {
    return { status: "delivered", dlrStatus: "delivered" };
  }

  if (FAILED_DLR_KEYS.has(key)) {
    if (key === "expired") {
      return { status: "expired", dlrStatus: "expired" };
    }
    if (key === "rejected" || key === "rejectd") {
      return { status: "rejected", dlrStatus: key || "rejected" };
    }
    return { status: "failed", dlrStatus: key || "failed" };
  }

  if (PENDING_DLR_KEYS.has(key) || key === "unknown" || key === "") {
    return { status: "sent", dlrStatus: key || "pending" };
  }

  const mapped = normalizeDlrToMessageStatus(raw);
  if (mapped === "delivered") {
    return { status: "delivered", dlrStatus: "delivered" };
  }
  if (mapped === "failed") {
    return { status: "failed", dlrStatus: key };
  }
  return { status: "sent", dlrStatus: key };
}

function isTerminalSmsApiStatus(status: string): boolean {
  return ["delivered", "failed", "expired", "rejected"].includes(status);
}

export function shouldApplySmsApiDlrUpdate(
  current: Pick<SmsApiMessageRow, "status" | "dlr_status">,
  incoming: { status: SmsApiMessageStatus; dlrStatus: string },
): { apply: boolean; reason: string } {
  const curStatus = current.status;
  const curDlr = normalizeDlrKey(current.dlr_status);
  const inDlr = normalizeDlrKey(incoming.dlrStatus);

  if (curStatus === incoming.status && curDlr === inDlr) {
    return { apply: false, reason: "idempotent_duplicate" };
  }

  if (curStatus === "delivered" || isDeliveredDlr(current.dlr_status)) {
    if (!isDeliveredDlr(incoming.dlrStatus)) {
      return { apply: false, reason: "terminal_delivered" };
    }
    return { apply: false, reason: "idempotent_duplicate" };
  }

  if (curStatus === "failed" && incoming.status === "delivered") {
    return { apply: true, reason: "provider_correction" };
  }

  if (isTerminalSmsApiStatus(curStatus) && ["sent", "pending"].includes(incoming.status)) {
    return { apply: false, reason: `terminal_${curStatus}` };
  }

  return { apply: true, reason: "update" };
}

function mergeDlrMetadata(
  existing: Record<string, unknown>,
  input: SmsApiDlrSyncInput,
  mapped: { status: SmsApiMessageStatus; dlrStatus: string },
): Record<string, unknown> {
  const receivedAt = input.receivedAt ?? new Date().toISOString();
  const sanitized =
    input.rawPayload != null
      ? sanitizeProviderResponse(input.rawPayload)
      : undefined;

  const next: Record<string, unknown> = {
    ...existing,
    last_dlr_status: input.dlrStatus ?? mapped.dlrStatus,
    last_dlr_at: receivedAt,
    last_dlr_error_code: input.errorCode ?? null,
    last_dlr_error_description: input.errorDescription ?? null,
  };

  if (sanitized) {
    next.last_dlr_payload = sanitized;
  }

  if (input.errorCode != null && input.errorCode !== "") {
    next.error_code = input.errorCode;
  }
  if (input.errorDescription != null && input.errorDescription !== "") {
    next.error_description = input.errorDescription;
  }

  if (mapped.status === "delivered") {
    next.dlr_delivered_at = receivedAt;
  } else if (mapped.status === "failed" || mapped.status === "rejected" || mapped.status === "expired") {
    next.dlr_failed_at = receivedAt;
  }

  return next;
}

async function findSmsApiMessagesForDlr(input: SmsApiDlrSyncInput): Promise<SmsApiMessageRow[]> {
  const providerMessageId = input.providerMessageId?.trim() || null;
  const uid = input.uid?.trim() || null;

  if (providerMessageId) {
    const { data, error } = await getSupabase()
      .from("sms_api_messages")
      .select("*")
      .eq("provider_message_id", providerMessageId);

    if (error) {
      wrapSupabaseError(error, "findSmsApiMessagesForDlr");
    }
    if ((data ?? []).length > 0) {
      return data as SmsApiMessageRow[];
    }
  }

  if (uid) {
    const { data, error } = await getSupabase()
      .from("sms_api_messages")
      .select("*")
      .contains("metadata", { asmsc_uid: uid });

    if (error) {
      wrapSupabaseError(error, "findSmsApiMessagesForDlrByUid");
    }
    return (data ?? []) as SmsApiMessageRow[];
  }

  return [];
}

export async function syncSmsApiMessageFromDlrEvent(
  input: SmsApiDlrSyncInput,
): Promise<SmsApiDlrSyncResult> {
  const rows = await findSmsApiMessagesForDlr(input);

  if (rows.length === 0) {
    return {
      outcome: "skipped",
      reason: "api_message_not_found",
      apiMessageId: null,
      oldStatus: null,
      newStatus: null,
      oldDlrStatus: null,
      newDlrStatus: null,
    };
  }

  if (rows.length > 1) {
    console.warn("[DLR] sms_api_messages ambiguo por provider_message_id", {
      provider_message_id: input.providerMessageId,
      count: rows.length,
      message_ids: rows.map((r) => r.id),
    });
    return {
      outcome: "skipped",
      reason: "ambiguous_match",
      apiMessageId: null,
      oldStatus: null,
      newStatus: null,
      oldDlrStatus: null,
      newDlrStatus: null,
    };
  }

  const row = rows[0]!;
  const mapped = mapDlrToSmsApiMessageState(input.dlrStatus);
  const decision = shouldApplySmsApiDlrUpdate(row, mapped);

  if (!decision.apply) {
    return {
      outcome: "skipped",
      reason: decision.reason,
      apiMessageId: row.id,
      oldStatus: row.status,
      newStatus: row.status,
      oldDlrStatus: row.dlr_status,
      newDlrStatus: row.dlr_status,
    };
  }

  if (decision.reason === "provider_correction") {
    console.info("[DLR] sms_api_messages corrección proveedor failed→delivered", {
      api_message_id: row.id,
      provider_message_id: input.providerMessageId,
    });
  }

  const existingMetadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};

  const metadata = mergeDlrMetadata(existingMetadata, input, mapped);
  const nextStatus =
    row.status === "pending" && mapped.status === "sent" ? "sent" : mapped.status;

  const { data, error } = await getSupabase()
    .from("sms_api_messages")
    .update({
      status: nextStatus,
      dlr_status: mapped.dlrStatus,
      metadata,
    })
    .eq("id", row.id)
    .eq("company_id", row.company_id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "syncSmsApiMessageFromDlrEvent");
  }

  const updated = rowToSmsApiMessage(data as SmsApiMessageRow);

  console.info("[DLR] sms_api_messages actualizado", {
    api_message_id: updated.id,
    company_id: updated.companyId,
    provider_message_id: input.providerMessageId,
    old_status: row.status,
    new_status: updated.status,
    old_dlr_status: row.dlr_status,
    new_dlr_status: updated.dlrStatus,
    reason: decision.reason,
  });

  return {
    outcome: "matched",
    reason: decision.reason,
    apiMessageId: updated.id,
    oldStatus: row.status,
    newStatus: updated.status,
    oldDlrStatus: row.dlr_status,
    newDlrStatus: updated.dlrStatus,
  };
}

export async function syncSmsApiMessageFromAsmscDlrWebhook(
  body: AsmscDlrWebhookBody,
  receivedAt?: string | null,
): Promise<SmsApiDlrSyncResult> {
  const fields = extractDlrFields(body);
  return syncSmsApiMessageFromDlrEvent({
    providerMessageId: fields.provider_message_id,
    uid: fields.uid,
    dlrStatus: fields.dlr_status,
    errorCode: fields.error_code,
    errorDescription: fields.error_description,
    rawPayload: { ...body } as Record<string, unknown>,
    receivedAt: receivedAt ?? new Date().toISOString(),
  });
}
