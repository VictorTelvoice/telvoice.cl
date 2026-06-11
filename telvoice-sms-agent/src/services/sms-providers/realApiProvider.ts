import axios, { isAxiosError } from "axios";
import { buildDlrCallbackUrl, env } from "../../config/env.js";
import { asmscClient } from "../../providers/asmsc/index.js";
import type { SendSmsRequest } from "../../types/asmsc.js";
import { parseSendSmsResponse } from "../../utils/asmsc-response.js";
import { assertDlrWebhookSafeForLiveTraffic } from "../../utils/dlr-callback.js";
import { AsmscApiError } from "../../utils/errors.js";
import { generateSmsUid } from "../../utils/uid.js";
import type { HttpApiProviderCredentials } from "../providerCredentialsService.js";
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

function credentialsFromInput(
  input: SmsProviderSendInput,
): HttpApiProviderCredentials | null {
  const raw = input.metadata?.http_api_credentials;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const c = raw as Record<string, unknown>;
  if (typeof c.apiId !== "string" || typeof c.apiPassword !== "string") {
    return null;
  }
  return {
    envPrefix: String(c.envPrefix ?? "ASMSC"),
    baseUrl: String(c.baseUrl ?? "").replace(/\/$/, ""),
    apiId: c.apiId,
    apiPassword: c.apiPassword,
    defaultSenderId: String(c.defaultSenderId ?? "TELVOICE"),
    defaultSmsType: c.defaultSmsType === "T" ? "T" : "P",
  };
}

async function postSendSms(
  creds: HttpApiProviderCredentials,
  request: SendSmsRequest,
): Promise<Record<string, unknown>> {
  const payload = {
    api_id: creds.apiId,
    api_password: creds.apiPassword,
    sms_type: request.sms_type ?? creds.defaultSmsType,
    encoding: request.encoding ?? "T",
    sender_id: request.sender_id?.trim() || creds.defaultSenderId || "TELVOICE",
    phonenumber: request.phonenumber,
    templateid: request.templateid ?? request.template_id ?? "",
    textmessage: request.textmessage,
    V1: request.V1 ?? "",
    V2: request.V2 ?? "",
    V3: request.V3 ?? "",
    V4: request.V4 ?? "",
    V5: request.V5 ?? "",
    ValidityPeriodInSeconds: request.ValidityPeriodInSeconds,
    uid: request.uid ?? "",
    callback_url: request.callback_url ?? "",
    pe_id: request.pe_id ?? "",
    template_id: request.template_id ?? request.templateid ?? "",
  };

  try {
    const response = await axios.post(`${creds.baseUrl}/SendSMS`, payload, {
      timeout: 30_000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    return response.data as Record<string, unknown>;
  } catch (error) {
    if (isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      const message =
        typeof data === "object" && data !== null && "message" in data
          ? String((data as Record<string, unknown>).message)
          : error.message;
      throw new AsmscApiError(
        `Error al llamar API SMS: ${message}`,
        data ?? { status, message: error.message },
        status && status >= 400 && status < 500 ? status : 502,
      );
    }
    throw new AsmscApiError(
      "Error inesperado al llamar API SMS",
      error,
    );
  }
}

export async function sendMessageRealApi(
  input: SmsProviderSendInput,
): Promise<SmsProviderSendResult> {
  const creds = credentialsFromInput(input);
  const providerCode = String(input.metadata?.provider_code ?? "asmsc");

  if (creds && (!creds.apiId || !creds.apiPassword)) {
    return {
      provider: providerCode,
      provider_message_id: null,
      status: "failed",
      raw_response: {},
      accepted: false,
      error_code: "PROVIDER_NOT_CONFIGURED",
      error_message: `Credenciales ${creds.envPrefix}_API_ID / ${creds.envPrefix}_API_PASSWORD no configuradas.`,
    };
  }

  const uid = generateSmsUid();
  assertDlrWebhookSafeForLiveTraffic();
  const callbackUrl = buildDlrCallbackUrl();
  const phonenumber = phoneToAsmscDigits(input.to);
  const senderId =
    input.senderId ||
    creds?.defaultSenderId ||
    input.metadata?.fallbackSenderId?.toString() ||
    "TELVOICE";

  const request: SendSmsRequest = {
    phonenumber,
    textmessage: input.message,
    sender_id: senderId,
    sms_type: creds?.defaultSmsType ?? "P",
    encoding: "T",
    uid,
    callback_url: callbackUrl,
  };

  try {
    const response = creds
      ? await postSendSms(creds, request)
      : await asmscClient.sendSms(request);
    const parsed = parseSendSmsResponse(response);
    const accepted = parsed.provider_status?.toUpperCase() === "S";

    const raw = sanitizeProviderResponse({
      ...response,
      _agent: {
        callback_url: callbackUrl ?? null,
        asmsc_uid: uid,
        env_prefix: creds?.envPrefix ?? "ASMSC",
      },
    });

    if (!accepted) {
      return {
        provider: providerCode,
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
      provider: providerCode,
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
      provider: providerCode,
      provider_message_id: null,
      status: "failed",
      raw_response: raw,
      accepted: false,
      error_code: "HTTP_ERROR",
      error_message:
        error instanceof Error ? error.message : "Error al llamar API SMS",
      asmsc_uid: uid,
    };
  }
}
