export type SmsPackageType = "prepaid" | string;

/** Resumen del catálogo para /admin/pricing */
export interface PricingCatalogSummary {
  activeCount: number;
  totalSmsInCatalog: number;
  minUnitPrice: number | null;
  maxUnitPrice: number | null;
  lastUpdatedAt: string | null;
  customerVisibleCount: number;
}

export interface SmsPackageRow {
  id: string;
  name: string;
  country: string;
  sms_quantity: number;
  unit_price: number | null;
  total_price: number;
  currency: string;
  package_type: string;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type WalletStatus = "active" | "frozen" | "suspended";

export interface CompanySmsWalletRow {
  id: string;
  company_id: string;
  country: string;
  available_sms: number;
  reserved_sms: number;
  consumed_sms: number;
  total_purchased_sms: number;
  status: WalletStatus;
  created_at: string;
  updated_at: string;
}

export type PaymentStatus =
  | "pending"
  | "paid"
  | "rejected"
  | "cancelled"
  | "refunded";

export type CreditStatus = "pending" | "credited" | "failed" | "reversed";

export interface SmsOrderRow {
  id: string;
  company_id: string;
  package_id: string | null;
  sms_quantity: number;
  amount: number;
  currency: string;
  payment_provider: string | null;
  payment_reference: string | null;
  payment_status: PaymentStatus;
  credit_status: CreditStatus;
  credited_at: string | null;
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type WalletTransactionType =
  | "purchase_credit"
  | "manual_credit"
  | "manual_debit"
  | "sms_debit"
  | "sms_refund"
  | "reserve"
  | "release_reserved"
  | "adjustment"
  | "reversal";

export interface WalletTransactionRow {
  id: string;
  company_id: string;
  wallet_id: string;
  type: WalletTransactionType | string;
  sms_amount: number;
  balance_before: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CompanyBalanceView {
  companyId: string;
  country: string;
  availableSms: number;
  reservedSms: number;
  consumedSms: number;
  totalPurchasedSms: number;
  status: WalletStatus;
  walletId: string | null;
}

export interface WalletGlobalStats {
  totalPurchasedSms: number;
  totalConsumedSms: number;
  totalAvailableSms: number;
  pendingOrders: number;
  paidPendingCredit: number;
  activeWallets: number;
  lowBalanceCompanies: number;
}

export interface SmsOrderWithDetails extends SmsOrderRow {
  company_name?: string;
  package_name?: string;
}

export interface WalletListRow extends CompanyBalanceView {
  companyName: string;
  lastTransactionAt?: string | null;
}
