import { assertAsmscCredentials, buildDlrCallbackUrl, env } from "../../config/env.js";
import { asmscClient } from "../../providers/asmsc/index.js";
import type { SendSmsRequest } from "../../types/asmsc.js";
import { parseSendSmsResponse } from "../../utils/asmsc-response.js";
import { AsmscApiError } from "../../utils/errors.js";
import { generateSmsUid } from "../../utils/uid.js";
import { sanitizeProviderResponse } from "./sanitize.js";
import type { SmsProviderSendInput, SmsProviderSendResult } from "./types.js";

/** Convierte +569XXXXXXXX a 569XXXXXXXX (formato aSMSC). */
export function phoneToAsmscDigits(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("56") && digits.length >= 11) {
    return digits;
  }
  if (digits.startsWith("9") && digits.length === 9) {
    return `56${digits}`;
  }
  return digits;
}

export function isAsmscConfigured(): boolean {
  return Boolean(env.asmsc.apiId && env.asmsc.apiPassword);
}

export async function sendMessageRealApi(
  input: SmsProviderSendInput,
): Promise<SmsProviderSendResult> {
  if (!isAsmscConfigured()) {
    return {
      provider: "asmsc",
      provider_message_id: null,
      status: "failed",
      raw_response: {},
      accepted: false,
      error_code: "ASMSC_NOT_CONFIGURED",
      error_message: "Credenciales aSMSC no configuradas en el servidor.",
    };
  }

  assertAsmscCredentials();

  const uid = generateSmsUid();
  const callbackUrl = buildDlrCallbackUrl();
  const phonenumber = phoneToAsmscDigits(input.to);

  const request: SendSmsRequest = {
    phonenumber,
    textmessage: input.message,
    sender_id: input.senderId || env.asmsc.defaultSenderId,
    sms_type: env.asmsc.defaultSmsType,
    encoding: "T",
    uid,
    callback_url: callbackUrl,
  };

  try {
    const response = await asmscClient.sendSms(request);
    const parsed = parseSendSmsResponse(response);
    const accepted = parsed.provider_status?.toUpperCase() === "S";

    const raw = sanitizeProviderResponse({
      ...response,
      _agent: {
        callback_url: callbackUrl ?? null,
        asmsc_uid: uid,
      },
    });

    if (!accepted) {
      return {
        provider: "asmsc",
        provider_message_id: parsed.provider_message_id,
        status: "failed",
        raw_response: raw,
        accepted: false,
        error_code: parsed.provider_status ?? "REJECTED",
        error_message: parsed.remarks ?? "Proveedor rechazó el envío.",
        asmsc_uid: uid,
      };
    }

    return {
      provider: "asmsc",
      provider_message_id: parsed.provider_message_id,
      status: "sent",
      raw_response: raw,
      accepted: true,
      asmsc_uid: uid,
    };
  } catch (error) {
    const providerResponse =
      error instanceof AsmscApiError ? error.providerResponse : undefined;
    const raw = sanitizeProviderResponse(
      typeof providerResponse === "object" && providerResponse !== null
        ? (providerResponse as Record<string, unknown>)
        : { message: error instanceof Error ? error.message : "Error HTTP" },
    );

    return {
      provider: "asmsc",
      provider_message_id: null,
      status: "failed",
      raw_response: raw,
      accepted: false,
      error_code: "HTTP_ERROR",
      error_message:
        error instanceof Error ? error.message : "Error al llamar API aSMSC",
      asmsc_uid: uid,
    };
  }
}
