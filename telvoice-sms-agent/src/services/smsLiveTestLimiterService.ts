import { env } from "../config/env.js";
import { getSupabase } from "../database/supabaseClient.js";
import type { PanelSmsMessageRow } from "../types/sms-panel.js";
import { AppError } from "../utils/errors.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { getCompanyRatePlan } from "./companyRatePlanService.js";
import { findCompanyById } from "./companyService.js";
import {
  isCompanyAllowedForLiveTest,
  isLiveTestGloballyEnabled,
  isNumberAllowedForLiveTest,
} from "./smsLiveTestPolicy.js";
import { resolveRouteForMessage } from "./smsRoutingService.js";
import { resolveTrafficPolicy } from "./smsTrafficPolicyService.js";
import { checkTpsWindowAllowed } from "./smsTpsLimiterService.js";
import { getOrCreateCompanyWallet } from "./smsWalletService.js";
import { validateRecipientNumber } from "./smsSegmentService.js";

const COUNTABLE_LIVE_TEST_STATUSES = [
  "sent",
  "delivered",
  "pending",
  "accepted",
] as const;

/** Cuota diaria /app: envíos desde panel cliente. */
export const APP_CLIENT_LIVE_TEST_SOURCE = "app_send_sms_live_test";

/** Test QA a números telsim registrados (cuenta en cuota diaria). */
export const APP_VERIFY_TEST_SOURCE = "app_send_sms_verify_test";

export const APP_PANEL_SEND_SOURCES = [
  APP_CLIENT_LIVE_TEST_SOURCE,
  APP_VERIFY_TEST_SOURCE,
] as const;

/** Pruebas técnicas Superadmin; no consumen cuota del cliente. */
export const SUPERADMIN_LIVE_TEST_SOURCE = "superadmin_provider_test";

export type LiveTestLimiterConfig = {
  dailyLimit: number;
  minSecondsBetweenSends: number;
  maxSegments: number;
};

export type LiveTestSendPageStatus = {
  globallyEnabled: boolean;
  companyAuthorized: boolean;
  routeActive: boolean;
  providerActive: boolean;
  routeName: string | null;
  providerName: string | null;
  dailyUsed: number;
  dailyLimit: number;
  dailyRemaining: number;
  maxSegments: number;
  maskedNumbers: string[];
  authorizedNumbersConfigured: boolean;
  canSelectLiveTest: boolean;
  liveTestBlockReason: string | null;
  recipientAllowed: boolean | null;
  segmentsWithinLimit: boolean | null;
  /** Solo validación en cliente; no mostrar en UI. */
  allowedNumbersNormalized: string[];
  /** TPS efectivo asignado (visible en /app). */
  effectiveTps: number | null;
  /** Límite diario comercial (mínimo entre capas). */
  trafficDailyLimit: number | null;
  trafficDailyRemaining: number | null;
  liveEnabledOnPlan: boolean;
};

export type LiveTestControlPanelView = {
  providerMode: string;
  liveTestEnabled: boolean;
  liveTestActive: boolean;
  dailyLimit: number;
  minSecondsBetweenSends: number;
  maxSegments: number;
  allowedCompaniesCount: number;
  maskedCompanyIds: string[];
  allowedNumbersCount: number;
  maskedNumbers: string[];
  todayClientLiveTestMessages: number;
  todayClientLiveTestSms: number;
  todaySuperadminLiveTestMessages: number;
  todaySuperadminLiveTestSms: number;
  todayGlobalLiveTestMessages: number;
  todayGlobalLiveTestSms: number;
  recentLiveTests: Array<{
    id: string;
    companyId: string;
    recipient: string;
    status: string;
    segments: number;
    createdAt: string;
    providerMessageId: string | null;
    source: string | null;
  }>;
};

export function getLiveTestLimiterConfig(): LiveTestLimiterConfig {
  const cfg = env.smsProvider;
  return {
    dailyLimit: cfg.liveTestDailyLimit,
    minSecondsBetweenSends: cfg.liveTestMinSecondsBetweenSends,
    maxSegments: cfg.liveTestMaxSegments,
  };
}

/** Tope diario de panel /app (desactivado por defecto; el límite efectivo es el saldo SMS). */
export function isDailySendLimitEnforced(): boolean {
  return env.smsProvider.enforceDailyLimit;
}

export function maskPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) {
    return "+****";
  }
  const tail = digits.slice(-4);
  if (digits.startsWith("569") && digits.length >= 11) {
    return `+569****${tail}`;
  }
  if (digits.startsWith("56")) {
    return `+56****${tail}`;
  }
  const head = digits.slice(0, Math.min(3, digits.length - 4));
  return `+${head}****${tail}`;
}

export function maskCompanyId(id: string): string {
  if (id.length < 12) {
    return "…";
  }
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function startOfTodayUtcIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function countDailyLiveTestMessages(
  companyId: string,
): Promise<number> {
  const { count, error } = await getSupabase()
    .from("panel_sms_messages")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("mode", "live_test")
    .in("metadata->>source", [...APP_PANEL_SEND_SOURCES])
    .in("status", [...COUNTABLE_LIVE_TEST_STATUSES])
    .gte("created_at", startOfTodayUtcIso());

  if (error) {
    if (isMissingTableError(error)) {
      return 0;
    }
    wrapSupabaseError(error, "countDailyLiveTestMessages");
  }

  return count ?? 0;
}

async function getLastCountableLiveTestAt(
  companyId: string,
): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("panel_sms_messages")
    .select("created_at")
    .eq("company_id", companyId)
    .eq("mode", "live_test")
    .in("metadata->>source", [...APP_PANEL_SEND_SOURCES])
    .in("status", [...COUNTABLE_LIVE_TEST_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getLastCountableLiveTestAt");
  }

  return data?.created_at ?? null;
}

async function assertRoutingReady(companyId: string): Promise<{
  routeActive: boolean;
  providerActive: boolean;
  routeName: string | null;
  providerName: string | null;
}> {
  try {
    const resolved = await resolveRouteForMessage({
      companyId,
      country: "CL",
      trafficType: "transactional",
    });
    const providerStatus = resolved.provider.status;
    const routeActive = resolved.route.status === "active";
    if (!routeActive) {
      throw new AppError("No hay ruta SMS activa para este cliente.", 400);
    }
    if (providerStatus === "inactive" || providerStatus === "suspended") {
      throw new AppError("Proveedor SMS no disponible.", 503);
    }
    if (providerStatus !== "active") {
      throw new AppError("Proveedor SMS no disponible.", 503);
    }
    return {
      routeActive: true,
      providerActive: true,
      routeName: resolved.route.name,
      providerName: resolved.provider.name,
    };
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError("No hay ruta SMS activa para este cliente.", 400);
  }
}

export async function assertLiveTestOperationalLimits(input: {
  companyId: string;
  to: string;
  segmentCount: number;
  /** Panel Test superadmin: sin espera entre envíos QA. */
  skipInterSendCooldown?: boolean;
}): Promise<void> {
  const limits = getLiveTestLimiterConfig();

  if (input.segmentCount > limits.maxSegments) {
    throw new AppError(
      "El mensaje supera el máximo de segmentos permitido.",
      400,
    );
  }

  const company = await findCompanyById(input.companyId);
  if (!company) {
    throw new AppError("Empresa no encontrada.", 404);
  }
  if (company.status !== "active") {
    throw new AppError(
      "La empresa no está autorizada para envío real controlado.",
      403,
    );
  }

  if (!isCompanyAllowedForLiveTest(input.companyId)) {
    throw new AppError(
      "La empresa no está autorizada para envío SMS.",
      403,
    );
  }

  const assignment = await getCompanyRatePlan(input.companyId);
  if (!assignment?.live_enabled) {
    throw new AppError(
      "El envío SMS no está habilitado para tu cuenta. Contacta a soporte Telvoice.",
      403,
    );
  }

  const phone = validateRecipientNumber(input.to);
  if (!phone.ok || !phone.normalized) {
    throw new AppError("Número inválido.", 400);
  }

  if (!isNumberAllowedForLiveTest(phone.normalized)) {
    throw new AppError(
      "El número destino no está autorizado para envío SMS.",
      403,
    );
  }

  const wallet = await getOrCreateCompanyWallet(input.companyId);
  if (wallet.status !== "active") {
    throw new AppError(
      "La empresa no está autorizada para envío real controlado.",
      403,
    );
  }

  await assertRoutingReady(input.companyId);

  if (isDailySendLimitEnforced()) {
    const dailyUsed = await countDailyLiveTestMessages(input.companyId);
    if (dailyUsed >= limits.dailyLimit && limits.dailyLimit < 999_999) {
      throw new AppError(
        "Límite diario de envíos alcanzado.",
        429,
      );
    }
  }

  if (!input.skipInterSendCooldown) {
    const lastAt = await getLastCountableLiveTestAt(input.companyId);
    if (lastAt) {
      const elapsed =
        (Date.now() - new Date(lastAt).getTime()) / 1000;
      if (elapsed < limits.minSecondsBetweenSends) {
        throw new AppError(
          "Debes esperar al menos 1 minuto entre envíos reales controlados.",
          429,
        );
      }
    }
  }
}

export async function getLiveTestSendPageStatus(
  companyId: string,
  opts?: { recipientPreview?: string; segmentCount?: number },
): Promise<LiveTestSendPageStatus> {
  const limits = getLiveTestLimiterConfig();
  const dailyCapEnforced = isDailySendLimitEnforced();
  const globallyEnabled = isLiveTestGloballyEnabled();
  const companyAuthorized = isCompanyAllowedForLiveTest(companyId);
  const allowedNumbers = env.smsProvider.liveTestAllowedNumbers;
  const maskedNumbers = allowedNumbers.map(maskPhoneForDisplay);
  const numbersRestricted = allowedNumbers.length > 0;

  let routeActive = false;
  let providerActive = false;
  let routeName: string | null = null;
  let providerName: string | null = null;
  let effectiveTps: number | null = null;
  let trafficDailyLimit: number | null = null;
  let trafficDailyRemaining: number | null = null;
  let liveEnabledOnPlan = false;
  let resolvedRouteId: string | null = null;
  let resolvedProviderId: string | null = null;
  let resolvedRatePlanId: string | null = null;

  if (globallyEnabled && companyAuthorized) {
    try {
      const resolved = await resolveRouteForMessage({
        companyId,
        country: "CL",
        trafficType: "transactional",
      });
      const providerStatus = resolved.provider.status;
      routeActive = resolved.route.status === "active";
      providerActive = providerStatus === "active";
      routeName = resolved.route.name;
      providerName = resolved.provider.name;
      resolvedRouteId = resolved.route.id;
      resolvedProviderId = resolved.provider.id;
      resolvedRatePlanId = resolved.ratePlan.id;

      if (!routeActive || !providerActive) {
        routeActive = false;
        providerActive = false;
      } else {
        const policy = await resolveTrafficPolicy({
          companyId,
          routeId: resolvedRouteId,
          providerId: resolvedProviderId,
          ratePlanId: resolvedRatePlanId,
        });
        effectiveTps = policy.effective_tps;
        liveEnabledOnPlan = policy.live_enabled;
        trafficDailyLimit = policy.daily_limit;
      }
    } catch {
      routeActive = false;
      providerActive = false;
    }
  }

  const dailyUsed = globallyEnabled
    ? await countDailyLiveTestMessages(companyId)
    : 0;
  const dailyRemaining = Math.max(0, limits.dailyLimit - dailyUsed);
  if (trafficDailyLimit != null && globallyEnabled) {
    trafficDailyRemaining = Math.max(0, trafficDailyLimit - dailyUsed);
  }

  let recipientAllowed: boolean | null = null;
  if (opts?.recipientPreview?.trim()) {
    const phone = validateRecipientNumber(opts.recipientPreview);
    recipientAllowed =
      phone.ok && phone.normalized
        ? isNumberAllowedForLiveTest(phone.normalized)
        : false;
  } else if (!numbersRestricted) {
    recipientAllowed = true;
  } else {
    /* Lista blanca activa: sin número aún se puede redactar; se valida al enviar */
    recipientAllowed = true;
  }

  const segmentsWithinLimit =
    opts?.segmentCount != null
      ? opts.segmentCount <= limits.maxSegments
      : null;

  let liveTestBlockReason: string | null = null;
  if (!globallyEnabled) {
    liveTestBlockReason = "El envío SMS no está disponible en este entorno.";
  } else if (!companyAuthorized) {
    liveTestBlockReason =
      "La empresa no está autorizada para envío SMS.";
  } else if (!liveEnabledOnPlan) {
    liveTestBlockReason =
      "El envío SMS no está habilitado para tu cuenta. Contacta a soporte Telvoice.";
  } else if (!routeActive) {
    liveTestBlockReason = "La ruta SMS no está disponible temporalmente.";
  } else if (!providerActive) {
    liveTestBlockReason = "La ruta SMS no está disponible temporalmente.";
  } else if (
    dailyCapEnforced &&
    trafficDailyRemaining != null &&
    trafficDailyRemaining <= 0
  ) {
    liveTestBlockReason = "El límite diario de envíos fue alcanzado.";
  } else if (
    dailyCapEnforced &&
    dailyRemaining <= 0 &&
    limits.dailyLimit < 999_999
  ) {
    liveTestBlockReason = "Límite diario de envíos alcanzado.";
  } else if (recipientAllowed === false) {
    liveTestBlockReason =
      "El número destino no está autorizado para envío SMS.";
  } else if (segmentsWithinLimit === false) {
    liveTestBlockReason =
      "El mensaje supera el máximo de segmentos permitido.";
  }

  if (
    globallyEnabled &&
    companyAuthorized &&
    routeActive &&
    resolvedRouteId &&
    resolvedProviderId
  ) {
    const tpsCheck = checkTpsWindowAllowed({
      companyId,
      routeId: resolvedRouteId,
      providerId: resolvedProviderId,
      effectiveTps: effectiveTps ?? 1,
    });
    if (!tpsCheck.allowed && !liveTestBlockReason) {
      liveTestBlockReason =
        tpsCheck.reason ??
        "Tu cuenta tiene un límite temporal de envío. Intenta nuevamente en unos segundos.";
    }
  }

  const canSelectLiveTest =
    globallyEnabled &&
    companyAuthorized &&
    liveEnabledOnPlan &&
    routeActive &&
    providerActive &&
    (!dailyCapEnforced || dailyRemaining > 0) &&
    (!dailyCapEnforced ||
      trafficDailyRemaining == null ||
      trafficDailyRemaining > 0) &&
    recipientAllowed !== false &&
    segmentsWithinLimit !== false &&
    !liveTestBlockReason;

  return {
    globallyEnabled,
    companyAuthorized,
    routeActive,
    providerActive,
    routeName,
    providerName,
    dailyUsed,
    dailyLimit: limits.dailyLimit,
    dailyRemaining,
    maxSegments: limits.maxSegments,
    maskedNumbers,
    authorizedNumbersConfigured: allowedNumbers.length > 0,
    canSelectLiveTest,
    liveTestBlockReason,
    recipientAllowed,
    segmentsWithinLimit,
    allowedNumbersNormalized: allowedNumbers,
    effectiveTps,
    trafficDailyLimit,
    trafficDailyRemaining,
    liveEnabledOnPlan,
  };
}

export async function getLiveTestControlPanelView(): Promise<LiveTestControlPanelView> {
  const limits = getLiveTestLimiterConfig();
  const companyIds = env.smsProvider.liveTestAllowedCompanyIds;
  const numbers = env.smsProvider.liveTestAllowedNumbers;

  const start = startOfTodayUtcIso();
  const { data: todayRows, error: todayError } = await getSupabase()
    .from("panel_sms_messages")
    .select("id, cost_sms, metadata")
    .eq("mode", "live_test")
    .in("status", [...COUNTABLE_LIVE_TEST_STATUSES])
    .gte("created_at", start);

  if (todayError && !isMissingTableError(todayError)) {
    wrapSupabaseError(todayError, "getLiveTestControlPanelView.today");
  }

  const today = (todayRows ?? []) as Pick<
    PanelSmsMessageRow,
    "id" | "cost_sms" | "metadata"
  >[];

  const sourceOf = (row: (typeof today)[number]): string | null => {
    const src = row.metadata?.source;
    return typeof src === "string" ? src : null;
  };

  const clientToday = today.filter(
    (r) => sourceOf(r) === APP_CLIENT_LIVE_TEST_SOURCE,
  );
  const superadminToday = today.filter(
    (r) => sourceOf(r) === SUPERADMIN_LIVE_TEST_SOURCE,
  );

  const { data: recent, error: recentError } = await getSupabase()
    .from("panel_sms_messages")
    .select(
      "id, company_id, recipient_number, status, segments, created_at, provider_message_id, metadata",
    )
    .eq("mode", "live_test")
    .order("created_at", { ascending: false })
    .limit(10);

  if (recentError && !isMissingTableError(recentError)) {
    wrapSupabaseError(recentError, "getLiveTestControlPanelView.recent");
  }

  const recentLiveTests = ((recent ?? []) as PanelSmsMessageRow[]).map((m) => ({
    id: m.id,
    companyId: m.company_id,
    recipient: maskPhoneForDisplay(m.recipient_number),
    status: m.status,
    segments: m.segments,
    createdAt: m.created_at,
    providerMessageId: m.provider_message_id,
    source:
      typeof m.metadata?.source === "string" ? m.metadata.source : null,
  }));

  return {
    providerMode: env.smsProvider.mode,
    liveTestEnabled: env.smsProvider.liveTestEnabled,
    liveTestActive: isLiveTestGloballyEnabled(),
    dailyLimit: limits.dailyLimit,
    minSecondsBetweenSends: limits.minSecondsBetweenSends,
    maxSegments: limits.maxSegments,
    allowedCompaniesCount: companyIds.length,
    maskedCompanyIds: companyIds.map(maskCompanyId),
    allowedNumbersCount: numbers.length,
    maskedNumbers: numbers.map(maskPhoneForDisplay),
    todayClientLiveTestMessages: clientToday.length,
    todayClientLiveTestSms: clientToday.reduce(
      (s, r) => s + (r.cost_sms ?? 0),
      0,
    ),
    todaySuperadminLiveTestMessages: superadminToday.length,
    todaySuperadminLiveTestSms: superadminToday.reduce(
      (s, r) => s + (r.cost_sms ?? 0),
      0,
    ),
    todayGlobalLiveTestMessages: today.length,
    todayGlobalLiveTestSms: today.reduce((s, r) => s + (r.cost_sms ?? 0), 0),
    recentLiveTests,
  };
}
