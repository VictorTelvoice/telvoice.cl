import {
  getAsmscRemarksHint,
  responseTextIncludesIpWhitelist,
} from "./asmsc-hints.js";

export function maskDispatchPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length <= 6) {
    return "***";
  }
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`;
}

export function maskDispatchApiId(apiId: string | null | undefined): string | null {
  if (!apiId?.trim()) {
    return null;
  }
  const v = apiId.trim();
  if (v.length <= 6) {
    return "***";
  }
  return `${v.slice(0, 4)}…${v.slice(-2)}`;
}

export function extractEndpointHost(baseUrl: string | null | undefined): string | null {
  if (!baseUrl?.trim()) {
    return null;
  }
  try {
    return new URL(baseUrl.replace(/\/$/, "")).host;
  } catch {
    return baseUrl.split("/")[2] ?? baseUrl;
  }
}

export type ProviderDispatchLogInput = {
  providerId: string;
  routeId: string | null;
  queueId: string;
  messageId: string | null;
  campaignId: string | null;
  senderId: string | null;
  phone: string;
  apiIdMasked: string | null;
  endpointHost: string | null;
  attempt: number;
  maxAttempts: number;
  workerSource: string;
  errorCode: string | null;
  errorMessage: string | null;
  remarks?: string | null;
};

export function logProviderDispatchIssue(input: ProviderDispatchLogInput): void {
  const msg = (input.errorMessage ?? input.remarks ?? "").toLowerCase();
  const isIpHint =
    msg.includes("ip not whitelisted") ||
    responseTextIncludesIpWhitelist(input.errorMessage ?? input.remarks);

  const payload: Record<string, unknown> = {
    event: "provider_dispatch_issue",
    provider_id: input.providerId,
    route_id: input.routeId,
    queue_id: input.queueId,
    message_id: input.messageId,
    campaign_id: input.campaignId,
    sender_id: input.senderId,
    phone_masked: maskDispatchPhone(input.phone),
    api_id_masked: input.apiIdMasked,
    endpoint_host: input.endpointHost,
    attempt: input.attempt,
    max_attempts: input.maxAttempts,
    worker_source: input.workerSource,
    error_code: input.errorCode,
    error_message: input.errorMessage ?? input.remarks,
  };

  if (isIpHint) {
    payload.hint =
      getAsmscRemarksHint("IP not Whitelisted") ??
      "Puede ser ráfaga/concurrencia si envíos individuales funcionan.";
  }

  console.warn("[sms-dispatch]", JSON.stringify(payload));
}

/** QA: asegura que no se filtra password en logs sanitizados. */
export function sanitizeLogPayloadForAudit(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const forbidden = ["api_password", "password", "token", "authorization"];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (forbidden.includes(k.toLowerCase())) {
      continue;
    }
    out[k] = v;
  }
  return out;
}
