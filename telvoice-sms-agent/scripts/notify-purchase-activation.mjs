#!/usr/bin/env node
/**
 * Aviso transaccional: bolsa SMS activada tras reconciliación MP.
 * Dry-run por defecto.
 *
 * Flags:
 *   --dry-run (default)
 *   --send --email=user@domain.com
 *   --all --confirm="ENVIAR AVISO BOLSA ACTIVA"  (no usar sin aprobación)
 */
import "dotenv/config";

function hasFlag(name) {
  return process.argv.includes(name);
}

function arg(name) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : null;
}

const send = hasFlag("--send");
const dryRun = hasFlag("--dry-run") || !send;
const email = arg("email")?.trim().toLowerCase() ?? undefined;
const all = hasFlag("--all");
const confirm = arg("confirm") ?? undefined;

const {
  assessPurchaseActivationNotice,
  assessAllPurchaseActivationNotices,
  sendPurchaseActivationNotice,
  sendAllPurchaseActivationNotices,
  PURCHASE_ACTIVATION_SEND_CONFIRM,
} = await import("../src/services/purchaseActivationNoticeService.ts");

console.log(
  JSON.stringify(
    {
      mode: dryRun ? "dry-run" : "send",
      email: email ?? null,
      all,
      warning: send
        ? "ENVIANDO correos de bolsa activada."
        : "Solo simulación. Pasa --send --email=... para enviar.",
    },
    null,
    2,
  ),
);

let results = [];

if (dryRun) {
  if (all) {
    results = await assessAllPurchaseActivationNotices();
  } else if (email) {
    results = await assessPurchaseActivationNotice(email);
  } else {
    console.error("Dry-run requiere --email=... o --all");
    process.exit(1);
  }
} else if (all) {
  const out = await sendAllPurchaseActivationNotices({
    dryRun: false,
    confirm,
  });
  results = out.results;
} else if (email) {
  const out = await sendPurchaseActivationNotice(email, { dryRun: false });
  results = out.results;
} else {
  console.error("Send requiere --email=... o --all --confirm=...");
  process.exit(1);
}

console.log(JSON.stringify({ count: results.length, results }, null, 2));

if (dryRun) {
  console.log(
    "\nPara enviar:",
  );
  console.log(
    "  npm run notify:purchase-activation -- --send --email=user@domain.com",
  );
}
