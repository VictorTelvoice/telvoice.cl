import type { SmsCampaignRow, PanelSmsMessageRow } from "../types/sms-panel.js";
import type { WalletTransactionRow } from "../types/wallet.js";
import { getSupabase } from "../database/supabaseClient.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { calculateSmsSegments } from "./smsSegmentService.js";
import { listPanelMessagesByCampaign } from "./panelSmsMessageService.js";
import { getSmsDebitForCampaign } from "./walletTransactionService.js";

export type CampaignTimelineStep = {
  title: string;
  detail: string;
  at: string | null;
  state: "done" | "current" | "upcoming";
};

export type CampaignDetailView = {
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

export function buildCampaignTimeline(input: {
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

  const segmentInfo = calculateSmsSegments(campaign.message ?? "");
  const audienceLabels = await resolveAudienceLabel(companyId, meta);

  const estimatedRecipients =
    numMeta(meta, "estimated_recipients") || campaign.valid_recipients;
  const deliveredCount = messages.filter((m) => m.status === "delivered").length;

  return {
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
      walletDebited: walletDebit?.sms_amount ?? 0,
      simulationMode: campaign.mode === "mock" ? "MOCK" : campaign.mode.toUpperCase(),
    },
    timeline: buildCampaignTimeline({ campaign, messages, walletDebit }),
    canSimulate: canSimulateCampaignMock(campaign),
  };
}
