export type SmsApiMessageStatus =
  | "sandbox_accepted"
  | "sandbox_rejected"
  | "pending"
  | "sent"
  | "delivered"
  | "failed"
  | "expired"
  | "rejected";

export type SmsApiMessageEnvironment = "sandbox" | "production";

export type SmsApiMessageRow = {
  id: string;
  company_id: string;
  api_key_id: string;
  request_id: string;
  external_reference: string | null;
  recipient: string;
  sender: string | null;
  message: string;
  country: string | null;
  segments: number;
  status: string;
  environment: string;
  provider_message_id: string | null;
  dlr_status: string | null;
  cost_sms: number;
  idempotency_key: string | null;
  payload_hash: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type SmsApiMessage = {
  id: string;
  companyId: string;
  apiKeyId: string;
  requestId: string;
  externalReference: string | null;
  recipient: string;
  sender: string | null;
  message: string;
  country: string | null;
  segments: number;
  status: SmsApiMessageStatus;
  environment: SmsApiMessageEnvironment;
  providerMessageId: string | null;
  dlrStatus: string | null;
  costSms: number;
  createdAt: string;
  updatedAt: string;
};

export type SmsApiSendPayload = {
  to: string;
  message: string;
  sender?: string | null;
  country?: string | null;
  external_reference?: string | null;
};

export type SmsApiMessagesModuleState = {
  available: boolean;
  migrationPending: boolean;
};

export type SmsApiSendValidationError = {
  statusCode: number;
  code: string;
  message: string;
};

export type CreateSandboxSmsApiMessageInput = {
  companyId: string;
  apiKeyId: string;
  requestId: string;
  recipient: string;
  message: string;
  sender?: string | null;
  country?: string | null;
  externalReference?: string | null;
  segments: number;
  idempotencyKey?: string | null;
  payloadHash?: string | null;
  environment?: SmsApiMessageEnvironment;
};

export type SandboxSmsSendResolution =
  | { outcome: "created"; message: SmsApiMessage }
  | { outcome: "replay"; message: SmsApiMessage }
  | { outcome: "conflict" };

export type ProductionSmsSendResolution = SandboxSmsSendResolution;

export const SMS_API_MESSAGE_STATUSES: readonly SmsApiMessageStatus[] = [
  "sandbox_accepted",
  "sandbox_rejected",
  "pending",
  "sent",
  "delivered",
  "failed",
  "expired",
  "rejected",
] as const;

export type SmsApiMessageListFilters = {
  status?: SmsApiMessageStatus;
  environment?: SmsApiMessageEnvironment;
  externalReference?: string;
  limit: number;
  before?: string;
};

export type SmsApiMessageListResult = {
  messages: SmsApiMessage[];
  nextCursor: string | null;
};

export type SmsApiMessageQueryError = {
  statusCode: number;
  code: string;
  message: string;
};
