/**
 * Limitador TPS en memoria por proceso.
 *
 * LIMITACIÓN: con varias instancias PM2 o servidores, cada proceso mantiene
 * contadores independientes. Para producción multi-nodo usar Redis o
 * sms_tps_counters con locks. La tabla sms_tps_counters queda preparada en BD.
 */
import { getSupabase } from "../database/supabaseClient.js";
import { TPS_WINDOW_MS } from "../constants/sms-traffic.js";
import type {
  CanSendNowResult,
  ResolvedTrafficPolicy,
  TrafficFlowKind,
} from "../types/sms-traffic.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { findCompanyById } from "./companyService.js";
import { getSmsProviderById } from "./smsProviderService.js";
import { getSmsRouteById } from "./smsRouteService.js";
import { getOrCreateCompanyWallet } from "./smsWalletService.js";
import {
  countDailyLiveTestMessages,
  getLiveTestLimiterConfig,
  isDailySendLimitEnforced,
} from "./smsLiveTestLimiterService.js";
import { resolveTrafficPolicy } from "./smsTrafficPolicyService.js";

type WindowBucket = { windowStart: number; count: number };

const tpsWindows = new Map<string, WindowBucket>();
const concurrency = new Map<string, number>();

function bucketKey(scope: string, scopeId: string): string {
  return `${scope}:${scopeId}`;
}

function getWindowCount(key: string, now: number): number {
  const b = tpsWindows.get(key);
  if (!b || now - b.windowStart >= TPS_WINDOW_MS) {
    return 0;
  }
  return b.count;
}

function incrementWindow(key: string, now: number): void {
  const b = tpsWindows.get(key);
  if (!b || now - b.windowStart >= TPS_WINDOW_MS) {
    tpsWindows.set(key, { windowStart: now, count: 1 });
    return;
  }
  b.count += 1;
}

function getConcurrency(key: string): number {
  return concurrency.get(key) ?? 0;
}

function adjustConcurrency(key: string, delta: number): void {
  const next = Math.max(0, (concurrency.get(key) ?? 0) + delta);
  if (next === 0) {
    concurrency.delete(key);
  } else {
    concurrency.set(key, next);
  }
}

/** Registra un envío exitoso en ventanas TPS (llamar tras aceptación). */
export function recordTpsSend(input: {
  companyId: string;
  providerId?: string | null;
  routeId?: string | null;
  ratePlanId?: string | null;
}): void {
  const now = Date.now();
  incrementWindow(bucketKey("company", input.companyId), now);
  incrementWindow(bucketKey("platform", "global"), now);
  if (input.providerId) {
    incrementWindow(bucketKey("provider", input.providerId), now);
  }
  if (input.routeId) {
    incrementWindow(bucketKey("route", input.routeId), now);
  }
  if (input.ratePlanId) {
    incrementWindow(bucketKey("rate_plan", input.ratePlanId), now);
  }
}

export function releaseConcurrency(input: {
  companyId: string;
  providerId?: string | null;
  routeId?: string | null;
}): void {
  adjustConcurrency(bucketKey("company", input.companyId), -1);
  if (input.providerId) {
    adjustConcurrency(bucketKey("provider", input.providerId), -1);
  }
  if (input.routeId) {
    adjustConcurrency(bucketKey("route", input.routeId), -1);
  }
}

function isTpsExceeded(
  key: string,
  maxTps: number,
  now: number,
): { exceeded: boolean; waitMs?: number } {
  const count = getWindowCount(key, now);
  if (count >= maxTps) {
    const b = tpsWindows.get(key);
    const elapsed = b ? now - b.windowStart : 0;
    return { exceeded: true, waitMs: Math.max(50, TPS_WINDOW_MS - elapsed) };
  }
  return { exceeded: false };
}

/** Solo ventanas TPS en memoria (sin consultas a BD). Para render del panel Enviar SMS. */
export function checkTpsWindowAllowed(input: {
  companyId: string;
  providerId?: string | null;
  routeId?: string | null;
  effectiveTps: number;
}): { allowed: boolean; reason?: string; waitMs?: number } {
  const now = Date.now();
  const scopes = [
    bucketKey("company", input.companyId),
    bucketKey("platform", "global"),
  ];
  if (input.providerId) {
    scopes.push(bucketKey("provider", input.providerId));
  }
  if (input.routeId) {
    scopes.push(bucketKey("route", input.routeId));
  }
  for (const key of scopes) {
    const { exceeded, waitMs } = isTpsExceeded(key, input.effectiveTps, now);
    if (exceeded) {
      return {
        allowed: false,
        waitMs,
        reason:
          "Tu cuenta tiene un límite temporal de envío. Intenta nuevamente en unos segundos.",
      };
    }
  }
  return { allowed: true };
}

export async function canSendNow(input: {
  companyId: string;
  providerId?: string | null;
  routeId?: string | null;
  ratePlanId?: string | null;
  trafficType?: string;
  flow?: TrafficFlowKind;
  segmentCost?: number;
}): Promise<CanSendNowResult> {
  const flow = input.flow ?? "mock";
  const policy = await resolveTrafficPolicy({
    companyId: input.companyId,
    providerId: input.providerId,
    routeId: input.routeId,
    ratePlanId: input.ratePlanId,
    trafficType: input.trafficType,
  });

  const block = await evaluatePolicyBlocks(policy, input, flow);
  if (block) {
    return {
      allowed: false,
      effectiveTps: policy.effective_tps,
      waitMs: block.waitMs,
      reason: block.reason,
      policy,
    };
  }

  return { allowed: true, effectiveTps: policy.effective_tps, policy };
}

async function evaluatePolicyBlocks(
  policy: ResolvedTrafficPolicy,
  input: {
    companyId: string;
    providerId?: string | null;
    routeId?: string | null;
    segmentCost?: number;
  },
  flow: TrafficFlowKind,
): Promise<{ reason: string; waitMs?: number } | null> {
  const company = await findCompanyById(input.companyId);
  if (!company || company.status !== "active") {
    return { reason: "La cuenta empresa no está activa." };
  }

  const wallet = await getOrCreateCompanyWallet(input.companyId);
  if (wallet.status !== "active") {
    return { reason: "El saldo SMS no está disponible para envíos." };
  }

  if (
    input.segmentCost != null &&
    input.segmentCost > 0 &&
    wallet.available_sms < input.segmentCost
  ) {
    return {
      reason:
        "No tienes saldo SMS suficiente para procesar este envío. Compra una nueva bolsa o reduce el mensaje.",
    };
  }

  if (flow === "live_test" && !policy.live_enabled) {
    return {
      reason: "El envío real no está habilitado para tu cuenta. Contacta a soporte Telvoice.",
    };
  }

  if (
    flow === "campaign" &&
    !policy.campaigns_enabled &&
    !policy.live_enabled
  ) {
    return { reason: "Las campañas masivas no están habilitadas para tu cuenta." };
  }

  if (flow === "api" && !policy.api_enabled) {
    return { reason: "El envío por API no está habilitado para tu cuenta." };
  }

  if (input.providerId) {
    const provider = await getSmsProviderById(input.providerId);
    if (!provider) {
      return { reason: "Proveedor SMS no disponible." };
    }
    if (provider.status === "suspended" || provider.status === "inactive") {
      return { reason: "El proveedor SMS no está disponible temporalmente." };
    }
    const provConc = provider.max_concurrent_requests ?? 1;
    if (getConcurrency(bucketKey("provider", input.providerId)) >= provConc) {
      return {
        reason: "Tu cuenta tiene un límite temporal de envío. Intenta nuevamente en unos segundos.",
        waitMs: 500,
      };
    }
  }

  if (input.routeId) {
    const route = await getSmsRouteById(input.routeId);
    if (!route) {
      return { reason: "La ruta SMS no está disponible temporalmente." };
    }
    if (route.status === "paused" || route.status === "inactive") {
      return { reason: "La ruta SMS no está disponible temporalmente." };
    }
    if (route.status !== "active" && route.status !== "testing") {
      return { reason: "La ruta SMS no está disponible temporalmente." };
    }
    const routeConc = route.max_concurrent_requests ?? 1;
    if (getConcurrency(bucketKey("route", input.routeId)) >= routeConc) {
      return {
        reason: "Tu cuenta tiene un límite temporal de envío. Intenta nuevamente en unos segundos.",
        waitMs: 500,
      };
    }
  }

  const enforceDaily = isDailySendLimitEnforced();
  if (enforceDaily && policy.daily_limit != null) {
    const used =
      flow === "live_test"
        ? await countDailyLiveTestMessages(input.companyId)
        : await countDailySentForCompany(input.companyId);
    if (used >= policy.daily_limit) {
      return {
        reason: "El límite diario de envíos reales fue alcanzado.",
      };
    }
  }

  if (enforceDaily && flow === "live_test") {
    const envDaily = getLiveTestLimiterConfig().dailyLimit;
    const envUsed = await countDailyLiveTestMessages(input.companyId);
    if (envUsed >= envDaily && envDaily < 999_999) {
      return {
        reason: "El límite diario de envíos reales fue alcanzado.",
      };
    }
  }

  const now = Date.now();
  const effective = policy.effective_tps;
  const scopes: { key: string; label: string }[] = [
    { key: bucketKey("company", input.companyId), label: "cliente" },
    { key: bucketKey("platform", "global"), label: "plataforma" },
  ];
  if (input.providerId) {
    scopes.push({
      key: bucketKey("provider", input.providerId),
      label: "proveedor",
    });
  }
  if (input.routeId) {
    scopes.push({ key: bucketKey("route", input.routeId), label: "ruta" });
  }

  for (const { key } of scopes) {
    const { exceeded, waitMs } = isTpsExceeded(key, effective, now);
    if (exceeded) {
      return {
        reason:
          "Tu cuenta tiene un límite temporal de envío. Intenta nuevamente en unos segundos.",
        waitMs,
      };
    }
  }

  return null;
}

async function countDailySentForCompany(companyId: string): Promise<number> {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const { count, error } = await getSupabase()
    .from("panel_sms_messages")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .in("status", ["sent", "delivered", "pending", "accepted"])
    .gte("created_at", d.toISOString());

  if (error) {
    if (isMissingTableError(error)) {
      return 0;
    }
    return 0;
  }
  return count ?? 0;
}

/** Bloquea envío si canSendNow no permite (mensajes amigables). */
export async function assertCanSendNow(
  input: Parameters<typeof canSendNow>[0],
): Promise<ResolvedTrafficPolicy> {
  const result = await canSendNow(input);
  if (!result.allowed) {
    throw new AppError(
      result.reason ?? "Envío temporalmente no disponible.",
      429,
    );
  }
  return result.policy!;
}
