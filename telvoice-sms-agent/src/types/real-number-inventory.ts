export type RealNumberConnectionStatus =
  | "connected"
  | "preconfigured_pending"
  | "connection_error"
  | "disabled";

export type RealNumberSalesStatus =
  | "connected_available"
  | "preconfigured_pending"
  | "not_for_sale"
  | "reserved_pending_payment"
  | "sold_pending_activation"
  | "active_assigned"
  | "suspended"
  | "released";

export type RealNumberInventoryRow = {
  id: string;
  e164_number: string;
  country_code: string;
  provider: string;
  webhook_connected: boolean;
  connection_status: RealNumberConnectionStatus;
  sales_status: RealNumberSalesStatus;
  current_order_id: string | null;
  current_company_id: string | null;
  current_client_number_id: string | null;
  current_agent_request_id: string | null;
  reserved_until: string | null;
  gateway_id: string | null;
  sim_slot: string | null;
  webhook_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type RealNumberInventorySummary = {
  total: number;
  connected_available: number;
  preconfigured_pending: number;
  reserved: number;
  sold_pending_activation: number;
  active_assigned: number;
  not_for_sale: number;
  suspended: number;
};

export type PublicRealNumberAvailability = {
  available: number;
  in_stock: boolean;
};
