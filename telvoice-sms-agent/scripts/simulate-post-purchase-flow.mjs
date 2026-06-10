#!/usr/bin/env node
/** Dry-run: simula handlePaidPurchasePostProcessing sin enviar ni modificar. */
import "dotenv/config";

const orderId = process.argv.find((a) => a.startsWith("--order-id="))?.slice(11)?.trim();
if (!orderId) {
  console.error("Uso: --order-id=<uuid>");
  process.exit(1);
}

const skipReconcile = process.argv.includes("--skip-reconcile");

const { handlePaidPurchasePostProcessing } = await import(
  "../src/services/paidPurchasePostProcessingService.ts"
);

const result = await handlePaidPurchasePostProcessing(orderId, {
  dryRun: true,
  skipEmails: true,
  skipProdRealMark: true,
  skipReconcile,
  source: "simulate_post_purchase_flow",
});

console.log(
  JSON.stringify(
    {
      mode: "dry_run_simulation",
      at: new Date().toISOString(),
      order_id: result.orderId,
      action: result.action,
      buyer_email: result.buyerEmail,
      company_id: result.companyId,
      credited: result.credited,
      wallet_credit_exists: result.walletCreditExists,
      invoice_exists: result.invoiceExists,
      reconcile: result.reconcile,
      would_send_emails: result.wouldSendEmails,
      missing_steps: result.missingSteps,
      risk: result.risk,
      emails: {
        receipt: {
          status: result.emails.receipt.status,
          deliveryConfirmed: result.emails.receipt.deliveryConfirmed,
          reason: result.emails.receipt.reason,
        },
        welcome: {
          status: result.emails.welcome.status,
          deliveryConfirmed: result.emails.welcome.deliveryConfirmed,
          reason: result.emails.welcome.reason,
        },
        activation_notice: {
          status: result.emails.activation_notice.status,
          deliveryConfirmed: result.emails.activation_notice.deliveryConfirmed,
          reason: result.emails.activation_notice.reason,
        },
        payment_received_pending_claim_sent:
          result.emails.payment_received_pending_claim_sent,
      },
      notifications: result.notifications,
      note: "Sin envío de correos ni modificación de saldos (dryRun=true).",
    },
    null,
    2,
  ),
);
