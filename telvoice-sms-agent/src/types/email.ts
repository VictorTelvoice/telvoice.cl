export type EmailLogStatus = "pending" | "sent" | "failed" | "skipped";

export type TransactionalTemplateKey =
  | "payment_received_pending_claim"
  | "welcome_sms_credited"
  | "invoice_receipt"
  | "purchase_activation_notice"
  | "new_customer_purchase_internal_alert";

export interface EmailLogRow {
  id: string;
  company_id: string | null;
  user_id: string | null;
  order_id: string | null;
  invoice_id: string | null;
  recipient_email: string;
  template_key: TransactionalTemplateKey | string;
  subject: string;
  status: EmailLogStatus;
  provider: string;
  provider_message_id: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  sent_at: string | null;
}

export type SendTransactionalEmailInput = {
  templateKey: TransactionalTemplateKey | string;
  subject: string;
  recipientEmail: string;
  html: string;
  text: string;
  orderId?: string | null;
  invoiceId?: string | null;
  companyId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
  skipIdempotency?: boolean;
};
