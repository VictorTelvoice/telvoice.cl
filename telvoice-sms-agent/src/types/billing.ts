import type { CompanyRow } from "./tenant.js";
import type { SmsOrderRow } from "./wallet.js";

export type BillingInvoiceStatus =
  | "draft"
  | "pending_issue"
  | "issued"
  | "sent"
  | "paid"
  | "cancelled"
  | "failed"
  | "voided";

export type BillingDocumentType =
  | "purchase_receipt"
  | "invoice"
  | "tax_invoice"
  | "credit_note"
  | "manual_receipt";

export type BillingEmailStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "retrying";

export type BillingEventType =
  | "invoice.created"
  | "invoice.item_created"
  | "invoice.generated"
  | "invoice.sent"
  | "invoice.failed"
  | "invoice.cancelled"
  | "invoice.downloaded"
  | "invoice.manual_mark_sent"
  | "invoice.provider_synced"
  | "invoice.email_pending"
  | "invoice.email_sent"
  | "invoice.email_failed"
  | "invoice.email_skipped_duplicate"
  | "invoice.previewed"
  | "billing.sync.started"
  | "billing.sync.completed"
  | "billing.sync.failed"
  | "billing.recovery.started"
  | "billing.recovery.completed"
  | "billing.recovery.failed"
  | "invoice.email_retry_started"
  | "invoice.email_retry_completed"
  | "invoice.email_retry_failed"
  | "invoice.marked_reviewed"
  | "billing.recovery.order_marked_reviewed"
  | "billing.recovery.order_unmarked_reviewed";

export type BillingPaymentStatus =
  | "pending"
  | "paid"
  | "rejected"
  | "cancelled"
  | "refunded"
  | "manual"
  | string;

export interface BillingInvoice {
  id: string;
  company_id: string;
  order_id: string;

  invoice_number: string | null;
  document_type: BillingDocumentType;
  tax_document_type: string | null;
  status: BillingInvoiceStatus;
  payment_status: BillingPaymentStatus;

  currency: string;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  tax_rate: number;

  customer_name: string | null;
  customer_legal_name: string | null;
  customer_tax_id: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_city: string | null;
  customer_commune: string | null;
  customer_business_activity: string | null;
  customer_country: string;

  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;

  pdf_url: string | null;
  html_url: string | null;

  provider: string | null;
  provider_document_id: string | null;
  provider_status: string | null;
  provider_payload: Record<string, unknown>;

  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BillingInvoiceItem {
  id: string;
  invoice_id: string;
  order_id: string | null;
  package_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BillingEmailLog {
  id: string;
  invoice_id: string;
  company_id: string | null;
  to_email: string;
  to_email_normalized?: string | null;
  email_type?: string;
  cc_email: string | null;
  subject: string | null;
  status: BillingEmailStatus;
  provider: string | null;
  provider_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BillingEvent {
  id: string;
  invoice_id: string;
  company_id: string | null;
  event_type: BillingEventType | string;
  description: string | null;
  actor_type: string | null;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type CreateInvoiceForOrderInput = {
  orderId: string;
  /** Por defecto: true (requiere credit_status=credited). */
  requireCredited?: boolean;
  /** Forzar status inicial (por defecto issued para paid+credited). */
  initialStatus?: BillingInvoiceStatus;
};

export type InvoiceListFilters = {
  status?: BillingInvoiceStatus;
  documentType?: BillingDocumentType;
  fromDate?: string;
  toDate?: string;
  search?: string;
  limit?: number;
};

export type BillingSummary = {
  totalAmount: number;
  count: number;
  byStatus: Record<string, number>;
};

export type BillingInvoiceWithDetails = BillingInvoice & {
  items: BillingInvoiceItem[];
  events: BillingEvent[];
  email_logs: BillingEmailLog[];
};

export type AdminInvoiceListFilters = {
  status?: BillingInvoiceStatus;
  documentType?: BillingDocumentType;
  companyId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  limit?: number;
};

export type AdminInvoiceSummary = BillingSummary & {
  issuedCount: number;
  sentCount: number;
  pendingCount: number;
  failedCount: number;
  monthAmount: number;
  mercadoPagoAmount: number;
  manualAmount: number;
};

export type AdminInvoiceListRow = BillingInvoice & {
  companies?: {
    id: string;
    name: string;
    rut: string | null;
    billing_email: string | null;
  } | null;
};

export type AdminInvoiceDetail = BillingInvoiceWithDetails & {
  company: CompanyRow | null;
  order: SmsOrderRow | null;
};

export type BillingOrderBillingState =
  | "no_invoice"
  | "invoice_ready"
  | "email_sent"
  | "email_failed";

export type BillingOrderSummary = {
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  billingState: BillingOrderBillingState;
  lastEmailError: string | null;
};

export const BILLING_RECOVERY_EXCLUSION_REASONS = [
  "demo_qa_order",
  "duplicate_test",
  "manual_pending_demo",
  "customer_request",
  "other",
] as const;

export type BillingRecoveryExclusionReason =
  (typeof BILLING_RECOVERY_EXCLUSION_REASONS)[number];

export type BillingOrderRecoveryMetadata = {
  reviewed: boolean;
  excluded: boolean;
  reason: string;
  reviewed_at: string;
  reviewed_by: string;
  reviewed_by_id?: string | null;
  reviewed_by_type?: string | null;
  notes?: string | null;
  unmarked_at?: string | null;
};

export type BillingRecoverySummary = {
  ordersWithoutInvoice: number;
  ordersExcludedFromRecovery: number;
  invoicesWithoutEmail: number;
  failedEmails: number;
  failedEmailsUnreviewed: number;
  failedSyncs: number;
  pendingDocuments: number;
  lastRecoveryAt: string | null;
  hasIssues: boolean;
};

export type OrderWithoutInvoiceRow = {
  order_id: string;
  company_id: string;
  company_name: string;
  payment_provider: string | null;
  payment_reference: string | null;
  amount: number;
  currency: string;
  payment_status: string;
  credit_status: string;
  created_at: string;
  credited_at: string | null;
  billing_recovery_excluded: boolean;
  billing_recovery_reviewed: boolean;
  billing_recovery_reason: string | null;
};

export type InvoiceWithoutEmailRow = {
  invoice_id: string;
  invoice_number: string | null;
  company_id: string;
  company_name: string;
  order_id: string;
  status: string;
  billing_email: string | null;
  customer_email: string | null;
  total_amount: number;
  currency: string;
};

export type FailedBillingEmailRow = {
  email_log_id: string;
  invoice_id: string;
  invoice_number: string | null;
  company_id: string | null;
  company_name: string;
  to_email: string;
  error_message: string | null;
  created_at: string;
  reviewed: boolean;
};

export type FailedBillingSyncRow = {
  event_id: string;
  invoice_id: string;
  invoice_number: string | null;
  order_id: string | null;
  company_name: string;
  error_message: string | null;
  created_at: string;
};

export type BillingRecoveryActor = {
  actorType: string;
  actorId: string | null;
};

export type InvoiceRecoveryHints = {
  hasFailedEmail: boolean;
  hasSuccessfulEmail: boolean;
  hasSyncFailed: boolean;
  latestFailedEmailLogId: string | null;
};

