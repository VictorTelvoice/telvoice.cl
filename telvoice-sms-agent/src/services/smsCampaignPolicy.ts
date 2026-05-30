import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import {
  isNumberAllowedForLiveTest,
  isPanelNumberWhitelistEnforced,
  resolveCompanyLiveSendAuthorized,
} from "./smsLiveTestPolicy.js";
import { isAsmscConfigured } from "./sms-providers/realApiProvider.js";
import { validateRecipientNumber } from "./smsSegmentService.js";

/** Origen de envíos masivos desde panel /app (campaña por cola). */
export const APP_CAMPAIGN_SEND_SOURCE = "app_send_sms_campaign";

export function isCampaignDispatchEnabled(): boolean {
  return (
    env.smsCampaign.enabled &&
    env.smsProvider.liveTestEnabled &&
    isAsmscConfigured()
  );
}

export function assertCampaignDispatchEnabled(): void {
  if (!isCampaignDispatchEnabled()) {
    throw new AppError(
      "Las campañas masivas no están habilitadas en este entorno.",
      503,
    );
  }
}

/** Valida destinatario de campaña (sin pacing entre envíos). */
export async function assertCampaignRecipientAllowed(input: {
  companyId: string;
  to: string;
}): Promise<string> {
  assertCampaignDispatchEnabled();

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

  if (
    isPanelNumberWhitelistEnforced() &&
    !isNumberAllowedForLiveTest(phone.normalized)
  ) {
    throw new AppError(
      "El número destino no está autorizado para envío SMS.",
      403,
    );
  }

  return phone.normalized;
}
