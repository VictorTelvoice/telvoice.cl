export type SmsCampaignStatus =
  | "draft"
  | "processing"
  | "sent"
  | "completed"
  | "failed"
  | "cancelled";

export type PanelSmsMessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "rejected"
  | "expired"
  | "pending";

export type SmsCampaignRow = {
  id: string;
  company_id: string;
  name: string;
  sender_id: string | null;
  message: string;
  status: SmsCampaignStatus;
  total_recipients: number;
  valid_recipients: number;
  invalid_recipients: number;
  estimated_sms_cost: number;
  real_sms_cost: number;
  mode: string;
  created_by: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PanelSmsMessageRow = {
  id: string;
  company_id: string;
  campaign_id: string | null;
  recipient_number: string;
  sender_id: string | null;
  message: string;
  segments: number;
  cost_sms: number;
  provider: string;
  provider_message_id: string | null;
  operator: string | null;
  status: PanelSmsMessageStatus;
  error_code: string | null;
  error_message: string | null;
  mode: string;
  sent_at: string | null;
  delivered_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PanelSmsMessageWithCompany = PanelSmsMessageRow & {
  company_name?: string;
  campaign_name?: string;
};

export type SmsCampaignWithCompany = SmsCampaignRow & {
  company_name?: string;
};

export type PanelDeliveryEventRow = {
  id: string;
  company_id: string;
  message_id: string;
  provider: string;
  provider_message_id: string | null;
  status: string;
  raw_payload: Record<string, unknown>;
  created_at: string;
};

export type SmsSegmentInfo = {
  characters: number;
  encoding: "GSM-7" | "UCS-2";
  segments: number;
  costSms: number;
};

export type MockSmsSendResult = {
  messageId: string;
  campaignId: string;
  recipientNumber: string;
  segments: number;
  balanceBefore: number;
  balanceAfter: number;
  status: PanelSmsMessageStatus;
  providerMessageId: string;
  sendMode?: "mock" | "live_test";
};
