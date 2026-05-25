import type { AsmscDlrWebhookBody } from "../types/asmsc.js";
import type { PanelSmsMessageStatus } from "../types/sms-panel.js";
import { isDeliveredDlr, normalizeDlrToMessageStatus } from "../utils/dlr-status.js";
import { extractDlrFields } from "./smsMessageService.js";
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
  const fields = extractDlrFields(body);
  const providerMessageId = fields.provider_message_id;
  const uid = fields.uid;

  let message = providerMessageId
    ? await findPanelMessageByProviderMessageId(providerMessageId)
    : null;

  if (!message && uid) {
    message = await findPanelMessageByAsmscUid(uid);
  }

  if (!message || message.mode !== "live_test") {
    return { panel_message_id: null };
  }

  const dlrStatus = fields.dlr_status;
  const panelStatus = mapDlrToPanelStatus(dlrStatus);
  const deliveredAt = isDeliveredDlr(dlrStatus)
    ? new Date().toISOString()
    : null;

  const dlrAt = new Date().toISOString();
  const sanitizedDlr = sanitizeProviderResponse(body as Record<string, unknown>);

  await updatePanelSmsMessage(message.id, {
    status: panelStatus,
    delivered_at: deliveredAt,
    error_code: fields.error_code ?? message.error_code,
    error_message: fields.error_description ?? message.error_message,
    metadata: {
      asmsc_uid: uid ?? undefined,
      last_dlr_status: dlrStatus,
      last_dlr_at: dlrAt,
      last_dlr_payload: sanitizedDlr,
    },
  });

  await insertPanelDeliveryEvent({
    companyId: message.company_id,
    messageId: message.id,
    provider: message.provider,
    providerMessageId: providerMessageId ?? message.provider_message_id,
    status: dlrStatus ?? panelStatus,
    rawPayload: sanitizedDlr,
  });

  return { panel_message_id: message.id };
}
