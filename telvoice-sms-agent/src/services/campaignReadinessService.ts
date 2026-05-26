import type { SmsCampaignRow } from "../types/sms-panel.js";
import { MAX_CLIENT_TPS } from "../constants/sms-traffic.js";
import { AppError } from "../utils/errors.js";
import {
  parseAudienceSourceFromCampaignMetadata,
  resolveCampaignAudience,
  validateCampaignAudience,
} from "./campaignAudienceService.js";
import { getCompanyRatePlan } from "./companyRatePlanService.js";
import { findCompanyById } from "./companyService.js";
import { getCampaignByIdForCompany } from "./smsCampaignService.js";
import { calculateSmsSegments } from "./smsSegmentService.js";
import { resolveRouteForMessage } from "./smsRoutingService.js";
import { getSmsRouteById } from "./smsRouteService.js";
import { getSmsRatePlanById, listRatePlanDetails } from "./smsRatePlanService.js";
import { getSmsProviderById } from "./smsProviderService.js";
import { companyRoutingPolicyFromAssignment } from "./smsRouteSelectionService.js";
import { getCompanyBalance, getOrCreateCompanyWallet } from "./smsWalletService.js";
import { resolveTrafficPolicy } from "./smsTrafficPolicyService.js";

const CAMPAIGN_TRAFFIC_TYPE = "promotional";
const CAMPAIGN_COUNTRY = "CL";

export type CampaignReadinessLabel = "not_enabled" | "ready" | "blocked";

export type CampaignLiveReadinessResult = {
  canGoLive: boolean;
  blockedReasons: string[];
  warnings: string[];
  effectiveTps: number | null;
  providerStatus: string;
  routeStatus: string;
  balanceStatus: string;
  estimatedCost: number;
  requiredSms: number;
  availableSms: number;
  readinessLabel: CampaignReadinessLabel;
  liveEnabled: boolean;
  campaignsEnabled: boolean;
  clientMaxTps: number | null;
  ratePlanLabel: string;
  routeLabel: string;
  providerLabel: string;
  dailyLimit: number | null;
  monthlyLimit: number | null;
};

export type CampaignTrafficReadinessResult = {
  effectiveTps: number | null;
  liveEnabled: boolean;
  campaignsEnabled: boolean;
  clientMaxTps: number | null;
  providerStatus: string;
  routeStatus: string;
  ratePlanLabel: string;
  routeLabel: string;
  providerLabel: string;
  balanceStatus: string;
  availableSms: number;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  blockedReasons: string[];
  warnings: string[];
};

function parseSenderAllowList(
  metadata: Record<string, unknown> | undefined,
): string[] | null {
  const raw =
    metadata?.allowed_sender_ids ??
    metadata?.allowed_senders ??
    metadata?.permitted_senders;
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  return raw.map((v) => String(v).trim().toUpperCase()).filter(Boolean);
}

function deriveReadinessLabel(input: {
  liveEnabled: boolean;
  campaignsEnabled: boolean;
  blockedReasons: string[];
}): CampaignReadinessLabel {
  if (!input.liveEnabled || !input.campaignsEnabled) {
    return "not_enabled";
  }
  if (input.blockedReasons.length > 0) {
    return "blocked";
  }
  return "ready";
}

function isCampaignStatusEligible(status: string): boolean {
  return status === "draft" || status === "completed";
}

function numMeta(metadata: Record<string, unknown>, key: string): number {
  const v = metadata[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

async function resolveRoutingContext(companyId: string): Promise<{
  routeId: string | null;
  providerId: string | null;
  ratePlanId: string | null;
  routeLabel: string;
  providerLabel: string;
  ratePlanLabel: string;
  providerStatus: string;
  routeStatus: string;
  routeError: string | null;
}> {
  let routeId: string | null = null;
  let providerId: string | null = null;
  let ratePlanId: string | null = null;
  let routeLabel = "—";
  let providerLabel = "—";
  let ratePlanLabel = "—";
  let providerStatus = "—";
  let routeStatus = "—";
  let routeError: string | null = null;

  try {
    const resolved = await resolveRouteForMessage({
      companyId,
      country: CAMPAIGN_COUNTRY,
      trafficType: CAMPAIGN_TRAFFIC_TYPE,
    });
    routeId = resolved.route.id;
    providerId = resolved.provider.id;
    ratePlanId = resolved.ratePlan.id;
    routeLabel = resolved.route.name;
    providerLabel = resolved.provider.name;
    ratePlanLabel = resolved.ratePlan.name;
    providerStatus = resolved.provider.status;
    routeStatus = resolved.route.status;
  } catch (err) {
    routeError =
      err instanceof AppError
        ? err.message
        : err instanceof Error
          ? err.message
          : "No se pudo resolver la ruta SMS.";

    const assignment = await getCompanyRatePlan(
      companyId,
      CAMPAIGN_COUNTRY,
      CAMPAIGN_TRAFFIC_TYPE,
    );
    if (assignment?.rate_plan_id) {
      ratePlanId = assignment.rate_plan_id;
      const plan = await getSmsRatePlanById(assignment.rate_plan_id);
      if (plan) {
        ratePlanLabel = plan.name;
      }
      const details = await listRatePlanDetails(assignment.rate_plan_id);
      const detail = details.find((d) => d.status === "active");
      if (detail?.route_id) {
        routeId = detail.route_id;
        const route = await getSmsRouteById(detail.route_id);
        if (route) {
          routeLabel = route.name;
          routeStatus = route.status;
          providerId = route.provider_id;
          const provider = await getSmsProviderById(route.provider_id);
          if (provider) {
            providerLabel = provider.name;
            providerStatus = provider.status;
          }
        }
      }
    }
  }

  return {
    routeId,
    providerId,
    ratePlanId,
    routeLabel,
    providerLabel,
    ratePlanLabel,
    providerStatus,
    routeStatus,
    routeError,
  };
}

async function buildTrafficPolicyContext(companyId: string): Promise<{
  policy: Awaited<ReturnType<typeof resolveTrafficPolicy>>;
  assignment: Awaited<ReturnType<typeof getCompanyRatePlan>>;
  routing: Awaited<ReturnType<typeof resolveRoutingContext>>;
}> {
  const routing = await resolveRoutingContext(companyId);
  const policy = await resolveTrafficPolicy({
    companyId,
    routeId: routing.routeId,
    providerId: routing.providerId,
    ratePlanId: routing.ratePlanId,
    trafficType: CAMPAIGN_TRAFFIC_TYPE,
    country: CAMPAIGN_COUNTRY,
  });
  const assignment = await getCompanyRatePlan(
    companyId,
    CAMPAIGN_COUNTRY,
    CAMPAIGN_TRAFFIC_TYPE,
  );
  return { policy, assignment, routing };
}

function appendTrafficBlocks(
  blockedReasons: string[],
  warnings: string[],
  input: {
    policy: Awaited<ReturnType<typeof resolveTrafficPolicy>>;
    assignment: Awaited<ReturnType<typeof getCompanyRatePlan>>;
    routing: Awaited<ReturnType<typeof resolveRoutingContext>>;
  },
): void {
  const { policy, assignment, routing } = input;

  if (!policy.live_enabled) {
    blockedReasons.push(
      "El envío real no está habilitado para tu cuenta (live_enabled).",
    );
  }
  if (!policy.campaigns_enabled) {
    blockedReasons.push("La empresa no tiene campañas reales habilitadas.");
  }

  const clientTpsRaw = assignment?.max_tps;
  if (clientTpsRaw == null || !Number.isFinite(Number(clientTpsRaw))) {
    blockedReasons.push("TPS cliente no configurado.");
  } else if (Number(clientTpsRaw) > MAX_CLIENT_TPS) {
    blockedReasons.push("El TPS cliente supera el máximo permitido (20).");
  }

  if (!assignment?.rate_plan_id) {
    blockedReasons.push("No hay rate plan asignado.");
  }

  if (routing.routeError) {
    blockedReasons.push(routing.routeError);
  }

  if (routing.routeStatus === "paused") {
    blockedReasons.push("La ruta SMS está pausada.");
  } else if (
    routing.routeStatus !== "—" &&
    routing.routeStatus !== "active" &&
    routing.routeStatus !== "testing"
  ) {
    blockedReasons.push("La ruta SMS no está activa.");
  }

  if (routing.providerStatus === "suspended") {
    blockedReasons.push("El proveedor está suspendido.");
  } else if (
    routing.providerStatus !== "—" &&
    routing.providerStatus !== "active" &&
    routing.providerStatus !== "testing" &&
    routing.providerStatus !== "degraded"
  ) {
    blockedReasons.push("El proveedor SMS no está activo.");
  }

  if (assignment) {
    const routingPolicy = companyRoutingPolicyFromAssignment(assignment);
    if (
      routing.providerId &&
      routingPolicy.blockedProviderIds.includes(routing.providerId)
    ) {
      blockedReasons.push(
        "El proveedor de la ruta está bloqueado para este cliente.",
      );
    }
    if (
      routing.providerId &&
      routingPolicy.allowedProviderIds.length > 0 &&
      !routingPolicy.allowedProviderIds.includes(routing.providerId)
    ) {
      blockedReasons.push(
        "El proveedor de la ruta no está en la lista permitida del cliente.",
      );
    }
  }

  if (policy.effective_tps == null || !Number.isFinite(policy.effective_tps)) {
    blockedReasons.push("No se pudo calcular el TPS efectivo.");
  }

  if (policy.daily_limit != null) {
    warnings.push(
      `Límite diario operativo: ${policy.daily_limit} SMS (verificar volumen de campaña).`,
    );
  }
  if (policy.monthly_limit != null) {
    warnings.push(
      `Límite mensual operativo: ${policy.monthly_limit} SMS (verificar volumen de campaña).`,
    );
  }
}

/** Readiness de tráfico/TPS por empresa (sin campaña). Solo lectura — no consume cola ni TPS. */
export async function getCampaignTrafficReadiness(
  companyId: string,
): Promise<CampaignTrafficReadinessResult> {
  const blockedReasons: string[] = [];
  const warnings: string[] = [];

  const company = await findCompanyById(companyId);
  if (!company || company.status !== "active") {
    blockedReasons.push("La cuenta empresa no está activa.");
  }

  let availableSms = 0;
  let balanceStatus = "—";
  try {
    const wallet = await getOrCreateCompanyWallet(companyId, CAMPAIGN_COUNTRY);
    const balance = await getCompanyBalance(companyId, CAMPAIGN_COUNTRY);
    availableSms = balance.availableSms;
    balanceStatus =
      wallet.status === "active"
        ? availableSms > 0
          ? "disponible"
          : "sin saldo"
        : wallet.status;
  } catch {
    balanceStatus = "no disponible";
    warnings.push("No se pudo leer el saldo SMS.");
  }

  const { policy, assignment, routing } =
    await buildTrafficPolicyContext(companyId);

  if (assignment?.rate_plan_id) {
    const plan = await getSmsRatePlanById(assignment.rate_plan_id);
    if (plan && plan.status !== "active") {
      blockedReasons.push("El rate plan asignado no está activo.");
    }
  }

  appendTrafficBlocks(blockedReasons, warnings, { policy, assignment, routing });

  return {
    effectiveTps: policy.effective_tps ?? null,
    liveEnabled: policy.live_enabled,
    campaignsEnabled: policy.campaigns_enabled,
    clientMaxTps: assignment?.max_tps ?? policy.client_max_tps ?? null,
    providerStatus: routing.providerStatus,
    routeStatus: routing.routeStatus,
    ratePlanLabel: routing.ratePlanLabel,
    routeLabel: routing.routeLabel,
    providerLabel: routing.providerLabel,
    balanceStatus,
    availableSms,
    dailyLimit: policy.daily_limit,
    monthlyLimit: policy.monthly_limit,
    blockedReasons: [...new Set(blockedReasons)],
    warnings,
  };
}

/** Evalúa si una campaña puede ir a live. Solo lectura — no envía SMS ni debita wallet. */
export async function getCampaignLiveReadiness(
  companyId: string,
  campaignId: string,
): Promise<CampaignLiveReadinessResult> {
  const blockedReasons: string[] = [];
  const warnings: string[] = [];

  const campaign = await getCampaignByIdForCompany(campaignId, companyId);
  if (!campaign) {
    return {
      canGoLive: false,
      blockedReasons: ["La campaña no existe o no pertenece a tu empresa."],
      warnings: [],
      effectiveTps: null,
      providerStatus: "—",
      routeStatus: "—",
      balanceStatus: "—",
      estimatedCost: 0,
      requiredSms: 0,
      availableSms: 0,
      readinessLabel: "blocked",
      liveEnabled: false,
      campaignsEnabled: false,
      clientMaxTps: null,
      ratePlanLabel: "—",
      routeLabel: "—",
      providerLabel: "—",
      dailyLimit: null,
      monthlyLimit: null,
    };
  }

  return evaluateCampaignReadiness(companyId, campaign, blockedReasons, warnings);
}

export async function validateCampaignCanGoLive(
  companyId: string,
  campaignId: string,
): Promise<CampaignLiveReadinessResult> {
  const readiness = await getCampaignLiveReadiness(companyId, campaignId);
  if (!readiness.canGoLive) {
    throw new AppError(
      readiness.blockedReasons[0] ??
        "La campaña no cumple los requisitos operativos para envío real.",
      403,
    );
  }
  return readiness;
}

async function evaluateCampaignReadiness(
  companyId: string,
  campaign: SmsCampaignRow,
  blockedReasons: string[],
  warnings: string[],
): Promise<CampaignLiveReadinessResult> {
  const meta = campaign.metadata ?? {};

  if (!isCampaignStatusEligible(campaign.status)) {
    blockedReasons.push(
      `La campaña está en estado «${campaign.status}»; solo borradores o simulaciones completadas pueden evaluarse para envío real.`,
    );
  }

  const senderId = String(campaign.sender_id ?? "").trim();
  if (!senderId) {
    blockedReasons.push("El remitente (Sender ID) es obligatorio.");
  }

  const segmentInfo = calculateSmsSegments(campaign.message ?? "");
  const segmentsPerMessage =
    numMeta(meta, "segments_per_message") || segmentInfo.segments || 1;
  const validRecipients =
    campaign.valid_recipients || numMeta(meta, "estimated_recipients");

  if (validRecipients <= 0) {
    blockedReasons.push("La audiencia no tiene destinatarios válidos.");
  }

  const blockedCount = numMeta(meta, "blocked_count");
  const optOutCount = numMeta(meta, "opt_out_count");
  const duplicatesOmitted = numMeta(meta, "duplicates_omitted");
  if (blockedCount > 0) {
    warnings.push(`${blockedCount} contacto(s) bloqueado(s) omitidos de la audiencia.`);
  }
  if (optOutCount > 0) {
    warnings.push(`${optOutCount} contacto(s) en opt-out omitidos de la audiencia.`);
  }
  if (duplicatesOmitted > 0) {
    warnings.push(`${duplicatesOmitted} duplicado(s) omitidos de la audiencia.`);
  }

  try {
    const audienceSource = parseAudienceSourceFromCampaignMetadata(meta);
    if (audienceSource) {
      const audience = await resolveCampaignAudience(
        companyId,
        audienceSource,
      );
      validateCampaignAudience(audience);
    }
  } catch (err) {
    blockedReasons.push(
      err instanceof AppError
        ? err.message
        : err instanceof Error
          ? err.message
          : "La audiencia de la campaña no es válida.",
    );
  }

  const requiredSms =
    campaign.estimated_sms_cost > 0
      ? campaign.estimated_sms_cost
      : validRecipients * segmentsPerMessage;

  let availableSms = 0;
  let balanceStatus = "—";
  try {
    const wallet = await getOrCreateCompanyWallet(companyId, CAMPAIGN_COUNTRY);
    const balance = await getCompanyBalance(companyId, CAMPAIGN_COUNTRY);
    availableSms = balance.availableSms;
    balanceStatus =
      wallet.status === "active"
        ? availableSms >= requiredSms
          ? "suficiente"
          : "insuficiente"
        : wallet.status;

    if (wallet.status !== "active") {
      blockedReasons.push("El saldo SMS no está disponible para envíos.");
    } else if (availableSms < requiredSms) {
      blockedReasons.push("Saldo insuficiente.");
    }
  } catch {
    balanceStatus = "no disponible";
    blockedReasons.push("No se pudo verificar el saldo SMS.");
  }

  const { policy, assignment, routing } =
    await buildTrafficPolicyContext(companyId);

  if (assignment?.rate_plan_id) {
    const plan = await getSmsRatePlanById(assignment.rate_plan_id);
    if (plan && plan.status !== "active") {
      blockedReasons.push("El rate plan asignado no está activo.");
    }

    const allowlist =
      parseSenderAllowList(plan?.metadata) ??
      parseSenderAllowList(assignment.metadata);
    if (allowlist && senderId) {
      if (!allowlist.includes(senderId.toUpperCase())) {
        blockedReasons.push(
          `El remitente «${senderId}» no está permitido para esta cuenta.`,
        );
      }
    }
  }

  appendTrafficBlocks(blockedReasons, warnings, { policy, assignment, routing });

  if (requiredSms > 0 && policy.daily_limit != null && requiredSms > policy.daily_limit) {
    blockedReasons.push(
      "El tamaño de la campaña supera el límite diario operativo.",
    );
  }
  if (
    requiredSms > 0 &&
    policy.monthly_limit != null &&
    requiredSms > policy.monthly_limit
  ) {
    blockedReasons.push(
      "El tamaño de la campaña supera el límite mensual operativo.",
    );
  }

  const uniqueBlocked = [...new Set(blockedReasons)];
  const readinessLabel = deriveReadinessLabel({
    liveEnabled: policy.live_enabled,
    campaignsEnabled: policy.campaigns_enabled,
    blockedReasons: uniqueBlocked,
  });

  return {
    canGoLive: uniqueBlocked.length === 0,
    blockedReasons: uniqueBlocked,
    warnings,
    effectiveTps: policy.effective_tps ?? null,
    providerStatus: routing.providerStatus,
    routeStatus: routing.routeStatus,
    balanceStatus,
    estimatedCost: requiredSms,
    requiredSms,
    availableSms,
    readinessLabel,
    liveEnabled: policy.live_enabled,
    campaignsEnabled: policy.campaigns_enabled,
    clientMaxTps: assignment?.max_tps ?? policy.client_max_tps ?? null,
    ratePlanLabel: routing.ratePlanLabel,
    routeLabel: routing.routeLabel,
    providerLabel: routing.providerLabel,
    dailyLimit: policy.daily_limit,
    monthlyLimit: policy.monthly_limit,
  };
}
