import { env, type SmsProviderConfig } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { validateRecipientNumber } from "./smsSegmentService.js";
import { isAsmscConfigured } from "./sms-providers/realApiProvider.js";

export function getSmsProviderConfig(): SmsProviderConfig {
  return env.smsProvider;
}

export function isLiveTestGloballyEnabled(): boolean {
  const cfg = env.smsProvider;
  return (
    cfg.liveTestEnabled &&
    cfg.mode === "live_test" &&
    isAsmscConfigured()
  );
}

export function isCompanyAllowedForLiveTest(companyId: string): boolean {
  const allowed = env.smsProvider.liveTestAllowedCompanyIds;
  if (allowed.length === 0) {
    return true;
  }
  return allowed.includes(companyId);
}

export function isNumberAllowedForLiveTest(normalizedPhone: string): boolean {
  const allowed = env.smsProvider.liveTestAllowedNumbers;
  if (allowed.length === 0) {
    return true;
  }
  const digits = normalizedPhone.replace(/[^\d+]/g, "");
  return allowed.some((n) => {
    const a = n.replace(/[^\d+]/g, "");
    return a === digits || a === digits.replace(/^\+/, "");
  });
}

export function canShowLiveTestOption(companyId: string): boolean {
  if (!isLiveTestGloballyEnabled()) {
    return false;
  }
  return isCompanyAllowedForLiveTest(companyId);
}

export function assertLiveTestSendAllowed(input: {
  companyId: string;
  to: string;
}): string {
  if (!env.smsProvider.liveTestEnabled) {
    throw new AppError(
      "Envío real controlado deshabilitado (SMS_LIVE_TEST_ENABLED=false).",
      403,
    );
  }

  if (env.smsProvider.mode !== "live_test") {
    throw new AppError(
      "Modo proveedor no es live_test (SMS_PROVIDER_MODE debe ser live_test).",
      403,
    );
  }

  if (!isAsmscConfigured()) {
    throw new AppError(
      "API aSMSC no configurada; no se puede enviar en modo live_test.",
      503,
    );
  }

  if (!isCompanyAllowedForLiveTest(input.companyId)) {
    throw new AppError(
      "Esta empresa no está autorizada para envío real controlado.",
      403,
    );
  }

  const phone = validateRecipientNumber(input.to);
  if (!phone.ok || !phone.normalized) {
    throw new AppError(phone.error ?? "Número inválido.", 400);
  }

  if (!isNumberAllowedForLiveTest(phone.normalized)) {
    throw new AppError(
      "Este número no está en la lista permitida para live_test.",
      403,
    );
  }

  return phone.normalized;
}
