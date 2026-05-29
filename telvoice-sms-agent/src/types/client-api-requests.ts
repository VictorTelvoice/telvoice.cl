import type { ClientApiKeyEnvironment } from "./client-api-keys.js";

export type ClientApiRequestMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE";

export type ClientApiRequestRow = {
  id: string;
  company_id: string | null;
  api_key_id: string | null;
  request_id: string;
  endpoint: string;
  method: string;
  environment: string | null;
  status_code: number;
  success: boolean;
  error_code: string | null;
  error_message: string | null;
  ip_address: string | null;
  user_agent: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type ClientApiRequest = {
  id: string;
  companyId: string | null;
  apiKeyId: string | null;
  requestId: string;
  endpoint: string;
  method: ClientApiRequestMethod;
  environment: ClientApiKeyEnvironment | null;
  statusCode: number;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  durationMs: number | null;
  createdAt: string;
  apiKeyName: string | null;
  apiKeyMasked: string | null;
};

export type CreateClientApiRequestLogInput = {
  companyId?: string | null;
  apiKeyId?: string | null;
  requestId: string;
  endpoint: string;
  method: ClientApiRequestMethod;
  environment?: ClientApiKeyEnvironment | null;
  statusCode: number;
  success: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
};

export type ClientApiRequestLogFilters = {
  limit?: number;
  apiKeyId?: string;
  success?: boolean;
};

export type ClientApiRequestStats = {
  total: number;
  successCount: number;
  errorCount: number;
  last24h: number;
};

export type ClientApiRequestsModuleState = {
  available: boolean;
  migrationPending: boolean;
};
