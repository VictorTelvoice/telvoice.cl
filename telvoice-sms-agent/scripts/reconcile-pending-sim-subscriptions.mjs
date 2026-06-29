#!/usr/bin/env node
/**
 * Reconcilia suscripciones SIM pendientes (fallback operativo).
 *
 * Detecta órdenes sim_subscription en pending sin mercadopago_payment_id
 * y consulta MP para activar si hay cobro aprobado.
 *
 * Uso:
 *   node scripts/reconcile-pending-sim-subscriptions.mjs --dry-run
 *   node scripts/reconcile-pending-sim-subscriptions.mjs --apply
 *   node scripts/reconcile-pending-sim-subscriptions.mjs --apply --hours=72
 */
import "dotenv/config";
import pg from "pg";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !apply;

function arg(name) {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return null;
}

const hours = Math.max(1, Math.min(168, Number(arg("hours") ?? "72") || 72));

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}
if (!process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()) {
  console.error("MERCADOPAGO_ACCESS_TOKEN requerido");
  process.exit(1);
}

const { tryReconcileSimSubscriptionFirstPaymentFromPreapproval } = await import(
  "../dist/services/simSubscriptionPaymentActivationService.js"
);

const cs = process.env.DATABASE_URL.trim();
const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await client.connect();

const { rows } = await client.query(
  `
  SELECT o.id AS order_id,
         o.checkout_email,
         o.payment_status,
         o.amount,
         o.payment_reference,
         o.metadata->>'mercadopago_preapproval_id' AS mp_preapproval,
         o.metadata->>'mercadopago_payment_id' AS mp_payment,
         o.metadata->>'plan_id' AS plan_id,
         o.created_at
  FROM sms_orders o
  WHERE o.metadata->>'product_type' = 'sim_subscription'
    AND o.payment_status = 'pending'
    AND o.created_at >= now() - ($1::text || ' hours')::interval
    AND (
      o.metadata->>'mercadopago_payment_id' IS NULL
      OR trim(o.metadata->>'mercadopago_payment_id') = ''
    )
  ORDER BY o.created_at DESC
  `,
  [String(hours)],
);

console.log(
  JSON.stringify(
    {
      mode: dryRun ? "dry-run" : "apply",
      window_hours: hours,
      candidates: rows.length,
    },
    null,
    2,
  ),
);

const results = [];

for (const row of rows) {
  const preId = row.mp_preapproval || row.payment_reference;
  const entry = {
    order_id: row.order_id,
    checkout_email: row.checkout_email,
    plan_id: row.plan_id,
    preapproval_id: preId,
    amount: Number(row.amount),
  };

  if (!preId) {
    entry.result = "missing_preapproval_id";
    results.push(entry);
    continue;
  }

  if (dryRun) {
    const { getMercadoPagoPreapproval, searchMercadoPagoAuthorizedPaymentsByPreapproval } =
      await import("../dist/services/mercadoPagoService.js");
    try {
      const pre = await getMercadoPagoPreapproval(preId);
      const auth = await searchMercadoPagoAuthorizedPaymentsByPreapproval(preId);
      const approved = auth.find((a) => a.payment?.status === "approved");
      entry.mp_preapproval_status = pre.status;
      entry.mp_authorized_payment_id = approved?.payment?.id ?? null;
      entry.would_reconcile = Boolean(approved?.payment?.id);
      entry.result = "dry_run_inspected";
    } catch (err) {
      entry.result = "mp_inspect_failed";
      entry.error = err instanceof Error ? err.message : String(err);
    }
    results.push(entry);
    continue;
  }

  try {
    const reconciled = await tryReconcileSimSubscriptionFirstPaymentFromPreapproval(preId);
    entry.reconcile = reconciled;
    entry.result = reconciled?.ok ? reconciled.result : reconciled?.result ?? "no_reconcile";
  } catch (err) {
    entry.result = "reconcile_error";
    entry.error = err instanceof Error ? err.message : String(err);
  }
  results.push(entry);
}

console.log(JSON.stringify({ results }, null, 2));
await client.end();

const anyFailed = results.some(
  (r) =>
    r.result === "reconcile_error" ||
    r.result === "mp_inspect_failed" ||
    (r.reconcile && r.reconcile.ok === false && r.reconcile.result !== "already_active"),
);
process.exit(anyFailed ? 1 : 0);
