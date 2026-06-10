#!/usr/bin/env node
/** Read-only: audita cadena de correos post-compra por email. */
import "dotenv/config";

const email = process.argv.find((a) => a.startsWith("--email="))?.slice(8)?.trim().toLowerCase();
if (!email) {
  console.error("Uso: --email=user@domain.com");
  process.exit(1);
}

const { getSupabase } = await import("../src/database/supabaseClient.ts");
const { normalizeAuditEmail } = await import("../src/services/adminDataAuditClassifier.ts");

const norm = normalizeAuditEmail(email);
const sb = getSupabase();

const { data: orders } = await sb
  .from("sms_orders")
  .select("id,checkout_email,payer_email,payment_status,credit_status,sms_quantity,company_id")
  .or(`checkout_email.ilike.${norm},payer_email.ilike.${norm}`)
  .eq("payment_status", "paid");

for (const order of orders ?? []) {
  const orderId = order.id;
  const { data: invoices } = await sb
    .from("billing_invoices")
    .select("id,invoice_number,status,payment_status,created_at")
    .eq("order_id", orderId);

  const { data: billingLogs } = await sb
    .from("billing_email_logs")
    .select(
      "id,invoice_id,email_type,to_email,to_email_normalized,status,subject,provider,provider_message_id,sent_at,error_message,metadata,created_at",
    )
    .or(`to_email_normalized.eq.${norm},to_email.ilike.${norm}`);

  const orderBilling = (billingLogs ?? []).filter(
    (r) =>
      r.invoice_id &&
      (invoices ?? []).some((i) => i.id === r.invoice_id),
  );

  const { data: emailLogs } = await sb
    .from("email_logs")
    .select(
      "id,order_id,invoice_id,template_key,recipient_email,status,provider,provider_message_id,sent_at,error_message,metadata,created_at",
    )
    .eq("order_id", orderId);

  console.log(
    JSON.stringify(
      {
        email: norm,
        orderId,
        order,
        invoices: invoices ?? [],
        billing_email_logs: orderBilling,
        email_logs: emailLogs ?? [],
        summary: {
          hasInvoice: (invoices ?? []).length > 0,
          purchase_receipt_billing: orderBilling.filter(
            (r) => r.email_type === "purchase_receipt",
          ),
          purchase_activation_billing: orderBilling.filter(
            (r) => r.email_type === "purchase_activation_notice",
          ),
          payment_received_claim: (emailLogs ?? []).filter(
            (r) => r.template_key === "payment_received_pending_claim",
          ),
          welcome_sms_credited: (emailLogs ?? []).filter(
            (r) => r.template_key === "welcome_sms_credited",
          ),
          purchase_activation_notice: (emailLogs ?? []).filter(
            (r) => r.template_key === "purchase_activation_notice",
          ),
          invoice_receipt_email_logs: (emailLogs ?? []).filter(
            (r) => r.template_key === "invoice_receipt",
          ),
        },
      },
      null,
      2,
    ),
  );
}
