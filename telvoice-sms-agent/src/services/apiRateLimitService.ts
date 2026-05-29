import { getSupabase } from "../database/supabaseClient.js";
import type {
  ApiRateLimitCheckResult,
  ApiRateLimitConfig,
  ApiRateLimitContext,
  ApiRateLimitHeaders,
  ApiRateLimitScope,
} from "../types/api-rate-limit.js";
import type { ClientApiKeyEnvironment } from "../types/client-api-keys.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

const DEFAULTS: Record<ClientApiKeyEnvironment, ApiRateLimitConfig> = {
  sandbox: { perMinutePerApiKey: 30, perDayPerCompany: 500 },
  production: { perMinutePerApiKey: 120, perDayPerCompany: 10_000 },
};

function parseLimitEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw || !/^\d+$/.test(raw)) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return n > 0 ? n : fallback;
}

export function getRateLimitConfig(
  environment: ClientApiKeyEnvironment,
): ApiRateLimitConfig {
  const defaults = DEFAULTS[environment];
  const prefix = environment === "production" ? "PRODUCTION" : "SANDBOX";
  return {
    perMinutePerApiKey: parseLimitEnv(
      `API_RATE_LIMIT_${prefix}_MINUTE`,
      defaults.perMinutePerApiKey,
    ),
    perDayPerCompany: parseLimitEnv(
      `API_RATE_LIMIT_${prefix}_DAY`,
      defaults.perDayPerCompany,
    ),
  };
}

function oneMinuteAgoIso(): string {
  return new Date(Date.now() - 60_000).toISOString();
}

function startOfUtcDayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function secondsUntilNextUtcMidnight(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000));
}

function minuteWindowResetUnix(): number {
  return Math.ceil(Date.now() / 60_000) * 60;
}

function dayWindowResetUnix(): number {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

async function countRequests(filters: {
  apiKeyId?: string;
  companyId?: string;
  sinceIso: string;
}): Promise<number> {
  let query = getSupabase()
    .from("client_api_requests")
    .select("id", { count: "exact", head: true })
    .gte("created_at", filters.sinceIso)
    .or("error_code.is.null,error_code.neq.RATE_LIMIT_EXCEEDED");

  if (filters.apiKeyId) {
    query = query.eq("api_key_id", filters.apiKeyId);
  }
  if (filters.companyId) {
    query = query.eq("company_id", filters.companyId);
  }

  const { count, error } = await query;
  if (error) {
    if (isMissingTableError(error)) {
      return 0;
    }
    wrapSupabaseError(error, "countRequests");
  }
  return count ?? 0;
}

async function oldestRequestInWindow(filters: {
  apiKeyId?: string;
  companyId?: string;
  sinceIso: string;
}): Promise<Date | null> {
  let query = getSupabase()
    .from("client_api_requests")
    .select("created_at")
    .gte("created_at", filters.sinceIso)
    .or("error_code.is.null,error_code.neq.RATE_LIMIT_EXCEEDED")
    .order("created_at", { ascending: true })
    .limit(1);

  if (filters.apiKeyId) {
    query = query.eq("api_key_id", filters.apiKeyId);
  }
  if (filters.companyId) {
    query = query.eq("company_id", filters.companyId);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "oldestRequestInWindow");
  }
  const row = data?.[0] as { created_at?: string } | undefined;
  return row?.created_at ? new Date(row.created_at) : null;
}

function buildAllowedHeaders(
  limit: number,
  currentCount: number,
  resetAtUnix: number,
): ApiRateLimitHeaders {
  const remaining = Math.max(0, limit - currentCount - 1);
  return { limit, remaining, resetAtUnix };
}

function buildDeniedHeaders(
  limit: number,
  resetAtUnix: number,
  retryAfterSeconds: number,
): ApiRateLimitHeaders {
  return {
    limit,
    remaining: 0,
    resetAtUnix,
    retryAfterSeconds,
  };
}

async function checkScopeLimit(input: {
  scope: ApiRateLimitScope;
  limit: number;
  apiKeyId?: string;
  companyId?: string;
  sinceIso: string;
  resetAtUnix: number;
  retryAfterFallback: () => number;
}): Promise<ApiRateLimitCheckResult> {
  const count = await countRequests({
    apiKeyId: input.apiKeyId,
    companyId: input.companyId,
    sinceIso: input.sinceIso,
  });

  if (count < input.limit) {
    return {
      allowed: true,
      headers: buildAllowedHeaders(input.limit, count, input.resetAtUnix),
    };
  }

  const oldest = await oldestRequestInWindow({
    apiKeyId: input.apiKeyId,
    companyId: input.companyId,
    sinceIso: input.sinceIso,
  });

  let retryAfterSeconds = input.retryAfterFallback();
  if (input.scope === "api_key_minute" && oldest) {
    retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest.getTime() + 60_000 - Date.now()) / 1000),
    );
  }

  return {
    allowed: false,
    scope: input.scope,
    limit: input.limit,
    retryAfterSeconds,
    headers: buildDeniedHeaders(
      input.limit,
      input.resetAtUnix,
      retryAfterSeconds,
    ),
  };
}

export async function checkApiRateLimit(
  context: ApiRateLimitContext,
): Promise<ApiRateLimitCheckResult> {
  const { getEffectiveRateLimitConfig } = await import("./apiRateLimitOverrideService.js");
  const config = await getEffectiveRateLimitConfig(
    context.companyId,
    context.apiKeyId,
    context.environment,
  );

  const minuteCheck = await checkScopeLimit({
    scope: "api_key_minute",
    limit: config.perMinutePerApiKey,
    apiKeyId: context.apiKeyId,
    sinceIso: oneMinuteAgoIso(),
    resetAtUnix: minuteWindowResetUnix(),
    retryAfterFallback: () =>
      Math.max(1, minuteWindowResetUnix() - Math.floor(Date.now() / 1000)),
  });

  if (minuteCheck && !minuteCheck.allowed) {
    return minuteCheck;
  }

  const dayCheck = await checkScopeLimit({
    scope: "company_day",
    limit: config.perDayPerCompany,
    companyId: context.companyId,
    sinceIso: startOfUtcDayIso(),
    resetAtUnix: dayWindowResetUnix(),
    retryAfterFallback: secondsUntilNextUtcMidnight,
  });

  if (dayCheck && !dayCheck.allowed) {
    return dayCheck;
  }

  const minuteHeaders =
    minuteCheck?.allowed === true
      ? minuteCheck.headers
      : buildAllowedHeaders(
          config.perMinutePerApiKey,
          0,
          minuteWindowResetUnix(),
        );

  return {
    allowed: true,
    headers: minuteHeaders,
  };
}

export function applyRateLimitHeaders(
  res: { setHeader: (name: string, value: string | number) => void },
  headers: ApiRateLimitHeaders,
): void {
  res.setHeader("X-RateLimit-Limit", headers.limit);
  res.setHeader("X-RateLimit-Remaining", headers.remaining);
  res.setHeader("X-RateLimit-Reset", headers.resetAtUnix);
  if (headers.retryAfterSeconds != null) {
    res.setHeader("Retry-After", headers.retryAfterSeconds);
  }
}

export function buildRateLimitExceededBody(
  requestId: string,
  scope: ApiRateLimitScope,
  limit: number,
  retryAfterSeconds: number,
) {
  return {
    success: false as const,
    request_id: requestId,
    error: {
      code: "RATE_LIMIT_EXCEEDED" as const,
      message: "Rate limit exceeded. Please retry later.",
    },
    rate_limit: {
      scope,
      limit,
      retry_after_seconds: retryAfterSeconds,
    },
  };
}
