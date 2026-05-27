#!/usr/bin/env node
/**
 * QA — emails transaccionales compra rápida + claim (mock, sin MP real).
 *
 * Requisitos:
 * - DATABASE_URL en .env
 * - Migraciones 027 + 028 aplicadas
 * - npm run build
 * - EMAIL_MODE=mock (default)
 *
 * Uso: node scripts/verify-transactional-emails-qa.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

process.env.EMAIL_MODE = process.env.EMAIL_MODE || "mock";
process.env.BILLING_EMAIL_MODE = process.env.BILLING_EMAIL_MODE || "mock";
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "qa-transactional-email-encryption-key";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL no está definido.");
  process.exit(1);
}

const distEmail = join(__dirname, "../dist/services/transactionalEmailService.js");
const distOrder = join(__dirname, "../dist/services/smsOrderService.js");
if (!existsSync(distEmail) || !existsSync(distOrder)) {
  console.error("Falta dist/. Ejecuta: npm run build");
  process.exit(1);
}

const {
  sendPaymentReceivedClaimEmail,
  sendWelcomeAndSmsCreditedEmail,
  sendInvoiceReceiptEmail,
  hasSentEmail,
} = await import(pathToFileURL(distEmail).toString());
const { confirmOrderCredit } = await import(pathToFileURL(distOrder).toString());

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function hashClaimToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

await client.connect();

const cleanupIds = { orderId: null, companyId: null, walletId: null, invoiceId: null };

try {
  const tableCheck = await client.query(`
    SELECT to_regclass('public.email_logs') AS email_logs,
           to_regclass('public.sms_orders') AS sms_orders
  `);
  assert(tableCheck.rows[0]?.email_logs, "Tabla email_logs no existe. Aplica migración 028.");
  assert(
    tableCheck.rows[0]?.sms_orders,
    "Tabla sms_orders no existe.",
  );

  const colCheck = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sms_orders'
      AND column_name IN ('claim_token_hash', 'checkout_email', 'credit_status')
  `);
  assert(
    colCheck.rows.length >= 3,
    "Faltan columnas claim en sms_orders. Aplica migración 027.",
  );

  const pkg = await client.query(`
    SELECT id, sms_quantity, total_price, currency, name
    FROM sms_packages WHERE is_active = true
    ORDER BY sort_order ASC LIMIT 1
  `);
  assert(pkg.rows.length, "No hay bolsas activas para QA.");
  const packageId = pkg.rows[0].id;

  const company = await client.query(`
    INSERT INTO companies (name, country, status)
    VALUES ('QA Transactional Email Co', 'CL', 'active')
    RETURNING id
  `);
  cleanupIds.companyId = company.rows[0].id;

  const wallet = await client.query(`
    INSERT INTO company_sms_wallets (company_id, country, available_sms, status)
    VALUES ($1, 'CL', 0, 'active')
    RETURNING id
  `, [cleanupIds.companyId]);
  cleanupIds.walletId = wallet.rows[0].id;

  const claimToken = randomBytes(32).toString("base64url");
  const checkoutEmail = `qa-transactional+${Date.now()}@telvoice.test`;
  const publicRef = `QA-TVE-${Date.now()}`;

  const orderIns = await client.query(
    `INSERT INTO sms_orders (
      company_id, package_id, sms_quantity, amount, currency,
      payment_provider, payment_reference, payment_status, credit_status,
      claim_token_hash, claim_status, checkout_email, payer_email,
      public_checkout_reference, metadata
    ) VALUES (
      NULL, $1, $2, $3, $4,
      'mercadopago', $5, 'paid', 'pending_claim',
      $6, 'unclaimed', $7, $7,
      $5, $8::jsonb
    ) RETURNING id`,
    [
      packageId,
      pkg.rows[0].sms_quantity,
      pkg.rows[0].total_price,
      pkg.rows[0].currency,
      publicRef,
      hashClaimToken(claimToken),
      checkoutEmail,
      JSON.stringify({
        source: "landing",
        checkout_mode: "mercadopago",
        claim_required: true,
        qa: true,
      }),
    ],
  );
  cleanupIds.orderId = orderIns.rows[0].id;
  console.log("1. Orden pública simulada:", cleanupIds.orderId);

  const emailBefore = await client.query(
    `SELECT count(*)::int AS c FROM email_logs
     WHERE order_id = $1 AND template_key = 'payment_received_pending_claim' AND status = 'sent'`,
    [cleanupIds.orderId],
  );
  assert(emailBefore.rows[0].c === 0, "No debería haber email previo");

  const payEmail1 = await sendPaymentReceivedClaimEmail(cleanupIds.orderId);
  assert(payEmail1.ok, `sendPaymentReceivedClaimEmail falló: ${payEmail1.error}`);
  console.log("3. Email payment_received_pending_claim creado");

  const payEmail2 = await sendPaymentReceivedClaimEmail(cleanupIds.orderId);
  assert(payEmail2.skipped || payEmail2.ok, "Segundo envío debería omitirse");
  const emailAfterDup = await client.query(
    `SELECT count(*)::int AS c FROM email_logs
     WHERE order_id = $1 AND template_key = 'payment_received_pending_claim' AND status = 'sent'`,
    [cleanupIds.orderId],
  );
  assert(emailAfterDup.rows[0].c === 1, "Webhook duplicado no debe duplicar email sent");
  console.log("4. Idempotencia payment email OK");

  await client.query(
    `UPDATE sms_orders SET company_id = $1, credit_status = 'pending', claim_status = 'claimed'
     WHERE id = $2`,
    [cleanupIds.companyId, cleanupIds.orderId],
  );

  const credit = await confirmOrderCredit(cleanupIds.orderId, null, {
    allowManualWithoutPaid: false,
  });
  assert(!credit.alreadyCredited || credit.order.credit_status === "credited", "Crédito SMS");
  console.log("6. SMS acreditados");

  const welcome1 = await sendWelcomeAndSmsCreditedEmail(cleanupIds.orderId);
  assert(welcome1.ok, `welcome email: ${welcome1.error}`);
  const welcome2 = await sendWelcomeAndSmsCreditedEmail(cleanupIds.orderId);
  assert(welcome2.skipped || welcome2.ok, "welcome duplicado");
  console.log("7. Email welcome_sms_credited OK");

  const walletTx = await client.query(
    `SELECT count(*)::int AS c FROM wallet_transactions
     WHERE reference_type = 'sms_order' AND reference_id = $1 AND type = 'purchase_credit'`,
    [cleanupIds.orderId],
  );
  assert(walletTx.rows[0].c === 1, "Wallet no debe duplicarse");
  console.log("12. Wallet idempotente OK");

  const distBilling = join(__dirname, "../dist/services/billingSyncService.js");
  if (existsSync(distBilling)) {
    const { ensureBillingForCreditedOrder } = await import(
      pathToFileURL(distBilling).toString()
    );
    const billing = await ensureBillingForCreditedOrder(cleanupIds.orderId, {
      source: "verify_transactional_emails_qa",
    });
    assert(billing.ok, `billing sync: ${billing.error}`);
    cleanupIds.invoiceId = billing.invoiceId ?? null;
    console.log("8-9. Invoice creado:", cleanupIds.invoiceId);

    if (cleanupIds.invoiceId) {
      const invEmail1 = await sendInvoiceReceiptEmail(cleanupIds.invoiceId);
      assert(invEmail1.ok, `invoice email: ${invEmail1.error}`);
      const invEmail2 = await sendInvoiceReceiptEmail(cleanupIds.invoiceId);
      assert(invEmail2.skipped || invEmail2.ok, "invoice email duplicado");
    }
  }

  const sentClaim = await hasSentEmail(
    cleanupIds.orderId,
    "payment_received_pending_claim",
  );
  assert(sentClaim, "hasSentEmail payment");
  console.log("10. Idempotencia claim emails OK");

  assert(process.env.EMAIL_MODE === "mock", "EMAIL_MODE debe ser mock en QA");
  console.log("13. Modo mock confirmado (sin email real)");
  console.log("OK: verify-transactional-emails-qa completado.");
} catch (err) {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  if (cleanupIds.orderId) {
    await client.query(`DELETE FROM email_logs WHERE order_id = $1`, [cleanupIds.orderId]);
    await client.query(
      `DELETE FROM billing_email_logs WHERE invoice_id IN (
         SELECT id FROM billing_invoices WHERE order_id = $1
       )`,
      [cleanupIds.orderId],
    ).catch(() => {});
    await client.query(`DELETE FROM billing_events WHERE invoice_id IN (
      SELECT id FROM billing_invoices WHERE order_id = $1
    )`, [cleanupIds.orderId]).catch(() => {});
    await client.query(`DELETE FROM billing_invoice_items WHERE invoice_id IN (
      SELECT id FROM billing_invoices WHERE order_id = $1
    )`, [cleanupIds.orderId]).catch(() => {});
    await client.query(`DELETE FROM billing_invoices WHERE order_id = $1`, [cleanupIds.orderId]).catch(() => {});
    await client.query(`DELETE FROM wallet_transactions WHERE reference_id = $1`, [cleanupIds.orderId]).catch(() => {});
    await client.query(`DELETE FROM sms_orders WHERE id = $1`, [cleanupIds.orderId]).catch(() => {});
  }
  if (cleanupIds.walletId) {
    await client.query(`DELETE FROM company_sms_wallets WHERE id = $1`, [cleanupIds.walletId]).catch(() => {});
  }
  if (cleanupIds.companyId) {
    await client.query(`DELETE FROM companies WHERE id = $1`, [cleanupIds.companyId]).catch(() => {});
  }
  await client.end();
}

if (process.exitCode) process.exit(process.exitCode);
