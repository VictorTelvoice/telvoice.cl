import type { SmsProviderRow } from "../types/sms-routing.js";
import { AppError } from "../utils/errors.js";
import { validateRecipientNumber } from "./smsSegmentService.js";
import { createPanelSmsMessage, updatePanelSmsMessage } from "./panelSmsMessageService.js";
import { dispatchProviderSend } from "./smsProviderDispatchService.js";
import { getSmsRouteById } from "./smsRouteService.js";
import { insertPanelDeliveryEvent } from "./panelSmsMessageService.js";
import { calculateSmsSegments } from "./smsSegmentService.js";

const DEMO_COMPANY_ID = "6cd1db92-d5c7-45e0-8548-df8907843350";

export type ProviderTestResult = {
  messageId: string;
  accepted: boolean;
  providerMessageId: string | null;
  status: string;
  rawResponse: Record<string, unknown>;
  errorMessage?: string;
};

/** Prueba técnica superadmin — no descuenta wallet de cliente. */
export async function sendSuperadminProviderTest(input: {
  provider: SmsProviderRow;
  routeId: string;
  to: string;
  senderId: string;
  message: string;
  skipWalletDebit?: boolean;
}): Promise<ProviderTestResult> {
  const phone = validateRecipientNumber(input.to);
  if (!phone.ok || !phone.normalized) {
    throw new AppError(phone.error ?? "Número inválido.", 400);
  }

  const route = await getSmsRouteById(input.routeId);
  if (!route || route.provider_id !== input.provider.id) {
    throw new AppError("Ruta no válida para este proveedor.", 400);
  }

  const segmentInfo = calculateSmsSegments(input.message);
  const senderId =
    input.senderId || input.provider.default_sender_id || "TELVOICE";

  const msg = await createPanelSmsMessage({
    companyId: DEMO_COMPANY_ID,
    recipientNumber: phone.normalized,
    senderId,
    message: input.message,
    segments: segmentInfo.segments || 1,
    costSms: 0,
    status: "queued",
    mode: "live_test",
    provider: input.provider.code,
    metadata: {
      source: "superadmin_provider_test",
      skip_wallet_debit: true,
      route_id: route.id,
    },
  });

  const result = await dispatchProviderSend(input.provider, {
    to: phone.normalized,
    message: input.message,
    senderId,
    metadata: { panel_message_id: msg.id, route_id: route.id },
  });

  if (!result.accepted) {
    await updatePanelSmsMessage(msg.id, {
      status: "failed",
      error_code: result.error_code ?? "REJECTED",
      error_message: result.error_message ?? "Rechazado",
    });
    return {
      messageId: msg.id,
      accepted: false,
      providerMessageId: result.provider_message_id,
      status: "failed",
      rawResponse: result.raw_response,
      errorMessage: result.error_message,
    };
  }

  const status = result.status === "pending" ? "pending" : "sent";
  await updatePanelSmsMessage(msg.id, {
    status,
    provider_message_id: result.provider_message_id,
    route_id: route.id,
    provider_id: input.provider.id,
    sent_at: new Date().toISOString(),
    metadata: {
      source: "superadmin_provider_test",
      asmsc_uid: result.asmsc_uid,
      raw_response: result.raw_response,
    },
  });

  await insertPanelDeliveryEvent({
    companyId: DEMO_COMPANY_ID,
    messageId: msg.id,
    provider: input.provider.code,
    providerMessageId: result.provider_message_id,
    status,
    rawPayload: result.raw_response,
  });

  return {
    messageId: msg.id,
    accepted: true,
    providerMessageId: result.provider_message_id,
    status,
    rawResponse: result.raw_response,
  };
}
