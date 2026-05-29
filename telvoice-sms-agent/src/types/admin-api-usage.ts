import type { ClientApiKeyEnvironment, ClientApiKeyScope, ClientApiKeyStatus } from "./client-api-keys.js";
import type { ClientApiRequestMethod } from "./client-api-requests.js";
import type { SmsApiMessageEnvironment, SmsApiMessageStatus } from "./sms-api-messages.js";

export type AdminApiUsageDateRange = "all" | "today" | "7d" | "30d";

export type AdminApiUsageFilters = {
  companyId?: string;
  endpoint?: string;
  method?: ClientApiRequestMethod | "all";
  statusCode?: number;
  errorCode?: string;
  environment?: ClientApiKeyEnvironment | "all";
  dateRange?: AdminApiUsageDateRange;
  search?: string;
  success?: boolean | "all";
};

export type AdminApiUsageStats = {
  requestsLast24h: number;
  errorsLast24h: number;
  activeApiKeys: number;
  sandboxMessages: number;
  companiesWithActivity: number;
};

export type AdminApiRequestListItem = {
  id: string;
  companyId: string | null;
  companyName: string | null;
  apiKeyId: string | null;
  apiKeyName: string | null;
  apiKeyMasked: string | null;
  requestId: string;
  endpoint: string;
  method: ClientApiRequestMethod;
  environment: ClientApiKeyEnvironment | null;
  statusCode: number;
  success: boolean;
  errorCode: string | null;
  durationMs: number | null;
  createdAt: string;
};

export type AdminApiRequestDetail = AdminApiRequestListItem & {
  errorMessage: string | null;
  metadata: Record<string, unknown>;
};

export type AdminApiKeyListItem = {
  id: string;
  companyId: string;
  companyName: string | null;
  name: string;
  keyMasked: string;
  keyPrefix: string;
  environment: ClientApiKeyEnvironment;
  status: ClientApiKeyStatus;
  scopes: ClientApiKeyScope[];
  lastUsedAt: string | null;
  createdAt: string;
  productionApproved: boolean;
  productionApprovedAt: string | null;
  productionApprovalNotes: string | null;
};

export type AdminSmsApiMessageListItem = {
  id: string;
  companyId: string;
  companyName: string | null;
  recipient: string;
  sender: string | null;
  messagePreview: string;
  segments: number;
  status: SmsApiMessageStatus;
  environment: SmsApiMessageEnvironment;
  externalReference: string | null;
  costSms: number;
  createdAt: string;
};

export type AdminSmsApiMessageDetail = {
  id: string;
  companyId: string;
  companyName: string | null;
  recipient: string;
  sender: string | null;
  country: string | null;
  message: string;
  segments: number;
  status: SmsApiMessageStatus;
  environment: SmsApiMessageEnvironment;
  costSms: number;
  externalReference: string | null;
  idempotencyKey: string | null;
  providerMessageId: string | null;
  dlrStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminApiUsageModuleState = {
  requestsAvailable: boolean;
  keysAvailable: boolean;
  messagesAvailable: boolean;
  overridesAvailable: boolean;
  migrationPending: boolean;
};
