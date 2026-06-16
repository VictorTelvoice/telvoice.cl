#!/usr/bin/env node
/**
 * Habilita numeración QA para E2E sandbox suscripción SIM.
 * - Marca metadata.qa_only=true
 * - No toca ***030, ***021, ***513
 *
 * Uso: node scripts/setup-qa-sim-subscription-inventory.mjs [--apply] [--suffix=110]
 */
import "dotenv/config";
import pg from "pg";
import { PROTECTED_INVENTORY_SUFFIXES, maskSuffix } from "./lib/sim-qa-guards.mjs";

const APPLY = process.argv.includes("--apply");
const suffixArg = process.argv.find((a) => a.startsWith("--suffix="));
const SUFFIX = (suffixArg ? suffixArg.split("=")[1] : "110").trim();

if (PROTECTED_INVENTORY_SUFFIXES.has(SUFFIX)) {
  console.error(`FAIL: sufijo ***${SUFFIX} está protegido`);
  process.exit(1);
}

const QA_METADATA = {
  qa_only: true,
  purpose: "sim_subscription_sandbox_e2e",
  created_by: "qa_sim_subscription_sandbox",
};

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

await client.connect();

const { rows } = await client.query(
  `SELECT id, sales_status, connection_status, webhook_connected, sim_slot, metadata,
          current_order_id,
          right(regexp_replace(e164_number,'[^0-9]','','g'),3) AS suffix
   FROM real_number_inventory
   WHERE right(regexp_replace(e164_number,'[^0-9]','','g'),3) = $1`,
  [SUFFIX],
);

const row = rows[0];
if (!row) {
  console.error(`FAIL: inventario ***${SUFFIX} no encontrado`);
  process.exit(1);
}

console.log("=== setup QA SIM inventory ===");
console.log("suffix:", maskSuffix(row.suffix));
console.log("current:", {
  sales_status: row.sales_status,
  connection_status: row.connection_status,
  webhook_connected: row.webhook_connected,
  qa_only: row.metadata?.qa_only ?? null,
});

if (row.current_order_id) {
  console.error("FAIL: tiene current_order_id — resolver antes");
  process.exit(1);
}

const binding = row.sim_slot
  ? (
      await client.query(`SELECT verify_phone FROM telsim_slot_bindings WHERE slot_id = $1`, [
        row.sim_slot,
      ])
    ).rows[0]
  : null;

if (!binding?.verify_phone) {
  console.warn("WARN: sin binding telsim verificado — E2E activación puede fallar");
}

if (!APPLY) {
  console.log("DRY-RUN: aplicaría connected_available + qa_only metadata");
  await client.end();
  process.exit(0);
}

const { rowCount } = await client.query(
  `UPDATE real_number_inventory SET
     sales_status = 'connected_available',
     connection_status = 'connected',
     webhook_connected = true,
     metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
     updated_at = now()
   WHERE id = $1
     AND right(regexp_replace(e164_number,'[^0-9]','','g'),3) <> ALL($3::text[])
     AND current_order_id IS NULL`,
  [row.id, JSON.stringify(QA_METADATA), [...PROTECTED_INVENTORY_SUFFIXES]],
);

if (rowCount !== 1) {
  console.error("FAIL: update no aplicado (protección o estado bloqueante)");
  process.exit(1);
}

console.log("✅ Inventario QA habilitado:", maskSuffix(SUFFIX));
await client.end();
