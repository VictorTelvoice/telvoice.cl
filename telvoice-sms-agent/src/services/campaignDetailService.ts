import type { SmsCampaignRow, PanelSmsMessageRow } from "../types/sms-panel.js";
import type { WalletTransactionRow } from "../types/wallet.js";
import { getSupabase } from "../database/supabaseClient.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { calculateSmsSegments } from "./smsSegmentService.js";
import { listPanelMessagesByCampaign } from "./panelSmsMessageService.js";
import {
  getSmsDebitForCampaign,
  sumSmsDebitsForCampaignMessages,
} from "./walletTransactionService.js";
import type { LiveCampaignLaunchStatus } from "./campaignLiveLaunchService.js";
import { getLiveLaunchStatus } from "./campaignLiveLaunchService.js";
import { countQueueByCampaignStatus } from "./smsQueueService.js";

export type CampaignTimelineStep = {
  title: string;
  detail: string;
  at: string | null;
  state: "done" | "current" | "upcoming";
};

export type CampaignDetailViewKind = "mock" | "production";

export type CampaignDetailView = {
  viewKind: CampaignDetailViewKind;
  campaign: SmsCampaignRow;
  messages: PanelSmsMessageRow[];
  walletDebit: WalletTransactionRow | null;
  audience: {
    typeLabel: string;
    sourceLabel: string;
    validCount: number;
    estimatedRecipients: number;
    invalidCount: number;
    blockedCount: number;
    optOutCount: number;
    duplicatesOmitted: number;
  };
  messageInfo: {
    senderId: string;
    text: string;
    encoding: string;
    segmentsPerMessage: number;
    characters: number;
  };
  kpis: {
    estimatedRecipients: number;
    messagesGenerated: number;
    smsConsumed: number;
    deliveredCount: number;
    walletDebited: number;
    simulationMode: string;
  };
  timeline: CampaignTimelineStep[];
  canSimulate: boolean;
  liveLaunch?: LiveCampaignLaunchStatus;
  queueByStatus?: Record<string, number>;
  walletDebitedFromMessages?: number;
};

async function resolveAudienceLabel(
  companyId: string,
  metadata: Record<string, unknown>,
): Promise<{ typeLabel: string; sourceLabel: string }> {
  const audienceType = metadata.audience_type;
  const ref = String(metadata.audience_ref ?? "").trim();

  if (audienceType === "contacts") {
    const count = ref ? ref.split(",").filter(Boolean).length : 0;
    return {
      typeLabel: "Contactos",
      sourceLabel:
        count > 0 ? `${count} contacto(s) seleccionado(s)` : "Contactos",
    };
  }

  if (audienceType === "list" && ref) {
    const { data, error } = await getSupabase()
      .from("contact_lists")
      .select("name")
      .eq("id", ref)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error && !isMissingTableError(error)) {
      wrapSupabaseError(error, "resolveAudienceLabel.list");
    }
    return {
      typeLabel: "Agenda",
      sourceLabel: data?.name ? `Agenda: ${data.name}` : `Agenda (${ref.slice(0, 8)}…)`,
    };
  }

  if (audienceType === "tag" && ref) {
    const { data, error } = await getSupabase()
      .from("contact_tags")
      .select("name")
      .eq("id", ref)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error && !isMissingTableError(error)) {
      wrapSupabaseError(error, "resolveAudienceLabel.tag");
    }
    return {
      typeLabel: "Tag",
      sourceLabel: data?.name ? `Tag: ${data.name}` : `Tag (${ref.slice(0, 8)}…)`,
    };
  }

  return { typeLabel: "Audiencia", sourceLabel: ref || "—" };
}

function numMeta(metadata: Record<string, unknown>, key: string): number {
  const v = metadata[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function messageByStatusFromMessages(
  messages: PanelSmsMessageRow[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of messages) {
    out[m.status] = (out[m.status] ?? 0) + 1;
  }
  return out;
}

/** Envío real (programado/masivo por cola), no simulación mock de contactos. */
export function isCampaignRealSend(campaign: SmsCampaignRow): boolean {
  const meta = campaign.metadata ?? {};
  if (meta.production === true) {
    return true;
  }
  const source = String(meta.source ?? "");
  return (
    meta.execution_mode === "live_campaign" ||
    source === "campaign_live_launch" ||
    source === "app_send_sms_scheduled" ||
    source === "app_send_sms_mass" ||
    source === "app_send_sms_campaign"
  );
}

export function isContactsLiveLaunchCampaign(campaign: SmsCampaignRow): boolean {
  const meta = campaign.metadata ?? {};
  return (
    meta.execution_mode === "live_campaign" ||
    String(meta.source ?? "") === "campaign_live_launch"
  );
}

export function isCampaignMockOnly(campaign: SmsCampaignRow): boolean {
  if (isCampaignRealSend(campaign)) {
    return false;
  }
  return campaign.mode === "mock";
}

function providerTimelineLabel(provider: string | null | undefined): string {
  const code = (provider ?? "").trim().toLowerCase();
  if (code === "asmsc") {
    return "aSMSC";
  }
  if (!code) {
    return "operador";
  }
  return code;
}

function buildMockCampaignTimeline(input: {
  campaign: SmsCampaignRow;
  messages: PanelSmsMessageRow[];
  walletDebit: WalletTransactionRow | null;
}): CampaignTimelineStep[] {
  const meta = input.campaign.metadata ?? {};
  const mockStarted = String(meta.mock_execute_started_at ?? "").trim() || null;
  const mockExecuted = String(meta.mock_executed_at ?? "").trim() || null;
  const messageCount = input.messages.length;
  const debitAt = input.walletDebit?.created_at ?? null;

  const steps: CampaignTimelineStep[] = [
    {
      title: "Borrador creado",
      detail: "Campaña guardada desde contactos (sin envío real).",
      at: input.campaign.created_at,
      state: "done",
    },
  ];

  if (mockStarted || input.campaign.status === "processing") {
    steps.push({
      title: "Simulación iniciada",
      detail: "Procesando destinatarios en modo mock.",
      at: mockStarted,
      state:
        input.campaign.status === "processing" && !mockExecuted
          ? "current"
          : "done",
    });
  }

  if (messageCount > 0) {
    const lastMsg = input.messages.reduce((a, b) =>
      a.created_at > b.created_at ? a : b,
    );
    steps.push({
      title: "Mensajes mock generados",
      detail: `${messageCount} mensaje(s) en panel (provider mock, delivered).`,
      at: lastMsg.created_at,
      state: "done",
    });
  } else if (input.campaign.status === "draft") {
    steps.push({
      title: "Mensajes mock generados",
      detail: "Aún no se ha ejecutado la simulación.",
      at: null,
      state: "upcoming",
    });
  }

  if (input.walletDebit) {
    steps.push({
      title: "Débito wallet registrado",
      detail: `${input.walletDebit.sms_amount} SMS — referencia sms_campaign.`,
      at: debitAt,
      state: "done",
    });
  } else if (input.campaign.status === "draft") {
    steps.push({
      title: "Débito wallet",
      detail: "Se registrará al simular la campaña.",
      at: null,
      state: "upcoming",
    });
  }

  if (
    input.campaign.status === "completed" ||
    input.campaign.status === "failed"
  ) {
    steps.push({
      title:
        input.campaign.status === "completed"
          ? "Campaña completada"
          : "Campaña fallida",
      detail:
        input.campaign.status === "completed"
          ? "Simulación mock finalizada."
          : "No se generaron envíos mock válidos.",
      at: input.campaign.sent_at ?? mockExecuted,
      state: "done",
    });
  } else if (input.campaign.status === "processing") {
    steps.push({
      title: "Campaña en proceso",
      detail: "Esperando finalización de la simulación.",
      at: null,
      state: "current",
    });
  } else {
    steps.push({
      title: "Campaña completada",
      detail: "Pendiente de simulación.",
      at: null,
      state: "upcoming",
    });
  }

  return steps;
}

function buildProductionCampaignTimeline(input: {
  campaign: SmsCampaignRow;
  messages: PanelSmsMessageRow[];
  walletDebit: WalletTransactionRow | null;
  walletDebitedFromMessages?: number;
}): CampaignTimelineStep[] {
  const meta = input.campaign.metadata ?? {};
  const sendMode =
    typeof meta.send_mode === "string" ? meta.send_mode.trim() : "";
  const sendLabel =
    sendMode === "scheduled"
      ? "programado"
      : sendMode === "mass"
        ? "masivo"
        : "real";
  const queued = numMeta(meta, "queued");
  const messageCount = input.messages.length;
  const deliveredCount = input.messages.filter(
    (m) => m.status === "delivered",
  ).length;
  const failedCount = input.messages.filter((m) => m.status === "failed").length;
  const providerLabel = providerTimelineLabel(input.messages[0]?.provider);
  const finalizedAt =
    typeof meta.queue_finalized_at === "string"
      ? meta.queue_finalized_at.trim() || null
      : null;
  const debitAt = input.walletDebit?.created_at ?? null;

  const steps: CampaignTimelineStep[] = [
    {
      title: "Campaña creada",
      detail: `Envío ${sendLabel} registrado en el panel.`,
      at: input.campaign.created_at,
      state: "done",
    },
  ];

  const liveLaunchedAt =
    typeof meta.live_launched_at === "string"
      ? meta.live_launched_at.trim() || null
      : null;

  if (isContactsLiveLaunchCampaign(input.campaign) && liveLaunchedAt) {
    steps.push({
      title: "Campaña enviada a cola",
      detail: "Mensajes live en cola; el worker enviará respetando TPS.",
      at: liveLaunchedAt,
      state: "done",
    });
  } else if (queued > 0 || meta.bulk_queue === true) {
    steps.push({
      title: "Destinatarios encolados",
      detail: `${queued || messageCount} destinatario(s) en cola de envío.`,
      at: input.campaign.created_at,
      state: "done",
    });
  }

  if (
    isContactsLiveLaunchCampaign(input.campaign) &&
    messageCount > 0 &&
    (messageByStatusFromMessages(input.messages).queued ?? 0) > 0
  ) {
    steps.push({
      title: "Mensajes en cola",
      detail: `${messageByStatusFromMessages(input.messages).queued ?? 0} mensaje(s) queued en panel.`,
      at: liveLaunchedAt,
      state: input.campaign.status === "processing" ? "current" : "done",
    });
  }

  if (messageCount > 0) {
    const lastMsg = input.messages.reduce((a, b) =>
      a.created_at > b.created_at ? a : b,
    );
    const failNote =
      failedCount > 0 ? ` · ${failedCount} fallido(s)` : "";
    steps.push({
      title: "Mensajes enviados",
      detail: `${messageCount} envío(s) · ${deliveredCount} entregado(s) vía ${providerLabel}${failNote}.`,
      at: lastMsg.created_at,
      state: input.campaign.status === "processing" ? "current" : "done",
    });
  } else if (input.campaign.status === "processing") {
    steps.push({
      title: "Mensajes en envío",
      detail: "Procesando destinatarios en cola.",
      at: null,
      state: "current",
    });
  }

  if (input.walletDebit) {
    steps.push({
      title: "Débito wallet registrado",
      detail: `${input.walletDebit.sms_amount} SMS — referencia sms_campaign.`,
      at: debitAt,
      state: "done",
    });
  } else if (
    isContactsLiveLaunchCampaign(input.campaign) &&
    (input.walletDebitedFromMessages ?? 0) > 0
  ) {
    steps.push({
      title: "Débitos por mensajes aceptados",
      detail: `${input.walletDebitedFromMessages} SMS — referencia sms_message (cola).`,
      at: null,
      state: input.campaign.status === "processing" ? "current" : "done",
    });
  }

  if (
    input.campaign.status === "sent" ||
    input.campaign.status === "completed"
  ) {
    steps.push({
      title: "Campaña completada",
      detail:
        messageCount > 0
          ? `Envío finalizado · ${deliveredCount}/${messageCount} entregados.`
          : "Envío finalizado.",
      at: input.campaign.sent_at ?? finalizedAt,
      state: "done",
    });
  } else if (input.campaign.status === "failed") {
    steps.push({
      title: "Campaña fallida",
      detail:
        failedCount > 0
          ? `${failedCount} mensaje(s) rechazado(s) por el operador.`
          : "No se completó el envío.",
      at: input.campaign.sent_at ?? finalizedAt,
      state: "done",
    });
  } else if (input.campaign.status === "processing") {
    steps.push({
      title: "Campaña en proceso",
      detail: "Esperando finalización de la cola de envío.",
      at: null,
      state: "current",
    });
  }

  return steps;
}

export function buildCampaignTimeline(input: {
  campaign: SmsCampaignRow;
  messages: PanelSmsMessageRow[];
  walletDebit: WalletTransactionRow | null;
  walletDebitedFromMessages?: number;
}): CampaignTimelineStep[] {
  if (isCampaignRealSend(input.campaign)) {
    return buildProductionCampaignTimeline(input);
  }
  return buildMockCampaignTimeline(input);
}

export function canSimulateCampaignMock(campaign: SmsCampaignRow): boolean {
  if (campaign.status !== "draft" || campaign.mode !== "mock") {
    return false;
  }
  const meta = campaign.metadata ?? {};
  return meta.source === "contacts_audience";
}

export async function loadCampaignDetailView(
  companyId: string,
  campaign: SmsCampaignRow,
): Promise<CampaignDetailView> {
  const meta = campaign.metadata ?? {};
  const messages = await listPanelMessagesByCampaign(campaign.id, 500);
  const walletDebit = await getSmsDebitForCampaign(campaign.id, companyId);
  const walletDebitedFromMessages = await sumSmsDebitsForCampaignMessages(
    campaign.id,
    companyId,
  );
  const queueByStatus = await countQueueByCampaignStatus(campaign.id);
  const liveLaunch = await getLiveLaunchStatus(companyId, campaign.id);

  const segmentInfo = calculateSmsSegments(campaign.message ?? "");
  const audienceLabels = await resolveAudienceLabel(companyId, meta);

  const estimatedRecipients =
    numMeta(meta, "estimated_recipients") || campaign.valid_recipients;
  const deliveredCount = messages.filter((m) => m.status === "delivered").length;
  const viewKind: CampaignDetailViewKind = isCampaignRealSend(campaign)
    ? "production"
    : "mock";
  const sendMode =
    typeof meta.send_mode === "string" ? meta.send_mode.trim() : "";
  const modeKpi =
    viewKind === "production"
      ? isContactsLiveLaunchCampaign(campaign)
        ? "LIVE"
        : sendMode === "scheduled"
          ? "PROGRAMADO"
          : sendMode === "mass"
            ? "MASIVA"
            : "PRODUCCIÓN"
      : campaign.mode === "mock"
        ? "MOCK"
        : campaign.mode.toUpperCase();

  return {
    viewKind,
    campaign,
    messages,
    walletDebit,
    audience: {
      typeLabel: audienceLabels.typeLabel,
      sourceLabel: audienceLabels.sourceLabel,
      validCount: campaign.valid_recipients,
      estimatedRecipients,
      invalidCount: campaign.invalid_recipients,
      blockedCount: numMeta(meta, "blocked_count"),
      optOutCount: numMeta(meta, "opt_out_count"),
      duplicatesOmitted: numMeta(meta, "duplicates_omitted"),
    },
    messageInfo: {
      senderId: campaign.sender_id ?? "—",
      text: campaign.message,
      encoding:
        typeof meta.encoding === "string"
          ? meta.encoding
          : segmentInfo.encoding,
      segmentsPerMessage:
        numMeta(meta, "segments_per_message") || segmentInfo.segments,
      characters: segmentInfo.characters,
    },
    kpis: {
      estimatedRecipients,
      messagesGenerated: messages.length,
      smsConsumed: campaign.real_sms_cost,
      deliveredCount,
      walletDebited: walletDebit?.sms_amount ?? walletDebitedFromMessages,
      simulationMode: modeKpi,
    },
    timeline: buildCampaignTimeline({
      campaign,
      messages,
      walletDebit,
      walletDebitedFromMessages,
    }),
    canSimulate: canSimulateCampaignMock(campaign),
    liveLaunch,
    queueByStatus,
    walletDebitedFromMessages,
  };
}
