import type { WholesaleStatus, WholesaleTrafficType } from "./wholesale.js";

export const SMPP_CONNECTION_STATUSES = [
  "draft",
  "testing",
  "active",
  "paused",
  "failed",
] as const;

export type SmppConnectionStatus = (typeof SMPP_CONNECTION_STATUSES)[number];

export const SMPP_BIND_TYPES = [
  "transmitter",
  "receiver",
  "transceiver",
] as const;

export type SmppBindType = (typeof SMPP_BIND_TYPES)[number];

export const SMPP_BIND_TEST_RESULTS = ["success", "failed"] as const;
export type SmppBindTestResult = (typeof SMPP_BIND_TEST_RESULTS)[number];

export const SMPP_SEND_STATUSES = ["pending", "submitted", "failed"] as const;
export type SmppSendStatus = (typeof SMPP_SEND_STATUSES)[number];

export const SMPP_DLR_STATUSES = [
  "pending",
  "delivered",
  "failed",
  "unknown",
] as const;
export type SmppDlrStatus = (typeof SMPP_DLR_STATUSES)[number];

export interface WholesaleSmppConnectionRow {
  id: string;
  provider_id: string | null;
  label: string;
  host: string;
  port: number;
  system_id: string;
  password_encrypted: string;
  system_type: string;
  bind_type: SmppBindType;
  source_addr_ton: number;
  source_addr_npi: number;
  source_address: string | null;
  tps_limit: number;
  enquire_link_interval: number;
  status: SmppConnectionStatus;
  notes: string | null;
  last_bind_ok_at: string | null;
  last_bind_failed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WholesaleSmppConnectionEnriched extends WholesaleSmppConnectionRow {
  provider_name?: string;
  last_bind_test?: WholesaleSmppBindTestRow | null;
}

export interface WholesaleSmppBindTestRow {
  id: string;
  connection_id: string;
  result: SmppBindTestResult;
  error_code: number | null;
  error_message: string | null;
  latency_ms: number | null;
  tested_at: string;
}

export interface WholesaleSmppSendTestRow {
  id: string;
  connection_id: string;
  destination_number: string;
  source_address: string | null;
  message_text: string;
  country_code: string | null;
  operator_name: string | null;
  traffic_type: WholesaleTrafficType | null;
  submit_status: SmppSendStatus;
  provider_message_id: string | null;
  command_status: number | null;
  error_message: string | null;
  dlr_status: SmppDlrStatus;
  dlr_received_at: string | null;
  sent_at: string;
}

export interface WholesaleInternationalRatePlanRow {
  id: string;
  country_name: string;
  country_iso: string;
  mcc: string | null;
  mnc: string | null;
  operator_name: string;
  traffic_type: WholesaleTrafficType;
  provider_id: string | null;
  smpp_connection_id: string | null;
  cost_price: number | null;
  sale_price: number | null;
  currency: string;
  margin: number | null;
  valid_from: string | null;
  valid_until: string | null;
  pending_price: boolean;
  status: WholesaleStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WholesaleInternationalRatePlanEnriched
  extends WholesaleInternationalRatePlanRow {
  provider_name?: string;
  smpp_connection_label?: string;
}

export interface WholesaleSmppNocSnapshot {
  connectionsTotal: number;
  connectionsActive: number;
  lastBindOk: WholesaleSmppBindTestRow | null;
  lastBindFailed: WholesaleSmppBindTestRow | null;
  lastSendTest: WholesaleSmppSendTestRow | null;
  routesLiveByCountry: { country_iso: string; count: number }[];
  ratePlansDraft: number;
  ratePlansTesting: number;
  ratePlansLive: number;
}
