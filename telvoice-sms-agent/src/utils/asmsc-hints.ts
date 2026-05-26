const TRANSACTIONAL_BLOCKED =
  "transactional sms is not allowed for your account";
const IP_NOT_WHITELISTED = "ip not whitelisted";

export function normalizeRemarksText(remarks: string | null | undefined): string {
  return (remarks ?? "").trim();
}

export function isProviderStatusFailed(
  providerStatus: string | null | undefined,
): boolean {
  return providerStatus?.trim().toUpperCase() === "F";
}

export function getAsmscRemarksHint(remarks: string | null | undefined): string | null {
  const text = normalizeRemarksText(remarks).toLowerCase();
  if (!text) {
    return null;
  }

  if (text.includes(TRANSACTIONAL_BLOCKED)) {
    return "La cuenta API no tiene habilitado tráfico transaccional. Prueba con sms_type P o solicita habilitación T en aSMSC.";
  }

  if (text.includes(IP_NOT_WHITELISTED)) {
    return (
      "aSMSC respondió «IP not Whitelisted». Si el envío individual en /app funciona con la misma API, " +
      "la IP suele estar bien y el mensaje puede ser engañoso (p. ej. varios SendSMS en paralelo en campañas). " +
      "Reintenta la campaña o confirma whitelist en aSMSC → Add Whitelist IP."
    );
  }

  return null;
}

export function responseTextIncludesIpWhitelist(
  value: string | Record<string, unknown> | null | undefined,
): boolean {
  const text =
    typeof value === "string"
      ? value
      : JSON.stringify(value ?? {}).toLowerCase();
  return text.toLowerCase().includes(IP_NOT_WHITELISTED);
}

export function isIpWhitelistProviderError(
  errorMessage: string | null | undefined,
  rawResponse?: Record<string, unknown> | string | null,
): boolean {
  if (responseTextIncludesIpWhitelist(errorMessage)) {
    return true;
  }
  if (rawResponse != null) {
    return responseTextIncludesIpWhitelist(rawResponse);
  }
  return false;
}

export const IP_WHITELIST_FAIL_FAST_PANEL_METADATA = {
  provider_hint: "aSMSC whitelist/rate/concurrency rejection",
  retry_policy: "fail_fast_ip_whitelist",
} as const;

export const SMS_TYPE_HELP_TEXT =
  "Si aSMSC responde \"Transactional SMS is Not Allowed For Your Account\", usa P o solicita habilitación transaccional al proveedor.";
