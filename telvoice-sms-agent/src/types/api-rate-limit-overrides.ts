import type { ClientApiKeyEnvironment } from "./client-api-keys.js";

export type ApiRateLimitOverrideStatus = "active" | "paused" | "disabled";

export type ApiRateLimitOverrideRow = {
  id: string;
  company_id: string;
  api_key_id: string | null;
  environment: ClientApiKeyEnvironment;
  limit_per_minute: number | null;
  limit_per_day: number | null;
  status: ApiRateLimitOverrideStatus;
  reason: string | null;
  created_by_admin_id: string | null;
  metadata: Record<string, unknown>;
  source: string;
  created_at: string;
  updated_at: string;
};

export type ApiRateLimitOverrideContext = {
  keyOverride: ApiRateLimitOverrideRow | null;
  companyOverride: ApiRateLimitOverrideRow | null;
};

export type AdminRateLimitOverrideListItem = {
  id: string;
  companyId: string;
  companyName: string | null;
  apiKeyId: string | null;
  apiKeyName: string | null;
  apiKeyMasked: string | null;
  environment: ClientApiKeyEnvironment;
  limitPerMinute: number | null;
  limitPerDay: number | null;
  status: ApiRateLimitOverrideStatus;
  reason: string | null;
  updatedAt: string;
  createdAt: string;
};

export type AdminRateLimitOverrideFilters = {
  companyId?: string;
  environment?: ClientApiKeyEnvironment | "all";
  status?: ApiRateLimitOverrideStatus | "all";
};

export type CreateAdminRateLimitOverrideInput = {
  companyId: string;
  apiKeyId?: string | null;
  environment: ClientApiKeyEnvironment;
  limitPerMinute?: number | null;
  limitPerDay?: number | null;
  reason?: string | null;
  adminId: string;
  adminEmail: string;
  adminName: string;
};

export type UpdateAdminRateLimitOverridePatch = {
  limitPerMinute?: number | null;
  limitPerDay?: number | null;
  reason?: string | null;
  status?: ApiRateLimitOverrideStatus;
  adminId: string;
  adminEmail: string;
  adminName: string;
};

export type ApiRateLimitOverrideAuditEntry = {
  id: string;
  action: "created" | "updated" | "disabled" | "paused" | "activated";
  adminId: string;
  adminEmail: string;
  adminName: string;
  at: string;
  previous?: Record<string, unknown>;
  next?: Record<string, unknown>;
};
