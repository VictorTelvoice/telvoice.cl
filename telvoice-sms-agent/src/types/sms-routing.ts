export type SmsProviderStatus =
  | "active"
  | "testing"
  | "degraded"
  | "suspended"
  | "inactive";

export type SmsProviderRow = {
  id: string;
  name: string;
  code: string;
  type: string;
  status: SmsProviderStatus;
  api_base_url: string | null;
  auth_type: string;
  default_sender_id: string | null;
  supports_dlr: boolean;
  supports_unicode: boolean;
  supports_flash: boolean;
  priority: number;
  max_tps?: number;
  max_concurrent_requests?: number;
  daily_limit?: number | null;
  monthly_limit?: number | null;
  failure_threshold_percent?: number;
  auto_pause_on_failure?: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SmsRouteRow = {
  id: string;
  provider_id: string;
  name: string;
  country: string;
  mcc: string | null;
  mnc: string | null;
  operator_name: string | null;
  route_type: string;
  traffic_type: string;
  status: string;
  priority: number;
  cost_per_sms: number;
  currency: string;
  dlr_enabled: boolean;
  is_default: boolean;
  max_tps?: number;
  max_concurrent_requests?: number;
  daily_limit?: number | null;
  failure_threshold_percent?: number;
  auto_pause_on_failure?: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SmsRatePlanRow = {
  id: string;
  name: string;
  code: string;
  currency: string;
  status: string;
  description: string | null;
  default_tps?: number;
  daily_limit?: number | null;
  monthly_limit?: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SmsRatePlanDetailRow = {
  id: string;
  rate_plan_id: string;
  route_id: string;
  country: string;
  mcc: string | null;
  mnc: string | null;
  operator_name: string | null;
  traffic_type: string;
  sell_price_per_sms: number;
  cost_price_per_sms: number;
  currency: string;
  margin: number | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CompanyRatePlanRow = {
  id: string;
  company_id: string;
  rate_plan_id: string;
  country: string;
  traffic_type: string;
  status: string;
  max_tps?: number;
  daily_limit?: number | null;
  monthly_limit?: number | null;
  live_enabled?: boolean;
  campaigns_enabled?: boolean;
  api_enabled?: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ResolvedSmsRoute = {
  provider: SmsProviderRow;
  route: SmsRouteRow;
  ratePlan: SmsRatePlanRow;
  ratePlanDetail: SmsRatePlanDetailRow;
  sellPricePerSms: number;
  costPricePerSms: number;
  margin: number;
  currency: string;
};

export type SmsRouteWithProvider = SmsRouteRow & {
  provider?: SmsProviderRow | null;
  provider_name?: string;
  provider_code?: string;
};

export type SmsRatePlanDetailEnriched = SmsRatePlanDetailRow & {
  route?: SmsRouteRow | null;
  provider?: SmsProviderRow | null;
};
