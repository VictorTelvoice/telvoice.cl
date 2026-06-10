#!/usr/bin/env node
/**
 * Cadena post-compra/reconciliación: comprobante + bienvenida + bolsa activa.
 * Dry-run por defecto.
 *
 * Flags:
 *   --dry-run (default)
 *   --email=user@domain.com
 *   --send-receipt | --send-welcome | --send-activation-notice | --send-all-missing
 *   --all --confirm="ENVIAR NOTIFICACIONES POST COMPRA"
 */
import "dotenv/config";

function hasFlag(name) {
  return process.argv.includes(name);
}

function arg(name) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : null;
}

const dryRun = hasFlag("--dry-run") || !(
  hasFlag("--send-receipt") ||
  hasFlag("--send-welcome") ||
  hasFlag("--send-activation-notice") ||
  hasFlag("--send-all-missing")
);
const email = arg("email")?.trim().toLowerCase() ?? undefined;
const all = hasFlag("--all");
const confirm = arg("confirm") ?? undefined;

const sendOptions = {
  dryRun,
  sendReceipt: hasFlag("--send-receipt"),
  sendWelcome: hasFlag("--send-welcome"),
  sendActivationNotice: hasFlag("--send-activation-notice"),
  sendAllMissing: hasFlag("--send-all-missing"),
};

const {
  assessPostPurchaseNotifications,
  assessAllPostPurchaseNotifications,
  sendPostPurchaseNotifications,
  sendAllPostPurchaseNotifications,
  POST_PURCHASE_SEND_CONFIRM,
} = await import("../src/services/postPurchaseNotificationService.ts");

console.log(
  JSON.stringify(
    {
      mode: dryRun ? "dry-run" : "send",
      email: email ?? null,
      all,
      sendOptions,
      warning: dryRun
        ? "Solo simulación. Usa --send-all-missing --email=... para enviar faltantes."
        : "ENVIANDO correos según flags activos.",
    },
    null,
    2,
  ),
);

let plans = [];
let sendResults = [];

if (dryRun) {
  if (all) {
    const out = await assessAllPostPurchaseNotifications();
    plans = out;
  } else if (email) {
    plans = await assessPostPurchaseNotifications(email);
  } else {
    console.error("Dry-run requiere --email=... o --all");
    process.exit(1);
  }
} else if (all) {
  const out = await sendAllPostPurchaseNotifications({
    dryRun: false,
    confirm,
    sendAllMissing: true,
  });
  plans = out.plans;
} else if (email) {
  const out = await sendPostPurchaseNotifications(email, sendOptions);
  plans = out.plans;
  sendResults = out.sendResults;
} else {
  console.error(
    "Send requiere --email=... con algún flag de envío, o --all --confirm=...",
  );
  process.exit(1);
}

const summary = plans.map((p) => ({
  email: p.email,
  orderId: p.orderId,
  invoiceNumber: p.invoiceNumber,
  smsQuantity: p.smsQuantity,
  walletBalance: p.walletBalance,
  missingEmails: p.missingEmails,
  wouldSend: p.wouldSend,
  blocked: p.blocked,
  reasons: p.reasons,
  emails: {
    receipt: {
      status: p.emails.receipt.status,
      deliveryConfirmed: p.emails.receipt.deliveryConfirmed,
      inconsistency: p.emails.receipt.inconsistency,
      providerMessageId: p.emails.receipt.providerMessageId,
      reason: p.emails.receipt.reason,
    },
    welcome: {
      status: p.emails.welcome.status,
      deliveryConfirmed: p.emails.welcome.deliveryConfirmed,
      inconsistency: p.emails.welcome.inconsistency,
      providerMessageId: p.emails.welcome.providerMessageId,
      reason: p.emails.welcome.reason,
    },
    activation_notice: {
      status: p.emails.activation_notice.status,
      deliveryConfirmed: p.emails.activation_notice.deliveryConfirmed,
      inconsistency: p.emails.activation_notice.inconsistency,
      providerMessageId: p.emails.activation_notice.providerMessageId,
      reason: p.emails.activation_notice.reason,
    },
  },
}));

console.log(
  JSON.stringify(
    {
      count: plans.length,
      confirmRequired: POST_PURCHASE_SEND_CONFIRM,
      plans: summary,
      sendResults: sendResults.length ? sendResults : undefined,
    },
    null,
    2,
  ),
);

if (dryRun) {
  console.log("\nPara enviar todo lo faltante a un email:");
  console.log(
    "  npm run notify:purchase-activation -- --send-all-missing --email=user@domain.com",
  );
}
