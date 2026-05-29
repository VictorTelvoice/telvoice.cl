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
};
