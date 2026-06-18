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

export type PublicInventoryEligibilityCode =
  | "public_sellable"
  | "pending_connection"
  | "webhook_missing"
  | "qa_only"
  | "held_by_pending_order"
  | "sold_pending_activation"
  | "active_assigned"
  | "reserved"
  | "not_sellable"
  | "suspended";

export type PublicInventoryFilterCategory =
  | "all"
  | "public_sellable"
  | "pending_connection"
  | "held_by_checkout"
  | "sold"
  | "assigned"
  | "qa_not_sellable";

export type PendingInventoryHold = {
  orderId: string;
  orderCode: string;
  email: string | null;
  planId: string | null;
  createdAt: string;
  ageHours: number;
  reservationExpired: boolean;
};

export type PublicInventoryEligibility = {
  eligible: boolean;
  code: PublicInventoryEligibilityCode;
  label: string;
  reason: string;
  filterCategory: Exclude<PublicInventoryFilterCategory, "all">;
  heldOrder?: PendingInventoryHold;
  canMarkConnected: boolean;
  canBulkMarkConnected: boolean;
  canReleaseExpiredHold: boolean;
  canMarkNotForSale: boolean;
  canAssign: boolean;
};

export type PublicStockSummary = {
  publicSellable: number;
  pendingConnection: number;
  heldByCheckout: number;
  soldPendingActivation: number;
  activeAssigned: number;
  qaNotSellable: number;
};

export type InventoryPublicDashboardRow = {
  row: RealNumberInventoryRow;
  eligibility: PublicInventoryEligibility;
};
