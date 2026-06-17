export type SimSubscriptionStatus =
  | "pending"
  | "authorized"
  | "active"
  | "paused"
  | "cancelled"
  | "failed";

export type SimSubscriptionRow = {
  id: string;
  order_id: string;
  company_id: string | null;
  checkout_email: string;
  inventory_number_id: string | null;
  client_number_id: string | null;
  plan_id: string;
  included_sms_monthly: number;
  monthly_amount_clp: number;
  currency: string;
  mercadopago_preapproval_id: string | null;
  status: SimSubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  next_billing_date: string | null;
  last_payment_id: string | null;
  last_credit_at: string | null;
  activated_at: string | null;
  cancelled_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
