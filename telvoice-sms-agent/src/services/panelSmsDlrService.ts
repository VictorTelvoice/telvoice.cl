import type { AsmscDlrWebhookBody } from "../types/asmsc.js";
import type { PanelSmsMessageStatus } from "../types/sms-panel.js";
import { isDeliveredDlr, normalizeDlrToMessageStatus } from "../utils/dlr-status.js";
import { sanitizeProviderResponse } from "./sms-providers/sanitize.js";
import {
  findPanelMessageByAsmscUid,
  findPanelMessageByProviderMessageId,
  insertPanelDeliveryEvent,
  updatePanelSmsMessage,
} from "./panelSmsMessageService.js";

function mapDlrToPanelStatus(dlrStatus: string | null | undefined): PanelSmsMessageStatus {
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
  const providerMessageId =
    typeof body.message_id === "string" && body.message_id.trim()
      ? body.message_id.trim()
      : null;
  const uid =
    typeof body.uid === "string" && body.uid.trim() ? body.uid.trim() : null;

  let message = providerMessageId
    ? await findPanelMessageByProviderMessageId(providerMessageId)
    : null;

  if (!message && uid) {
    message = await findPanelMessageByAsmscUid(uid);
  }

  if (!message || message.mode !== "live_test") {
    return { panel_message_id: null };
  }

  const dlrStatus =
    typeof body.DLRStatus === "string" ? body.DLRStatus : null;
  const panelStatus = mapDlrToPanelStatus(dlrStatus);
  const deliveredAt = isDeliveredDlr(dlrStatus)
    ? new Date().toISOString()
    : null;

  await updatePanelSmsMessage(message.id, {
    status: panelStatus,
    delivered_at: deliveredAt,
    error_code:
      typeof body.ErrorCode === "string" ? body.ErrorCode : message.error_code,
    error_message:
      typeof body.ErrorDescription === "string"
        ? body.ErrorDescription
        : message.error_message,
    metadata: {
      ...(message.metadata ?? {}),
      last_dlr_status: dlrStatus,
      last_dlr_at: new Date().toISOString(),
    },
  });

  await insertPanelDeliveryEvent({
    companyId: message.company_id,
    messageId: message.id,
    provider: message.provider,
    providerMessageId: providerMessageId ?? message.provider_message_id,
    status: dlrStatus ?? panelStatus,
    rawPayload: sanitizeProviderResponse(body as Record<string, unknown>),
  });

  return { panel_message_id: message.id };
}
