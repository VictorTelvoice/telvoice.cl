import {
  assertAsmscCredentials,
  assertSupabaseCredentials,
  buildDlrCallbackUrl,
} from "../config/env.js";
import { asmscClient } from "../providers/asmsc/index.js";
import type { AsmscApiResponse, AsmscDlrWebhookBody } from "../types/asmsc.js";
import type { SmsMessageRow } from "../types/database.js";
import { parseSendSmsResponse } from "../utils/asmsc-response.js";
import {
  isDeliveredDlr,
  normalizeDlrToMessageStatus,
} from "../utils/dlr-status.js";
import { AppError } from "../utils/errors.js";
import { estimateSmsParts } from "../utils/sms-parts.js";
import { generateSmsUid } from "../utils/uid.js";
import { toSendSmsRequest, validateSendTestBody } from "../utils/validation.js";
import { resolveClientForSend } from "./clientService.js";
import {
  createDlrEvent,
  createPendingMessage,
  extractDlrFields,
  findMessageByProviderMessageId,
  findMessageByUid,
  getMessageById,
  getMessageByUid,
  linkDlrEventToMessage,
  listRecentMessages,
  toPublicMessage,
  updateMessageAfterSubmit,
  updateMessageFromDlr,
} from "./smsMessageService.js";

export interface SendTestResult {
  internal_message_id: string;
  uid: string;
  provider_message_id: string | null;
  provider_status: string | null;
  status: string;
  remarks: string | null;
  provider_response: AsmscApiResponse;
}

export async function sendTestSms(body: unknown): Promise<SendTestResult> {
  assertSupabaseCredentials();
  assertAsmscCredentials();

  const validated = validateSendTestBody(body);
  const { client } = await resolveClientForSend(validated.client_id);
  const uid = generateSmsUid();
  const callbackUrl = buildDlrCallbackUrl();
  const estimatedParts = estimateSmsParts(
    validated.textmessage,
    validated.encoding,
  );

  const pending = await createPendingMessage({
    client_id: client.id,
    provider: "asmsc",
    uid,
    phonenumber: validated.phonenumber,
    sender_id: validated.sender_id,
    textmessage: validated.textmessage,
    sms_type: validated.sms_type,
    encoding: validated.encoding,
    estimated_parts: estimatedParts,
  });

  console.info("[SMS] Registro creado internamente", {
    internal_message_id: pending.id,
    uid: pending.uid,
    client_id: client.id,
    status: pending.status,
  });

  let provider: AsmscApiResponse;
  try {
    provider = await asmscClient.sendSms(
      toSendSmsRequest(validated, uid, callbackUrl),
    );
  } catch (error) {
    await updateMessageAfterSubmit(pending.id, {
      status: "failed",
      remarks:
        error instanceof Error ? error.message : "Error al enviar con aSMSC",
      raw_submit_response: null,
    });
    throw error;
  }

  const parsed = parseSendSmsResponse(provider);
  const rawSubmitResponse: AsmscApiResponse = {
    ...provider,
    _agent: {
      callback_url: callbackUrl ?? null,
    },
  };
  const updated = await updateMessageAfterSubmit(pending.id, {
    provider_message_id: parsed.provider_message_id,
    provider_status: parsed.provider_status,
    remarks: parsed.remarks,
    raw_submit_response: rawSubmitResponse,
    status: parsed.status,
    sent_at: parsed.sent_at,
  });

  console.info("[SMS] Enviado a proveedor", {
    uid: updated.uid,
    provider_status: updated.provider_status,
    provider_message_id: updated.provider_message_id,
    status: updated.status,
  });

  return buildSendTestResponse(updated, provider);
}

export async function processAsmscDlrWebhook(
  body: AsmscDlrWebhookBody,
): Promise<{ dlr_event_id: string; sms_message_id: string | null }> {
  assertSupabaseCredentials();

  const fields = extractDlrFields(body);
  const rawPayload = { ...body } as Record<string, unknown>;

  console.info("[DLR] Recibido", {
    uid: fields.uid,
    message_id: fields.provider_message_id,
    DLRStatus: fields.dlr_status,
    PhoneNumber: fields.phone_number,
  });

  const dlrEvent = await createDlrEvent({
    raw_payload: rawPayload,
    uid: fields.uid,
    provider_message_id: fields.provider_message_id,
    phone_number: fields.phone_number,
    dlr_status: fields.dlr_status,
    sms_id: fields.sms_id,
    client_cost: fields.client_cost,
    error_code: fields.error_code,
    error_description: fields.error_description,
  });

  let message = fields.uid ? await findMessageByUid(fields.uid) : null;

  if (!message && fields.provider_message_id) {
    message = await findMessageByProviderMessageId(fields.provider_message_id);
  }

  if (!message) {
    return { dlr_event_id: dlrEvent.id, sms_message_id: null };
  }

  const normalizedStatus = normalizeDlrToMessageStatus(fields.dlr_status);
  const deliveredAt = isDeliveredDlr(fields.dlr_status)
    ? new Date().toISOString()
    : null;

  const updated = await updateMessageFromDlr(message.id, {
    dlr_status: fields.dlr_status,
    sms_id: fields.sms_id,
    client_cost: fields.client_cost,
    error_code: fields.error_code,
    error_description: fields.error_description,
    remarks: fields.remarks,
    raw_dlr_payload: rawPayload,
    status: normalizedStatus,
    delivered_at: deliveredAt,
  });

  await linkDlrEventToMessage(dlrEvent.id, message.id);

  console.info("[SMS] Actualizado por DLR", {
    internal_message_id: updated.id,
    uid: updated.uid,
    status: updated.status,
    dlr_status: updated.dlr_status,
  });

  return {
    dlr_event_id: dlrEvent.id,
    sms_message_id: message.id,
  };
}

export async function getSmsMessageById(id: string) {
  const row = await getMessageById(id);
  return toPublicMessage(row);
}

export async function getSmsMessageByUid(uid: string) {
  const row = await getMessageByUid(uid);
  return toPublicMessage(row);
}

export async function listSmsMessages() {
  const rows = await listRecentMessages();
  return rows.map(toPublicMessage);
}

export async function simulateDeliveredDlrForMessage(
  messageId: string,
): Promise<{ sms_message_id: string }> {
  const message = await getMessageById(messageId);

  const body: AsmscDlrWebhookBody = {
    uid: message.uid,
    message_id: message.provider_message_id ?? undefined,
    PhoneNumber: message.phonenumber,
    DLRStatus: "Delivered",
    SMSID: message.sms_id ?? message.provider_message_id ?? "simulated",
    ClientCost: 1,
    ErrorCode: "0",
    ErrorDescription: "000",
    Remarks: "OK",
  };

  const result = await processAsmscDlrWebhook(body);
  return { sms_message_id: result.sms_message_id ?? message.id };
}

export async function simulateFailedDlrForMessage(
  messageId: string,
): Promise<{ sms_message_id: string }> {
  const message = await getMessageById(messageId);

  const body: AsmscDlrWebhookBody = {
    uid: message.uid,
    message_id: message.provider_message_id ?? undefined,
    PhoneNumber: message.phonenumber,
    DLRStatus: "Failed",
    SMSID: message.sms_id ?? message.provider_message_id ?? "simulated-failed",
    ClientCost: 1,
    ErrorCode: "500",
    ErrorDescription: "Simulated failure",
    Remarks: "Simulated failed DLR",
  };

  const result = await processAsmscDlrWebhook(body);
  return { sms_message_id: result.sms_message_id ?? message.id };
}

export async function fetchAsmscBalance(): Promise<AsmscApiResponse> {
  assertAsmscCredentials();
  return asmscClient.checkBalance();
}

export function ensureAsmscConfigured(): void {
  try {
    assertAsmscCredentials();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Credenciales aSMSC no configuradas.";
    throw new AppError(message, 503, "ASMSC_NOT_CONFIGURED");
  }
}

function buildSendTestResponse(
  message: SmsMessageRow,
  provider: AsmscApiResponse,
): SendTestResult {
  return {
    internal_message_id: message.id,
    uid: message.uid,
    provider_message_id: message.provider_message_id,
    provider_status: message.provider_status,
    remarks: message.remarks,
    status: message.status,
    provider_response: provider,
  };
}
