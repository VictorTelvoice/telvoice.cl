export type SmsQueueStatus =
  | "queued"
  | "processing"
  | "sent"
  | "failed"
  | "cancelled"
  | "paused";

export type SmsTrafficType =
  | "transactional"
  | "otp"
  | "promotional"
  | "mixed";

export type SmsSendQueueRow = {
  id: string;
  company_id: string;
  campaign_id: string | null;
  message_id: string | null;
  provider_id: string | null;
  route_id: string | null;
  rate_plan_id: string | null;
  priority: number;
  traffic_type: string;
  status: SmsQueueStatus;
  attempts: number;
  max_attempts: number;
  scheduled_at: string;
  locked_at: string | null;
  locked_by: string | null;
  processed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TrafficFlowKind =
  | "live_test"
  | "mock"
  | "campaign"
  | "api"
  | "queue";

export type ResolvedTrafficPolicy = {
  client_max_tps: number;
  rate_plan_tps: number;
  route_tps: number;
  provider_tps: number;
  platform_tps: number;
  max_client_tps_cap: number;
  effective_tps: number;
  daily_limit: number | null;
  monthly_limit: number | null;
  live_enabled: boolean;
  campaigns_enabled: boolean;
  api_enabled: boolean;
  reason_if_blocked: string | null;
  company_id: string;
  rate_plan_id: string | null;
  route_id: string | null;
  provider_id: string | null;
};

export type CanSendNowResult = {
  allowed: boolean;
  effectiveTps: number;
  waitMs?: number;
  reason?: string;
  policy?: ResolvedTrafficPolicy;
};
