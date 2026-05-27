#!/usr/bin/env node
/**
 * Envío de prueba de comprobantes Billing.
 *
 * Dry-run por defecto:
 * - Fuerza BILLING_EMAIL_MODE=mock (NO envía correo real)
 *
 * Envío real:
 * - Requiere BILLING_EMAIL_MODE=provider y BILLING_EMAIL_PROVIDER=resend en el runtime
 *
 * Uso:
 *   node scripts/send-billing-email-test.mjs --to victor@telvoice.net
 *   node scripts/send-billing-email-test.mjs --to victor@telvoice.net --confirm
 */
import "dotenv/config";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const toEmail = (arg("to") || "").trim();
const confirm = hasFlag("confirm");

if (!toEmail || !toEmail.includes("@")) {
  console.error("ERROR: --to debe ser un email válido.");
  process.exit(1);
}

// IMPORTANTE: antes de importar dist/services, sobreescribimos env en dry-run.
if (!confirm) {
  process.env.BILLING_EMAIL_MODE = "mock";
  // No es secreto; sirve para que el esquema sea consistente.
  process.env.BILLING_EMAIL_PROVIDER = process.env.BILLING_EMAIL_PROVIDER || "resend";
}

const distInvoicePath = join(__dirname, "../dist/services/billingInvoiceService.js");
const distBillingEmailPath = join(__dirname, "../dist/services/billingEmailService.js");

const { ensureInvoiceForOrder } = await import(
  pathToFileURL(distInvoicePath).toString(),
);
const { sendInvoiceEmailIfNeeded } = await import(
  pathToFileURL(distBillingEmailPath).toString(),
);

function hashClaimToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL no está definido en .env");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

await client.connect();

try {
  if (confirm) {
    const mode = (process.env.BILLING_EMAIL_MODE || "").trim().toLowerCase();
    const provider = (process.env.BILLING_EMAIL_PROVIDER || "").trim().toLowerCase();
    assert(mode === "provider" || mode === "resend", "BILLING_EMAIL_MODE debe ser provider (o legacy resend).");
    assert(provider === "resend", "BILLING_EMAIL_PROVIDER debe ser resend.");
  }

  const pkg = await client.query(`
    SELECT id, sms_quantity, total_price, currency, name
    FROM sms_packages
    WHERE is_active = true
    ORDER BY sort_order ASC
    LIMIT 1
  `);
  assert(pkg.rows.length > 0, "No hay bolsas activas para QA.");

  const company = await client.query(`
    INSERT INTO companies (name, billing_email, country, status)
    VALUES ($1, $2, 'CL', 'active')
    RETURNING id
  `, ["QA Billing Email Test Co", toEmail]);
  const companyId = company.rows[0].id;

  // Token hash dummy (no se usa para billing email, solo para satisfacer campos opcionales).
  const claimToken = randomBytes(32).toString("base64url");
  const claimTokenHash = hashClaimToken(claimToken);
  const publicRef = `QA-BILL-${Date.now()}`;

  const orderIns = await client.query(
    `
      INSERT INTO sms_orders (
        company_id, package_id, sms_quantity, amount, currency,
        payment_provider, payment_reference, payment_status, credit_status,
        claim_token_hash, claim_status, checkout_email, payer_email,
        public_checkout_reference, metadata
      ) VALUES (
        $1, $2, $3, $4, $5,
        'mercadopago', $6, 'paid', 'pending_claim',
        $7, 'unclaimed', $8, $9,
        $10, $11::jsonb
      )
      RETURNING id
    `,
    [
      companyId,
      pkg.rows[0].id,
      pkg.rows[0].sms_quantity,
      pkg.rows[0].total_price,
      pkg.rows[0].currency,
      publicRef,
      claimTokenHash,
      toEmail,
      toEmail,
      publicRef,
      JSON.stringify({ source: "send_billing_email_test", qa: true }),
    ],
  );
  const orderId = orderIns.rows[0].id;

  const invoice = await ensureInvoiceForOrder(orderId, {
    orderId,
    requireCredited: false,
    initialStatus: "issued",
  });
  assert(invoice?.id, "No se pudo crear invoice temporal para el test.");

  const emailResult = await sendInvoiceEmailIfNeeded(invoice.id, {
    source: "send_billing_email_test",
    actorType: "system",
  });

  const billingLogId = emailResult.emailLogId ?? null;
  let logRow = null;
  if (billingLogId) {
    const r = await client.query(
      `SELECT id, invoice_id, provider, provider_message_id, status, to_email, sent_at, metadata
       FROM billing_email_logs
       WHERE id = $1`,
      [billingLogId],
    );
    logRow = r.rows[0] ?? null;
  }

  const walletCounts = await client.query(
    `SELECT
       (SELECT count(*)::int FROM company_sms_wallets WHERE company_id = $1) AS company_wallets,
       (SELECT count(*)::int FROM wallet_transactions WHERE reference_type = 'sms_order' AND reference_id = $2) AS wallet_transactions
     `,
    [companyId, orderId],
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: confirm ? "confirm" : "dry_run",
        to: toEmail,
        orderId,
        invoiceId: invoice.id,
        emailLogId: billingLogId,
        billingEmailLog: logRow
          ? {
              provider: logRow.provider,
              provider_message_id: logRow.provider_message_id,
              status: logRow.status,
              sent_at: logRow.sent_at,
            }
          : null,
        walletValidation: {
          company_wallets: walletCounts.rows[0].company_wallets,
          wallet_transactions: walletCounts.rows[0].wallet_transactions,
        },
        skipped: emailResult.skipped === true,
      },
      null,
      2,
    ),
  );
} finally {
  // No limpiamos automáticamente para que puedas validar manualmente billing_email_logs si quieres.
  await client.end();
}

