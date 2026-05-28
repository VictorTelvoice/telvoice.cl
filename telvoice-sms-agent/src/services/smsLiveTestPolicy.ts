import { env, type SmsProviderConfig } from "../config/env.js";
import { isRegisteredVerifyNumber } from "../config/verifyNumbers.js";
import { AppError } from "../utils/errors.js";
import { isCompanyAuthorizedForPanelSmsSend } from "./commercialSmsAuthorizationService.js";
import { validateRecipientNumber } from "./smsSegmentService.js";
import { isAsmscConfigured } from "./sms-providers/realApiProvider.js";

export function getSmsProviderConfig(): SmsProviderConfig {
  return env.smsProvider;
}

/** Envío real habilitado globalmente (credenciales + flag). */
export function isLiveTestGloballyEnabled(): boolean {
  const cfg = env.smsProvider;
  return cfg.liveTestEnabled && isAsmscConfigured();
}

/** @deprecated Usar isCompanyAuthorizedForPanelSmsSend (async) para reglas completas. */
export function isCompanyAllowedForLiveTest(companyId: string): boolean {
  const allowed = env.smsProvider.liveTestAllowedCompanyIds;
  if (allowed.length === 0) {
    return true;
  }
  return allowed.includes(companyId);
}

export async function resolveCompanyLiveSendAuthorized(
  companyId: string,
): Promise<boolean> {
  return isCompanyAuthorizedForPanelSmsSend(companyId);
}

export function isNumberAllowedForLiveTest(normalizedPhone: string): boolean {
  if (isRegisteredVerifyNumber(normalizedPhone)) {
    return true;
  }
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

export function canShowLiveTestOption(_companyId: string): boolean {
  return isLiveTestGloballyEnabled();
}

export async function assertLiveTestSendAllowed(input: {
  companyId: string;
  to: string;
}): Promise<string> {
  if (!env.smsProvider.liveTestEnabled) {
    throw new AppError(
      "El envío SMS no está habilitado en este entorno.",
      403,
    );
  }

  if (!isAsmscConfigured()) {
    throw new AppError("Proveedor SMS no disponible.", 503);
  }

  if (!(await resolveCompanyLiveSendAuthorized(input.companyId))) {
    throw new AppError(
      "La empresa no está autorizada para envío SMS.",
      403,
    );
  }

  const phone = validateRecipientNumber(input.to);
  if (!phone.ok || !phone.normalized) {
    throw new AppError(phone.error ?? "Número inválido.", 400);
  }

  if (!isNumberAllowedForLiveTest(phone.normalized)) {
    throw new AppError(
      "El número destino no está autorizado para envío SMS.",
      403,
    );
  }

  return phone.normalized;
}
