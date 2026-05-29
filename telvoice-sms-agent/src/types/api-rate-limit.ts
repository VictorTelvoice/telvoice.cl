import type { ClientApiKeyEnvironment } from "./client-api-keys.js";

export type ApiRateLimitScope = "api_key_minute" | "company_day";

export type ApiRateLimitConfig = {
  perMinutePerApiKey: number;
  perDayPerCompany: number;
};

export type ApiRateLimitContext = {
  companyId: string;
  apiKeyId: string;
  environment: ClientApiKeyEnvironment;
  endpoint: string;
  method: string;
  requestId: string;
};

export type ApiRateLimitHeaders = {
  limit: number;
  remaining: number;
  resetAtUnix: number;
  retryAfterSeconds?: number;
};

export type ApiRateLimitCheckResult =
  | { allowed: true; headers: ApiRateLimitHeaders }
  | {
      allowed: false;
      scope: ApiRateLimitScope;
      limit: number;
      retryAfterSeconds: number;
      headers: ApiRateLimitHeaders;
    };
