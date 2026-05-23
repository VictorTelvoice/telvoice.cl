import { env } from "../config/env.js";
import {
  canShowLiveTestOption,
  isLiveTestGloballyEnabled,
} from "./smsLiveTestPolicy.js";
import { isAsmscConfigured } from "./sms-providers/realApiProvider.js";
import { getLastLiveTestPanelMessage } from "./panelSmsMessageService.js";

export type SmsProviderStatusView = {
  asmscConfigured: boolean;
  providerMode: string;
  providerName: string;
  liveTestEnabled: boolean;
  liveTestActive: boolean;
  lastLiveTestMessage: {
    id: string;
    recipient: string;
    status: string;
    createdAt: string;
    providerMessageId: string | null;
  } | null;
};

export async function getSmsProviderStatusView(): Promise<SmsProviderStatusView> {
  const last = await getLastLiveTestPanelMessage();

  return {
    asmscConfigured: isAsmscConfigured(),
    providerMode: env.smsProvider.mode,
    providerName: env.smsProvider.provider,
    liveTestEnabled: env.smsProvider.liveTestEnabled,
    liveTestActive: isLiveTestGloballyEnabled(),
    lastLiveTestMessage: last
      ? {
          id: last.id,
          recipient: last.recipient_number,
          status: last.status,
          createdAt: last.created_at,
          providerMessageId: last.provider_message_id,
        }
      : null,
  };
}

export function canCompanyUseLiveTestUi(companyId: string): boolean {
  return canShowLiveTestOption(companyId);
}
