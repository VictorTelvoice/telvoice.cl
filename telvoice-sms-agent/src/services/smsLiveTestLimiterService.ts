import { env } from "../config/env.js";
import { getSupabase } from "../database/supabaseClient.js";
import type { PanelSmsMessageRow } from "../types/sms-panel.js";
import { AppError } from "../utils/errors.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { findCompanyById } from "./companyService.js";
import {
  isCompanyAllowedForLiveTest,
  isLiveTestGloballyEnabled,
  isNumberAllowedForLiveTest,
} from "./smsLiveTestPolicy.js";
import { resolveRouteForMessage } from "./smsRoutingService.js";
import { getOrCreateCompanyWallet } from "./smsWalletService.js";
import { validateRecipientNumber } from "./smsSegmentService.js";

const COUNTABLE_LIVE_TEST_STATUSES = [
  "sent",
  "delivered",
  "pending",
  "accepted",
] as const;

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
  todayLiveTestMessages: number;
  todayLiveTestSms: number;
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
      "La empresa no está autorizada para envío real controlado.",
      403,
    );
  }

  const phone = validateRecipientNumber(input.to);
  if (!phone.ok || !phone.normalized) {
    throw new AppError("Número inválido.", 400);
  }

  if (!isNumberAllowedForLiveTest(phone.normalized)) {
    throw new AppError(
      "El número destino no está autorizado para live_test.",
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

  const dailyUsed = await countDailyLiveTestMessages(input.companyId);
  if (dailyUsed >= limits.dailyLimit) {
    throw new AppError(
      "Límite diario de pruebas reales alcanzado.",
      429,
    );
  }

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

export async function getLiveTestSendPageStatus(
  companyId: string,
  opts?: { recipientPreview?: string; segmentCount?: number },
): Promise<LiveTestSendPageStatus> {
  const limits = getLiveTestLimiterConfig();
  const globallyEnabled = isLiveTestGloballyEnabled();
  const companyAuthorized = isCompanyAllowedForLiveTest(companyId);
  const allowedNumbers = env.smsProvider.liveTestAllowedNumbers;
  const maskedNumbers = allowedNumbers.map(maskPhoneForDisplay);

  let routeActive = false;
  let providerActive = false;
  let routeName: string | null = null;
  let providerName: string | null = null;

  if (globallyEnabled && companyAuthorized) {
    try {
      const routing = await assertRoutingReady(companyId);
      routeActive = routing.routeActive;
      providerActive = routing.providerActive;
      routeName = routing.routeName;
      providerName = routing.providerName;
    } catch {
      routeActive = false;
      providerActive = false;
    }
  }

  const dailyUsed = globallyEnabled
    ? await countDailyLiveTestMessages(companyId)
    : 0;
  const dailyRemaining = Math.max(0, limits.dailyLimit - dailyUsed);

  let recipientAllowed: boolean | null = null;
  if (opts?.recipientPreview?.trim()) {
    const phone = validateRecipientNumber(opts.recipientPreview);
    recipientAllowed =
      phone.ok && phone.normalized
        ? isNumberAllowedForLiveTest(phone.normalized)
        : false;
  }

  const segmentsWithinLimit =
    opts?.segmentCount != null
      ? opts.segmentCount <= limits.maxSegments
      : null;

  let liveTestBlockReason: string | null = null;
  if (!globallyEnabled) {
    liveTestBlockReason = null;
  } else if (!companyAuthorized) {
    liveTestBlockReason =
      "La empresa no está autorizada para envío real controlado.";
  } else if (!routeActive) {
    liveTestBlockReason = "No hay ruta SMS activa para este cliente.";
  } else if (!providerActive) {
    liveTestBlockReason = "Proveedor SMS no disponible.";
  } else if (dailyRemaining <= 0) {
    liveTestBlockReason = "Límite diario de pruebas reales alcanzado.";
  } else if (recipientAllowed === false) {
    liveTestBlockReason =
      "El número destino no está autorizado para live_test.";
  } else if (segmentsWithinLimit === false) {
    liveTestBlockReason =
      "El mensaje supera el máximo de segmentos permitido.";
  }

  const canSelectLiveTest =
    globallyEnabled &&
    companyAuthorized &&
    routeActive &&
    providerActive &&
    dailyRemaining > 0 &&
    recipientAllowed !== false &&
    segmentsWithinLimit !== false;

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
  };
}

export async function getLiveTestControlPanelView(): Promise<LiveTestControlPanelView> {
  const limits = getLiveTestLimiterConfig();
  const companyIds = env.smsProvider.liveTestAllowedCompanyIds;
  const numbers = env.smsProvider.liveTestAllowedNumbers;

  const start = startOfTodayUtcIso();
  const { data: todayRows, error: todayError } = await getSupabase()
    .from("panel_sms_messages")
    .select("id, cost_sms")
    .eq("mode", "live_test")
    .in("status", [...COUNTABLE_LIVE_TEST_STATUSES])
    .gte("created_at", start);

  if (todayError && !isMissingTableError(todayError)) {
    wrapSupabaseError(todayError, "getLiveTestControlPanelView.today");
  }

  const today = (todayRows ?? []) as Pick<PanelSmsMessageRow, "id" | "cost_sms">[];

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
    todayLiveTestMessages: today.length,
    todayLiveTestSms: today.reduce((s, r) => s + (r.cost_sms ?? 0), 0),
    recentLiveTests,
  };
}
