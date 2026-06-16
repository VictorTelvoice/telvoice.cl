export type ClientApiKeyStatus = "active" | "paused" | "revoked" | "expired";

export type ClientApiKeyEnvironment = "sandbox" | "production";

export type ClientApiKeyScope = "balance:read" | "messages:read" | "sms:send";

export const CLIENT_API_KEY_SCOPES: readonly ClientApiKeyScope[] = [
  "balance:read",
  "messages:read",
  "sms:send",
] as const;

export type ClientApiKey = {
  id: string;
  companyId: string;
  name: string;
  keyPrefix: string;
  keyMasked: string;
  status: ClientApiKeyStatus;
  scopes: ClientApiKeyScope[];
  environment: ClientApiKeyEnvironment;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  createdAt: string;
  updatedAt: string;
  productionApproved: boolean;
  productionApprovedAt: string | null;
  productionApprovedByAdminId: string | null;
  productionApprovalNotes: string | null;
};

export type ClientApiKeyRow = {
  id: string;
  company_id: string;
  created_by_user_id: string | null;
  name: string;
  key_prefix: string;
  key_hash: string;
  key_masked: string;
  status: string;
  scopes: unknown;
  environment: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  metadata: Record<string, unknown> | null;
  source: string;
  created_at: string;
  updated_at: string;
  production_approved?: boolean;
  production_approved_at?: string | null;
  production_approved_by_admin_id?: string | null;
  production_approval_notes?: string | null;
};

export type CreateClientApiKeyInput = {
  companyId: string;
  createdByUserId?: string | null;
  name: string;
  environment: ClientApiKeyEnvironment;
  scopes: ClientApiKeyScope[];
  expiresAt?: string | null;
};

export type UpdateClientApiKeyInput = {
  name?: string;
  scopes?: ClientApiKeyScope[];
};

export type CreatedClientApiKeyResult = {
  key: ClientApiKey;
  plainTextKey: string;
  autoApproved?: boolean;
};

export type ClientApiKeysModuleState = {
  available: boolean;
  migrationPending: boolean;
};

export type ClientApiKeyServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; missingTable?: boolean; code?: string };

export type AuthenticatedApiKeyContext = {
  apiKeyId: string;
  companyId: string;
  environment: ClientApiKeyEnvironment;
  scopes: ClientApiKeyScope[];
  keyPrefix: string;
  productionApproved: boolean;
};

export type ApiKeyAuthErrorCode =
  | "MISSING_API_KEY"
  | "INVALID_API_KEY_FORMAT"
  | "INVALID_API_KEY"
  | "API_KEY_PAUSED"
  | "API_KEY_REVOKED"
  | "API_KEY_EXPIRED"
  | "INSUFFICIENT_SCOPE"
  | "INTERNAL_ERROR";

export type ApiKeyAuthResult =
  | { ok: true; context: AuthenticatedApiKeyContext }
  | {
      ok: false;
      statusCode: number;
      code: ApiKeyAuthErrorCode;
      message: string;
      resolved?: {
        apiKeyId: string;
        companyId: string;
        environment: ClientApiKeyEnvironment | null;
      };
    };
