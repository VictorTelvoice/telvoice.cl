export type DefaultRetailRatePlanConfig = {
  ratePlanId: string;
  ratePlanCode: string;
  country: string;
  maxTps: number;
  liveEnabled: boolean;
  campaignsEnabled: boolean;
  apiEnabled: boolean;
  trafficTypes: string[];
};

export type RetailRatePlanAssignmentStatus =
  | "assigned"
  | "already_assigned"
  | "skipped_already_has_active_rate_plan"
  | "failed";

export type RetailRatePlanAssignmentResult = {
  status: RetailRatePlanAssignmentStatus;
  at: string;
  source?: string;
  rate_plan_id?: string;
  rate_plan_code?: string | null;
  rate_plan_name?: string | null;
  company_rate_plan_ids?: string[];
  skipped?: boolean;
  reason?: string;
  error?: string;
};
