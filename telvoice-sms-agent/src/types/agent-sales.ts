export type AgentSalesEventType =
  | "quote_created"
  | "payment_link_created"
  | "payment_link_reused"
  | "order_paid"
  | "insufficient_balance_detected"
  | "manual_quote_requested"
  | "blocked_campaign_recovered";

export type AgentSalesDateRange =
  | "all"
  | "today"
  | "7d"
  | "30d"
  | "month";

export type AgentSalesFilters = {
  dateRange: AgentSalesDateRange;
  companyId?: string;
  paymentStatus?: "all" | "pending" | "paid" | "cancelled";
  channel?: "all" | "web_client" | "landing" | "telegram";
  source?: "all" | "agent_panel" | "web_agent";
  minSms?: number;
  maxSms?: number;
  tab?: "overview" | "orders" | "blocked";
};

export type AgentSalesKpis = {
  quotesGenerated: number;
  paymentLinksGenerated: number;
  pendingOrders: number;
  paidOrders: number;
  smsSold: number;
  potentialAmountClp: number;
  paidAmountClp: number;
  blockedByBalance: number;
  conversionRate: number;
  averagePaidOrderClp: number;
  purchaseIntentConversations: number;
};

export type AgentSalesOrderRow = {
  id: string;
  created_at: string;
  company_id: string | null;
  company_name: string | null;
  contact_email: string | null;
  sms_quantity: number;
  subtotal_net: number | null;
  iva: number | null;
  amount: number;
  payment_status: string;
  credit_status: string;
  source: string;
  channel: string;
  checkout_url: string | null;
  preference_id: string | null;
  agent_session_id: string | null;
  payment_link_reused: boolean;
};

export type AgentBlockedCampaignRow = {
  id: string;
  created_at: string;
  company_id: string | null;
  company_name: string | null;
  session_id: string | null;
  available_sms: number;
  required_sms: number;
  shortfall_sms: number;
  recommended_bag: number;
  generated_payment_link: boolean;
  order_id: string | null;
  order_paid: boolean;
  metadata: Record<string, unknown>;
};
