/** Estados compartidos del módulo Wholesale Core. */
export const WHOLESALE_STATUSES = [
  "draft",
  "testing",
  "approved",
  "live",
  "paused",
  "rejected",
] as const;

export type WholesaleStatus = (typeof WHOLESALE_STATUSES)[number];

export const WHOLESALE_TRAFFIC_TYPES = [
  "promotional",
  "transactional",
  "otp",
  "mixed",
] as const;

export type WholesaleTrafficType = (typeof WHOLESALE_TRAFFIC_TYPES)[number];

export const WHOLESALE_QUALITY_ESTIMATES = [
  "excellent",
  "good",
  "fair",
  "poor",
  "unknown",
] as const;

export type WholesaleQualityEstimate = (typeof WHOLESALE_QUALITY_ESTIMATES)[number];

export const WHOLESALE_PROVIDER_CONNECTION_TYPES = [
  "http_api",
  "smpp",
  "other",
] as const;

export type WholesaleProviderConnectionType =
  (typeof WHOLESALE_PROVIDER_CONNECTION_TYPES)[number];

export const WHOLESALE_CUSTOMER_CONNECTION_TYPES = [
  "api",
  "smpp",
  "manual",
] as const;

export type WholesaleCustomerConnectionType =
  (typeof WHOLESALE_CUSTOMER_CONNECTION_TYPES)[number];

export interface WholesaleProviderRow {
  id: string;
  name: string;
  code: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_whatsapp: string | null;
  country_code: string;
  connection_type: WholesaleProviderConnectionType;
  notes: string | null;
  status: WholesaleStatus;
  created_at: string;
  updated_at: string;
}

export interface WholesaleRouteRow {
  id: string;
  provider_id: string;
  country_code: string;
  country_name: string | null;
  operator_name: string;
  traffic_type: WholesaleTrafficType;
  cost: number;
  sale_price: number;
  currency: string;
  tps: number;
  quality_estimate: WholesaleQualityEstimate;
  smpp_connection_id: string | null;
  rate_plan_id: string | null;
  notes: string | null;
  status: WholesaleStatus;
  created_at: string;
  updated_at: string;
}

export interface WholesaleRouteWithProvider extends WholesaleRouteRow {
  provider_name?: string;
  provider_code?: string;
}

export interface WholesaleRateOfferRow {
  id: string;
  provider_id: string | null;
  title: string | null;
  raw_text: string;
  country_code: string | null;
  parsed_notes: string | null;
  status: WholesaleStatus;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WholesaleRateOfferWithProvider extends WholesaleRateOfferRow {
  provider_name?: string;
}

export interface WholesaleRouteTestRow {
  id: string;
  route_id: string | null;
  provider_id: string | null;
  test_number: string | null;
  destination_country: string | null;
  notes: string | null;
  result_summary: string | null;
  delivery_status: string | null;
  tested_at: string | null;
  status: WholesaleStatus;
  created_at: string;
  updated_at: string;
}

export interface WholesaleRouteTestEnriched extends WholesaleRouteTestRow {
  route_label?: string;
  provider_name?: string;
}

export interface WholesaleCustomerRow {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  whatsapp: string | null;
  country_code: string;
  country_name: string | null;
  connection_type: WholesaleCustomerConnectionType;
  monthly_volume_estimate: number | null;
  commercial_status: WholesaleStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WholesaleOpportunityRow {
  id: string;
  customer_id: string;
  country_code: string | null;
  country_name: string | null;
  traffic_type: WholesaleTrafficType;
  volume_estimate: number | null;
  target_price: number | null;
  currency: string;
  commercial_status: WholesaleStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WholesaleOpportunityWithCustomer extends WholesaleOpportunityRow {
  company_name?: string;
}

export interface WholesaleDashboardKpis {
  activeProviders: number;
  routesLive: number;
  routesTesting: number;
  pendingOffers: number;
  customers: number;
  openOpportunities: number;
}

export interface WholesaleDashboardSnapshot {
  kpis: WholesaleDashboardKpis;
  sellableRoutes: WholesaleRouteWithProvider[];
  pendingOffers: WholesaleRateOfferWithProvider[];
  recentTests: WholesaleRouteTestEnriched[];
  pipelineOpportunities: WholesaleOpportunityWithCustomer[];
  smppNoc?: import("./smpp-lab.js").WholesaleSmppNocSnapshot;
}
