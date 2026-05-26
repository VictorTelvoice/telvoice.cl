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

export type BillingEmailStatus = "pending" | "sent" | "failed" | "retrying";

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
  | "invoice.previewed";

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

