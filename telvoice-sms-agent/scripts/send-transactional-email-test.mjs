#!/usr/bin/env node
/**
 * Envío de prueba de emails transaccionales.
 *
 * Dry-run por defecto (NO envía correo real, solo registra email_logs como skipped/dry_run).
 * Envío real solo con --confirm y con EMAIL_MODE=provider + EMAIL_PROVIDER=resend.
 *
 * Uso:
 *   node scripts/send-transactional-email-test.mjs --to tu@correo.com --template payment_received_pending_claim
 *   node scripts/send-transactional-email-test.mjs --to tu@correo.com --template payment_received_pending_claim --confirm
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const to = (arg("to") || "").trim();
const template = (arg("template") || "").trim();
const confirm = hasFlag("confirm");

if (!to || !to.includes("@")) {
  console.error("ERROR: --to debe ser un email válido.");
  process.exit(1);
}

if (!template) {
  console.error("ERROR: --template es requerido.");
  process.exit(1);
}

const distTemplates = join(__dirname, "../dist/services/transactionalEmailTemplates.js");
const distSvc = join(__dirname, "../dist/services/transactionalEmailService.js");
const templates = await import(pathToFileURL(distTemplates).toString());
const svc = await import(pathToFileURL(distSvc).toString());

let rendered;
if (template === "payment_received_pending_claim") {
  rendered = templates.renderPaymentReceivedPendingClaim({
    recipientName: "Prueba",
    packageName: "Bolsa SMS (prueba)",
    smsQuantity: 300,
    amount: 2000,
    currency: "CLP",
    orderId: "TEST-ORDER",
    orderRef: "QA-EMAIL-TEST",
    claimUrl: "https://agent.telvoice.cl/login?claim_token=QA_TEST",
  });
} else if (template === "welcome_sms_credited") {
  rendered = templates.renderWelcomeSmsCredited({
    recipientName: "Prueba",
    packageName: "Bolsa SMS (prueba)",
    smsCredited: 300,
    availableBalance: 300,
    dashboardUrl: "https://agent.telvoice.cl/app/dashboard?welcome=1",
  });
} else {
  console.error(
    "ERROR: template no soportado en este script. Usa: payment_received_pending_claim | welcome_sms_credited",
  );
  process.exit(1);
}

if (!confirm) {
  const log = await svc.logEmailAttempt({
    templateKey: template,
    subject: rendered.subject,
    recipientEmail: to,
    status: "skipped",
    provider: "dry_run",
    errorMessage: null,
    metadata: {
      dry_run: true,
      reason: "no_confirm_flag",
    },
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "dry_run",
        sent: false,
        email_log_id: log?.id ?? null,
        to,
        template,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const result = await svc.sendTransactionalEmail({
  templateKey: template,
  subject: rendered.subject,
  recipientEmail: to,
  html: rendered.html,
  text: rendered.text,
  metadata: {
    source: "send-transactional-email-test",
  },
  skipIdempotency: true,
});

console.log(
  JSON.stringify(
    {
      ok: result.ok,
      sent: result.ok && !result.skipped,
      skipped: Boolean(result.skipped),
      email_log_id: result.logId ?? null,
      to,
      template,
    },
    null,
    2,
  ),
);

