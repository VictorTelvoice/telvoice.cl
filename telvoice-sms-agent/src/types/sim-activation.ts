export type SimActivationStatus =
  | "pending_payment"
  | "paid_pending_activation"
  | "activation_review"
  | "number_reserved"
  | "number_assigned"
  | "active"
  | "rejected"
  | "cancelled";

export type SimPlanId = "sim_starter" | "sim_pro" | "sim_power";

export type SimActivationRequestRow = {
  id: string;
  order_id: string;
  company_id: string | null;
  checkout_email: string;
  payer_name: string | null;
  company_name: string | null;
  phone: string | null;
  tax_id: string | null;
  plan_id: SimPlanId | string;
  plan_name: string;
  included_sms_monthly: number;
  activation_status: SimActivationStatus;
  client_number_id: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  rejected_at: string | null;
};

export type SimActivationRequestListItem = SimActivationRequestRow & {
  public_checkout_reference: string | null;
  order_amount: number | null;
  order_currency: string | null;
  company_display_name: string | null;
};
