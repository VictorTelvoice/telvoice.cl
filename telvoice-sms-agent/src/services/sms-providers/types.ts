export type SmsProviderSendInput = {
  to: string;
  message: string;
  senderId: string;
  metadata?: Record<string, unknown>;
};

export type SmsProviderSendResult = {
  provider: string;
  provider_message_id: string | null;
  status: "sent" | "pending" | "failed";
  raw_response: Record<string, unknown>;
  accepted: boolean;
  error_code?: string;
  error_message?: string;
  asmsc_uid?: string;
};

export type SmsProviderName = "mock" | "real_api";
