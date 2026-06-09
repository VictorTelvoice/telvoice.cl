/**
 * Idempotencia claim-before-send para comprobantes billing.
 *
 * Uso:
 *   npx tsx scripts/test-billing-email-idempotency.ts
 *
 * Requiere DATABASE_URL y migración 057 aplicada.
 */
import assert from "node:assert/strict";
import "dotenv/config";
import pg from "pg";
import {
  claimBillingEmailSend,
  completeBillingEmailSend,
  INVOICE_RECEIPT_EMAIL_TYPE,
  normalizeBillingRecipientEmail,
} from "../src/services/billingEmailClaimService.js";

const TEST_SOURCE = "test_billing_email_idempotency_concurrency";
const connectionString = process.env.DATABASE_URL?.trim();

function testNormalizeRecipient(): void {
  assert.equal(
    normalizeBillingRecipientEmail("  Arturo.Aguilar@TalkChile.CL  "),
    "arturo.aguilar@talkchile.cl",
  );
  console.log("✓ normalizeBillingRecipientEmail");
}

async function testParallelClaim(invoiceId: string, companyId: string): Promise<void> {
  const testEmail = `qa-idempotency-${Date.now()}@telvoice.test`;
  const subject = "Test comprobante idempotencia";

  const claims = await Promise.all(
    Array.from({ length: 8 }, () =>
      claimBillingEmailSend({
        invoiceId,
        companyId,
        toEmail: testEmail,
        subject,
        provider: "mock",
        source: TEST_SOURCE,
      }),
    ),
  );

  const won = claims.filter((c) => c.claimed);
  const lost = claims.filter((c) => !c.claimed);

  assert.equal(won.length, 1, `Debe ganar exactamente 1 claim; ganaron ${won.length}`);
  assert.equal(lost.length, 7, `Deben perder 7 claims; perdieron ${lost.length}`);

  const winner = won[0];
  assert.ok(winner.logId, "Claim ganador debe tener logId");

  await completeBillingEmailSend({
    logId: winner.logId,
    providerMessageId: "mock-test-id",
  });

  const pgClient = new pg.Client({
    connectionString,
    ssl: connectionString!.includes("supabase")
      ? { rejectUnauthorized: false }
      : undefined,
  });
  await pgClient.connect();
  try {
    const { rows } = await pgClient.query(
      `SELECT count(*)::int AS c FROM billing_email_logs
       WHERE invoice_id = $1
         AND to_email_normalized = $2
         AND email_type = $3
         AND status = 'sent'
         AND COALESCE(metadata->>'is_resend', 'false') = 'false'`,
      [invoiceId, normalizeBillingRecipientEmail(testEmail), INVOICE_RECEIPT_EMAIL_TYPE],
    );
    assert.equal(rows[0].c, 1, "Debe quedar exactamente 1 log sent automático");

    await pgClient.query(
      `DELETE FROM billing_email_logs
       WHERE invoice_id = $1 AND to_email_normalized = $2 AND metadata->>'source' = $3`,
      [invoiceId, normalizeBillingRecipientEmail(testEmail), TEST_SOURCE],
    );
  } finally {
    await pgClient.end();
  }

  console.log("✓ claimBillingEmailSend concurrente (8 paralelos → 1 envío)");
}

async function testParallelSendIfNeeded(invoiceId: string): Promise<void> {
  const { sendInvoiceEmailIfNeeded } = await import(
    "../src/services/billingEmailService.js"
  );

  const originalFetch = globalThis.fetch;
  let resendCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("api.resend.com/emails")) {
      resendCalls += 1;
      return new Response(JSON.stringify({ id: `mock-resend-${resendCalls}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const [r1, r2] = await Promise.all([
      sendInvoiceEmailIfNeeded(invoiceId, { source: TEST_SOURCE }),
      sendInvoiceEmailIfNeeded(invoiceId, { source: TEST_SOURCE }),
    ]);

    const outcomes = [r1, r2];
    const delivered = outcomes.filter((r) => r.success && !r.skipped);
    const skipped = outcomes.filter((r) => r.skipped);

    assert.equal(
      delivered.length + skipped.length,
      2,
      "Ambas llamadas deben resolver success o skipped",
    );
    assert.equal(delivered.length, 1, "Exactamente 1 debe enviar");
    assert.equal(skipped.length, 1, "Exactamente 1 debe omitirse");
    assert.equal(resendCalls, 1, "Resend debe llamarse una sola vez");

    const pgClient = new pg.Client({
      connectionString,
      ssl: connectionString!.includes("supabase")
        ? { rejectUnauthorized: false }
        : undefined,
    });
    await pgClient.connect();
    try {
      const { rows } = await pgClient.query(
        `SELECT count(*)::int AS c FROM billing_email_logs
         WHERE invoice_id = $1
           AND status IN ('sending', 'sent')
           AND COALESCE(metadata->>'is_resend', 'false') = 'false'`,
        [invoiceId],
      );
      assert.equal(rows[0].c, 1, "Debe existir un solo log automático activo/sent");

      await pgClient.query(
        `DELETE FROM billing_email_logs
         WHERE invoice_id = $1 AND metadata->>'source' = $2`,
        [invoiceId, TEST_SOURCE],
      );
    } finally {
      await pgClient.end();
    }

    console.log("✓ sendInvoiceEmailIfNeeded concurrente (2 paralelos → 1 Resend)");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main(): Promise<void> {
  console.log("=== test:billing-email-idempotency ===\n");
  testNormalizeRecipient();

  if (!connectionString) {
    console.log("\n(Omitido: tests de integración — falta DATABASE_URL)");
    return;
  }

  const pgClient = new pg.Client({
    connectionString,
    ssl: connectionString.includes("supabase")
      ? { rejectUnauthorized: false }
      : undefined,
  });
  await pgClient.connect();

  try {
    const { rows: indexRows } = await pgClient.query(`
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'idx_billing_email_logs_invoice_recipient_type_active'
    `);
    assert.ok(indexRows.length > 0, "Aplicar migración 057 antes de correr este test");

    const { rows: invoices } = await pgClient.query(`
      SELECT bi.id, bi.company_id, bi.customer_email
      FROM billing_invoices bi
      WHERE bi.company_id IS NOT NULL
      ORDER BY bi.created_at DESC
      LIMIT 1
    `);
    assert.ok(invoices.length > 0, "Se necesita al menos una billing_invoice en la BD");

    const invoiceId = invoices[0].id as string;
    const companyId = invoices[0].company_id as string;

    await testParallelClaim(invoiceId, companyId);

    const { rows: sendCandidates } = await pgClient.query(
      `
      SELECT bi.id
      FROM billing_invoices bi
      WHERE bi.customer_email IS NOT NULL
        AND trim(bi.customer_email) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM billing_email_logs bel
          WHERE bel.invoice_id = bi.id
            AND bel.status IN ('sending', 'sent')
            AND COALESCE(bel.metadata->>'is_resend', 'false') = 'false'
        )
      ORDER BY bi.created_at DESC
      LIMIT 1
      `,
    );

    if (sendCandidates.length === 0) {
      console.log(
        "⊘ sendInvoiceEmailIfNeeded concurrente omitido (sin invoice sin email automático previo)",
      );
    } else {
      const envBackup = {
        BILLING_EMAIL_MODE: process.env.BILLING_EMAIL_MODE,
        BILLING_EMAIL_PROVIDER: process.env.BILLING_EMAIL_PROVIDER,
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
        EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
      };

      process.env.BILLING_EMAIL_MODE = "provider";
      process.env.BILLING_EMAIL_PROVIDER = "resend";
      process.env.RESEND_API_KEY = envBackup.RESEND_API_KEY ?? "re_test_mock_key";
      process.env.EMAIL_FROM_ADDRESS =
        envBackup.EMAIL_FROM_ADDRESS ?? "billing@telvoice.net";
      process.env.EMAIL_REPLY_TO = envBackup.EMAIL_REPLY_TO ?? "billing@telvoice.net";

      try {
        await testParallelSendIfNeeded(sendCandidates[0].id as string);
      } finally {
        for (const [key, value] of Object.entries(envBackup)) {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        }
      }
    }
  } finally {
    await pgClient.end();
  }

  console.log("\nTodas las pruebas pasaron.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
