import type { AsmscDlrWebhookBody } from "../types/asmsc.js";
import type { PanelSmsMessageRow, PanelSmsMessageStatus } from "../types/sms-panel.js";
import { isDeliveredDlr, normalizeDlrToMessageStatus } from "../utils/dlr-status.js";
import { resolveOperatorFromAsmscPayload, pickAsmscPayloadString } from "../utils/asmsc-operator.js";
import { extractDlrFields } from "./smsMessageService.js";
import { sanitizeProviderResponse } from "./sms-providers/sanitize.js";
import {
  findPanelMessageForAsmscDlr,
  insertPanelDeliveryEvent,
  updatePanelSmsMessage,
} from "./panelSmsMessageService.js";

/** Modos panel que deben persistir DLR (campaña live y pruebas live_test). */
export const PANEL_DLR_ELIGIBLE_MODES = new Set(["live", "live_test"]);

export function isPanelMessageEligibleForAsmscDlr(
  message: Pick<PanelSmsMessageRow, "mode"> | null | undefined,
): boolean {
  if (!message?.mode) {
    return false;
  }
  return PANEL_DLR_ELIGIBLE_MODES.has(message.mode);
}

export function mapDlrToPanelStatus(
  dlrStatus: string | null | undefined,
): PanelSmsMessageStatus {
  const mapped = normalizeDlrToMessageStatus(dlrStatus);
  if (mapped === "delivered") {
    return "delivered";
  }
  if (mapped === "failed") {
    return "failed";
  }
  if (mapped === "submitted") {
    return "sent";
  }
  return "pending";
}

export async function processPanelSmsDlrFromAsmsc(
  body: AsmscDlrWebhookBody,
): Promise<{ panel_message_id: string | null }> {
  const fields = extractDlrFields(body);
  const providerMessageId = fields.provider_message_id
    ? String(fields.provider_message_id).trim()
    : null;
  const uid = fields.uid?.trim() || null;

  const message = await findPanelMessageForAsmscDlr({
    providerMessageId,
    uid,
  });

  if (!message) {
    return { panel_message_id: null };
  }

  if (!isPanelMessageEligibleForAsmscDlr(message)) {
    console.info("[DLR] Panel omitido (mode no elegible para DLR)", {
      panel_message_id: message.id,
      mode: message.mode,
    });
    return { panel_message_id: null };
  }

  const dlrStatus = fields.dlr_status;
  const panelStatus = mapDlrToPanelStatus(dlrStatus);
  const deliveredAt = isDeliveredDlr(dlrStatus)
    ? new Date().toISOString()
    : null;

  const dlrAt = new Date().toISOString();
  const sanitizedDlr = sanitizeProviderResponse(body as Record<string, unknown>);
  const dlrOperator = resolveOperatorFromAsmscPayload(
    body as Record<string, unknown>,
  );
  const dlrMcc = pickAsmscPayloadString(body as Record<string, unknown>, "MCC", "mcc");
  const dlrMnc = pickAsmscPayloadString(body as Record<string, unknown>, "MNC", "mnc");

  const alreadyDelivered =
    message.status === "delivered" && panelStatus === "delivered";

  await updatePanelSmsMessage(message.id, {
    status: panelStatus,
    delivered_at: deliveredAt ?? message.delivered_at,
    error_code: fields.error_code ?? message.error_code,
    error_message: fields.error_description ?? message.error_message,
    operator: dlrOperator ?? message.operator,
    metadata: {
      asmsc_uid: uid ?? undefined,
      last_dlr_status: dlrStatus,
      last_dlr_at: dlrAt,
      last_dlr_payload: sanitizedDlr,
      dlr_operator: dlrOperator ?? undefined,
      dlr_mcc: dlrMcc ?? undefined,
      dlr_mnc: dlrMnc ?? undefined,
    },
  });

  if (!alreadyDelivered) {
    await insertPanelDeliveryEvent({
      companyId: message.company_id,
      messageId: message.id,
      provider: message.provider,
      providerMessageId: providerMessageId ?? message.provider_message_id,
      status: panelStatus === "delivered" ? "delivered" : (dlrStatus ?? panelStatus),
      rawPayload: sanitizedDlr,
    });
  }

  return { panel_message_id: message.id };
}
