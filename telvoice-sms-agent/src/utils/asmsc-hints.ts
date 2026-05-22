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
    return "La IP pública del servidor no está autorizada en aSMSC. Agrega la IP en API → Add Whitelist IP.";
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

export const SMS_TYPE_HELP_TEXT =
  "Si aSMSC responde \"Transactional SMS is Not Allowed For Your Account\", usa P o solicita habilitación transaccional al proveedor.";
