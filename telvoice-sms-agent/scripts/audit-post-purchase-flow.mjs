#!/usr/bin/env node
/** Read-only: audita flujo post-compra (órdenes paid/credited recientes y casos conocidos). */
import "dotenv/config";

const emailArg = process.argv.find((a) => a.startsWith("--email="))?.slice(8)?.trim().toLowerCase();
const limitArg = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? "25");

const KNOWN_CASES = [
  "arturo.aguilar@talkchile.cl",
  "jaoyarzu@gmail.com",
  "geaed2003@icloud.com",
  "victor@telvoice.net",
];

const { getSupabase } = await import("../src/database/supabaseClient.ts");
const { normalizeAuditEmail } = await import("../src/services/adminDataAuditClassifier.ts");
const { runPostCreditPurchaseFlow } = await import(
  "../src/services/paidPurchasePostProcessingService.ts"
);

const sb = getSupabase();

async function ordersForAudit() {
  if (emailArg) {
    const norm = normalizeAuditEmail(emailArg);
    const { data } = await sb
      .from("sms_orders")
      .select("id")
      .or(`checkout_email.ilike.${norm},payer_email.ilike.${norm}`)
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false });
    return (data ?? []).map((r) => r.id);
  }

  const emails = [...new Set([...KNOWN_CASES])];
  const ids = new Set();

  for (const em of emails) {
    const norm = normalizeAuditEmail(em);
    const { data } = await sb
      .from("sms_orders")
      .select("id")
      .or(`checkout_email.ilike.${norm},payer_email.ilike.${norm}`)
      .eq("payment_status", "paid");
    for (const row of data ?? []) ids.add(row.id);
  }

  const { data: recent } = await sb
    .from("sms_orders")
    .select("id")
    .eq("payment_status", "paid")
    .in("credit_status", ["credited", "pending_claim"])
    .order("created_at", { ascending: false })
    .limit(limitArg);

  for (const row of recent ?? []) ids.add(row.id);

  return [...ids];
}

function summarize(result) {
  const receiptReal = result.emails.receipt.deliveryConfirmed;
  const welcomeReal = result.emails.welcome.deliveryConfirmed;
  const activationReal = result.emails.activation_notice.deliveryConfirmed;

  let risk = [...result.risk];
  if (result.action === "qa_blocked") risk.push("qa_blocked");
  if (!result.walletCreditExists && result.credited) risk.push("credited_without_purchase_credit");
  if (result.credited && !receiptReal) risk.push("missing_receipt_real");
  if (result.credited && !welcomeReal) risk.push("missing_welcome_real");
  if (result.credited && !activationReal) risk.push("missing_activation_real");
  if (result.wouldSendEmails.length > 0) risk.push(`would_resend:${result.wouldSendEmails.join(",")}`);

  return {
    order_id: result.orderId,
    buyer_email: result.buyerEmail,
    company_id: result.companyId,
    credited: result.credited,
    action: result.action,
    wallet_credit_exists: result.walletCreditExists,
    invoice_exists: result.invoiceExists,
    receipt_real_sent: receiptReal,
    welcome_real_sent: welcomeReal,
    activation_notice_real_sent: activationReal,
    payment_received_pending_claim_sent: result.emails.payment_received_pending_claim_sent,
    missing_steps: result.missingSteps,
    would_send_emails: result.wouldSendEmails,
    risk: [...new Set(risk)],
    email_status: {
      receipt: result.emails.receipt.status,
      welcome: result.emails.welcome.status,
      activation: result.emails.activation_notice.status,
    },
  };
}

const orderIds = await ordersForAudit();
const rows = [];

for (const orderId of orderIds) {
  const result = await runPostCreditPurchaseFlow(orderId, {
    dryRun: true,
    skipEmails: true,
    skipProdRealMark: true,
  });
  rows.push(summarize(result));
}

console.log(
  JSON.stringify(
    {
      mode: "read_only_audit",
      orders_audited: rows.length,
      at: new Date().toISOString(),
      known_cases: KNOWN_CASES.map((email) => ({
        email,
        orders: rows.filter((r) => r.buyer_email === normalizeAuditEmail(email)),
      })),
      rows: rows.sort((a, b) => a.order_id.localeCompare(b.order_id)),
    },
    null,
    2,
  ),
);
