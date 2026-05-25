import {
  findVerifyNumberById,
  getRegisteredVerifyNumbers,
  maskVerifyPhone,
  type VerifyNumberEntry,
} from "../config/verifyNumbers.js";
import { buildDlrCallbackUrl, buildTelsimWebhookUrl } from "../config/env.js";
import type { PanelSmsMessageRow } from "../types/sms-panel.js";
import { getConfiguredDlrWebhookUrl } from "../utils/dlr-callback.js";
import { formatDate } from "../utils/html.js";
import { listPanelMessagesByCompany } from "./panelSmsMessageService.js";
import {
  getLiveTestSendPageStatus,
  type LiveTestSendPageStatus,
} from "./smsLiveTestLimiterService.js";
import { isAsmscConfigured } from "./sms-providers/realApiProvider.js";
import { getTelsimPreviewForSlot } from "./telsimWebhookService.js";

export type VerifyNumberStatus = {
  entry: VerifyNumberEntry;
  maskedPhone: string;
  lastTest: PanelSmsMessageRow | null;
  lastStatus: string;
  lastTestAt: string | null;
  dlrReceived: boolean;
  readyForCampaign: boolean;
  lastTelsimInbound: {
    content: string;
    verificationCode: string | null;
    receivedAt: string;
  } | null;
};

export type PreCampaignCheckItem = {
  id: string;
  label: string;
  ok: boolean;
  hint?: string;
};

export type SendControlPanelView = {
  sendStatus: LiveTestSendPageStatus;
  verifyNumbers: VerifyNumberStatus[];
  webhookUrl: string;
  webhookConfigured: boolean;
  providerConfigured: boolean;
  checklist: PreCampaignCheckItem[];
  allVerifyNumbersReady: boolean;
  defaultVerifyMessage: string;
  telsimWebhookUrl: string;
  telsimWebhookConfigured: boolean;
};

function normalizeDigits(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function findLastMessageToNumber(
  messages: PanelSmsMessageRow[],
  phone: string,
): PanelSmsMessageRow | null {
  const target = normalizeDigits(phone);
  return (
    messages.find((m) => normalizeDigits(m.recipient_number) === target) ?? null
  );
}

function isVerifyMessageReady(msg: PanelSmsMessageRow | null): boolean {
  if (!msg) {
    return false;
  }
  if (msg.status === "delivered") {
    return true;
  }
  if (msg.status === "sent" && msg.sent_at) {
    const ageMs = Date.now() - new Date(msg.sent_at).getTime();
    return ageMs < 15 * 60 * 1000;
  }
  return false;
}

export function buildDefaultVerifyMessage(label?: string): string {
  const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
  const tag = label ? ` ${label}` : "";
  return `[Telvoice QA${tag}] Verificacion pre-campana ${ts}. Confirme recepcion en telsim.`;
}

export async function getSendControlPanelView(
  companyId: string,
): Promise<SendControlPanelView> {
  const sendStatus = await getLiveTestSendPageStatus(companyId);
  const verifyEntries = getRegisteredVerifyNumbers();
  const recentMessages = await listPanelMessagesByCompany(companyId, 80);
  const verifyMessages = recentMessages.filter((m) => {
    const src = m.metadata?.source;
    return (
      src === "app_send_sms_verify_test" ||
      verifyEntries.some(
        (e) =>
          normalizeDigits(e.phone) === normalizeDigits(m.recipient_number),
      )
    );
  });

  const verifyNumbers: VerifyNumberStatus[] = await Promise.all(
    verifyEntries.map(async (entry) => {
      const lastTest = findLastMessageToNumber(verifyMessages, entry.phone);
      const dlrReceived = lastTest?.status === "delivered";
      const lastTelsimInbound = entry.slotId
        ? await getTelsimPreviewForSlot(entry.slotId)
        : null;
      const readyFromTelsim =
        lastTelsimInbound != null &&
        (lastTelsimInbound.verificationCode != null ||
          lastTelsimInbound.content.length > 0);
      return {
        entry,
        maskedPhone: maskVerifyPhone(entry.phone),
        lastTest,
        lastStatus: lastTest?.status ?? "—",
        lastTestAt: lastTest?.created_at ?? null,
        dlrReceived,
        lastTelsimInbound,
        readyForCampaign:
          isVerifyMessageReady(lastTest) || readyFromTelsim,
      };
    }),
  );

  const webhookUrl = getConfiguredDlrWebhookUrl();
  const webhookConfigured = Boolean(buildDlrCallbackUrl());
  const providerConfigured = isAsmscConfigured();

  const checklist: PreCampaignCheckItem[] = [
    {
      id: "provider",
      label: "Proveedor SMS configurado",
      ok: providerConfigured,
      hint: providerConfigured ? undefined : "ASMSC_API_ID / ASMSC_API_PASSWORD",
    },
    {
      id: "webhook",
      label: "Webhook DLR activo",
      ok: webhookConfigured,
      hint: webhookConfigured ? webhookUrl : "PUBLIC_WEBHOOK_BASE_URL",
    },
    {
      id: "telsim_webhook",
      label: "Webhook telsim.io (SMS entrantes)",
      ok: Boolean(buildTelsimWebhookUrl()),
      hint: buildTelsimWebhookUrl() ?? "PUBLIC_WEBHOOK_BASE_URL",
    },
    {
      id: "route",
      label: "Ruta SMS disponible",
      ok: sendStatus.routeActive && sendStatus.providerActive,
    },
    {
      id: "live",
      label: "Envío habilitado en cuenta",
      ok: sendStatus.liveEnabledOnPlan,
    },
    {
      id: "balance",
      label: "Cuota diaria disponible",
      ok:
        sendStatus.dailyRemaining > 0 &&
        (sendStatus.trafficDailyRemaining == null ||
          sendStatus.trafficDailyRemaining > 0),
    },
  ];

  if (verifyNumbers.length > 0) {
    checklist.push({
      id: "verify",
      label: "Números telsim verificados",
      ok: verifyNumbers.every((v) => v.readyForCampaign),
      hint: "Envíe test QA a cada línea antes de la campaña",
    });
  }

  const allVerifyNumbersReady =
    verifyNumbers.length === 0 ||
    verifyNumbers.every((v) => v.readyForCampaign);

  return {
    sendStatus,
    verifyNumbers,
    webhookUrl,
    webhookConfigured,
    providerConfigured,
    checklist,
    allVerifyNumbersReady,
    defaultVerifyMessage: buildDefaultVerifyMessage(),
    telsimWebhookUrl: buildTelsimWebhookUrl() ?? "(no configurada)",
    telsimWebhookConfigured: Boolean(buildTelsimWebhookUrl()),
  };
}

export function resolveVerifyTestSend(input: {
  verifyId?: string;
  to?: string;
  message?: string;
}): { to: string; message: string; label: string } | null {
  if (input.verifyId) {
    const entry = findVerifyNumberById(input.verifyId);
    if (!entry) {
      return null;
    }
    return {
      to: entry.phone,
      message:
        input.message?.trim() || buildDefaultVerifyMessage(entry.label),
      label: entry.label,
    };
  }
  if (input.to?.trim()) {
    return {
      to: input.to.trim(),
      message: input.message?.trim() || buildDefaultVerifyMessage(),
      label: "manual",
    };
  }
  return null;
}

export function formatVerifyLastTest(at: string | null): string {
  if (!at) {
    return "Sin test reciente";
  }
  return formatDate(at);
}
