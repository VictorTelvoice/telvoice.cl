#!/usr/bin/env node
/**
 * E2E real sandbox: preapproval MercadoPago + checkout sim_subscription en agent-qa.
 * Requiere: TEST- token, inventario qa_only, agent-qa aislado.
 *
 * Uso: E2E_AGENT_BASE_URL=https://agent-qa.telvoice.cl node scripts/e2e-sim-subscription-sandbox.mjs [--apply] [--cleanup-only <order_id>]
 */
import "dotenv/config";
import pg from "pg";
import {
  assertSandboxMpEnv,
  assertQaInventoryRow,
  maskSuffix,
  PROTECTED_INVENTORY_SUFFIXES,
} from "./lib/sim-qa-guards.mjs";

const APPLY = process.argv.includes("--apply");
const cleanupOnly = process.argv.find((a) => a.startsWith("--cleanup-only="));
const AGENT_BASE = (
  process.env.E2E_AGENT_BASE_URL ||
  process.env.PUBLIC_APP_URL ||
  "https://agent-qa.telvoice.cl"
).replace(/\/$/, "");
const QA_EMAIL_DOMAIN = "@testuser.com";

async function pgQuery(sql, params = []) {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

function pass(msg) {
  console.log(`✓ ${msg}`);
}
function fail(msg) {
  console.error(`✗ ${msg}`);
}

async function fetchQaInventoryFromApi() {
  const res = await fetch(`${AGENT_BASE}/api/public/sim-available-numbers?limit=20`);
  const data = await res.json().catch(() => ({}));
  const numbers = Array.isArray(data.numbers) ? data.numbers : [];
  for (const n of numbers) {
    const suffix = String(n.suffix ?? "").slice(-3);
    if (PROTECTED_INVENTORY_SUFFIXES.has(suffix)) continue;
    if (typeof n.inventory_public_id === "string" && n.inventory_public_id.trim()) {
      return {
        publicId: n.inventory_public_id.trim(),
        suffix,
        display: n.display_number ?? maskSuffix(suffix),
      };
    }
  }
  return null;
}

async function fetchQaInventoryFromDb() {
  const { rows } = await pgQuery(
    `SELECT right(regexp_replace(e164_number,'[^0-9]','','g'),3) AS suffix,
            sales_status, metadata->>'qa_only' AS qa_only
     FROM real_number_inventory
     WHERE (metadata->>'qa_only') = 'true'
     LIMIT 5`,
  );
  return rows.find((r) => !PROTECTED_INVENTORY_SUFFIXES.has(r.suffix)) ?? null;
}

async function createCheckout(publicId, email) {
  const res = await fetch(`${AGENT_BASE}/api/public/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      product_type: "sim_subscription",
      plan_id: "sim_starter",
      billing_mode: "subscription",
      recurring: true,
      checkout_email: email,
      payer_name: "QA E2E Sandbox",
      company_name: "QA E2E Telvoice",
      inventory_public_id: publicId,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function cleanupSimQaOrder(orderId) {
  if (!orderId) return;
  const { rows: subs } = await pgQuery(
    `SELECT id, inventory_number_id FROM sim_subscriptions WHERE order_id = $1`,
    [orderId],
  );
  if (subs[0]?.id) {
    await pgQuery(
      `UPDATE sim_subscriptions SET status = 'cancelled', cancelled_at = now(),
       metadata = metadata || $2::jsonb WHERE id = $1`,
      [subs[0].id, JSON.stringify({ e2e_cleanup: true })],
    );
  }
  await pgQuery(
    `UPDATE sms_orders SET payment_status = 'cancelled',
     metadata = coalesce(metadata, '{}'::jsonb) || $2::jsonb
     WHERE id = $1 AND payment_status IN ('pending', 'paid')`,
    [orderId, JSON.stringify({ e2e_cleanup: true })],
  );
  const invId = subs[0]?.inventory_number_id;
  if (invId) {
    await pgQuery(
      `UPDATE real_number_inventory
       SET sales_status = 'connected_available', current_order_id = NULL,
           reserved_until = NULL, updated_at = now()
       WHERE id = $1
         AND (metadata->>'qa_only') = 'true'
         AND sales_status = 'reserved_pending_payment'`,
      [invId],
    );
  }
  pass(`cleanup orden ${orderId.slice(0, 8)}…`);
}

async function main() {
  if (cleanupOnly) {
    const orderId = cleanupOnly.split("=")[1]?.trim();
    await cleanupSimQaOrder(orderId);
    return;
  }

  console.log("=== E2E sandbox suscripción SIM (agent-qa) ===");
  console.log(`Base: ${AGENT_BASE}`);
  console.log(`Modo: ${APPLY ? "APPLY" : "DRY-RUN"}`);

  const mp = assertSandboxMpEnv();
  console.log(`MP token: ${mp.tokenKind}`);
  if (!mp.ok) {
    for (const e of mp.errors) fail(e);
    console.log("\n⛔ Detenido: cargar TEST- token y vars en .env de telvoice-sms-agent-sim-qa");
    process.exit(1);
  }
  pass("guards MercadoPago sandbox");

  const dbInv = await fetchQaInventoryFromDb();
  const qaCheck = assertQaInventoryRow(dbInv);
  if (!qaCheck.ok) {
    for (const e of qaCheck.errors) fail(e);
    console.log("Ejecutar: node scripts/setup-qa-sim-subscription-inventory.mjs --apply");
    process.exit(1);
  }
  pass(`inventario QA DB ${maskSuffix(qaCheck.suffix)}`);

  const apiInv = await fetchQaInventoryFromApi();
  if (!apiInv) {
    fail("API sim-available-numbers no devuelve inventario QA (¿sim-qa desplegado con SIM_QA_E2E?)");
    process.exit(1);
  }
  if (PROTECTED_INVENTORY_SUFFIXES.has(apiInv.suffix)) {
    fail(`API devolvió sufijo protegido ${maskSuffix(apiInv.suffix)}`);
    process.exit(1);
  }
  pass(`inventario QA API ${maskSuffix(apiInv.suffix)}`);

  const { rows: p030 } = await pgQuery(
    `SELECT sales_status FROM real_number_inventory
     WHERE right(regexp_replace(e164_number,'[^0-9]','','g'),3)='030'`,
  );
  if (p030[0]?.sales_status !== "connected_available") {
    fail(`***030 cambió: ${p030[0]?.sales_status}`);
    process.exit(1);
  }
  pass("***030 productivo sin cambios");

  if (!APPLY) {
    console.log("\nDry-run OK. Re-ejecutar con --apply para crear preapproval sandbox.");
    process.exit(0);
  }

  const email = `qa-sim-sub-e2e-${Date.now()}${QA_EMAIL_DOMAIN}`;
  let orderId = null;

  try {
    const checkout = await createCheckout(apiInv.publicId, email);
    if (!checkout.ok) {
      const errMsg =
        typeof checkout.data?.error === "object"
          ? checkout.data.error?.message
          : checkout.data?.error ?? JSON.stringify(checkout.data);
      fail(`checkout HTTP ${checkout.status}: ${errMsg}`);
      process.exit(1);
    }

    const url = checkout.data.checkout_url || checkout.data.init_point;
    orderId = checkout.data.order_id;
    const preapprovalId = checkout.data.preapproval_id;

    if (!url || !orderId || !preapprovalId) {
      fail("respuesta incompleta (url/order_id/preapproval_id)");
      process.exit(1);
    }

    pass("preapproval sandbox creado");
    console.log(`  order_id: ${orderId}`);
    console.log(`  preapproval_id: ${String(preapprovalId).slice(0, 12)}…`);
    console.log(`  checkout_url: ${String(url).slice(0, 60)}…`);

    const { rows: sub } = await pgQuery(
      `SELECT status FROM sim_subscriptions WHERE order_id = $1`,
      [orderId],
    );
    const { rows: inv } = await pgQuery(
      `SELECT sales_status, right(regexp_replace(e164_number,'[^0-9]','','g'),3) AS suffix
       FROM real_number_inventory WHERE id = (
         SELECT inventory_number_id FROM sim_subscriptions WHERE order_id = $1
       )`,
      [orderId],
    );

    if (sub[0]?.status !== "pending") fail(`sub status=${sub[0]?.status}`);
    else pass("sim_subscriptions pending");

    if (inv[0]?.sales_status !== "reserved_pending_payment") {
      fail(`reserva ${inv[0]?.sales_status}`);
      await cleanupSimQaOrder(orderId);
      process.exit(1);
    }
    pass(`inventario QA reservado ${maskSuffix(inv[0]?.suffix)}`);

    console.log("\n✅ Preapproval sandbox listo. Completar autorización en MP sandbox UI.");
    console.log("Webhooks: autorizar en MP → validar en logs agent-qa.");
    console.log(`Cleanup: node scripts/e2e-sim-subscription-sandbox.mjs --cleanup-only=${orderId}`);
  } catch (err) {
    console.error("FAIL", err);
    await cleanupSimQaOrder(orderId);
    process.exit(1);
  }
}

main();
