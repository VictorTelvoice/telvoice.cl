#!/usr/bin/env node
/**
 * Auditoría entorno sim-qa para E2E suscripción sandbox.
 * No imprime tokens ni números completos.
 */
import "dotenv/config";
import pg from "pg";
import { assertSandboxMpEnv, maskSuffix, PROTECTED_INVENTORY_SUFFIXES } from "./lib/sim-qa-guards.mjs";

const AGENT_BASE = process.env.PUBLIC_APP_URL?.replace(/\/$/, "") || "";

async function pgQuery(sql, params = []) {
  if (!process.env.DATABASE_URL) return null;
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost")
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

async function checkPublicHealth(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, build: data.build ?? null, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  console.log("=== Auditoría entorno sim-qa E2E ===\n");

  const mp = assertSandboxMpEnv();
  console.log("MercadoPago sandbox:");
  console.log(`  MERCADOPAGO_SANDBOX: ${mp.sandbox}`);
  console.log(`  token: ${mp.tokenKind}`);
  console.log(`  PUBLIC_APP_URL: ${process.env.PUBLIC_APP_URL ?? "(vacío)"}`);
  console.log(`  PUBLIC_SITE_URL: ${process.env.PUBLIC_SITE_URL ?? "(vacío)"}`);
  console.log(`  PUBLIC_WEBHOOK_BASE_URL: ${process.env.PUBLIC_WEBHOOK_BASE_URL ?? "(vacío)"}`);
  console.log(`  TEST_PAYER: ${process.env.MERCADOPAGO_TEST_PAYER_EMAIL ? "configurado" : "vacío"}`);
  if (mp.ok) console.log("  ✓ guards MP OK");
  else {
    console.log("  ✗ guards MP:");
    for (const e of mp.errors) console.log(`    - ${e}`);
  }

  console.log("\nWebhook MP esperado:");
  const webhookUrl = `${AGENT_BASE || "https://agent-qa.telvoice.cl"}/api/mercadopago/webhook`;
  console.log(`  ${webhookUrl}`);

  if (AGENT_BASE) {
    const health = await checkPublicHealth(AGENT_BASE);
    console.log("\nHealth público:", health.ok ? `OK build=${health.build}` : `FAIL ${health.error ?? health.status}`);
  }

  const inv = await pgQuery(
    `SELECT right(regexp_replace(e164_number,'[^0-9]','','g'),3) AS suffix,
            sales_status, metadata->>'qa_only' AS qa_only
     FROM real_number_inventory
     WHERE (metadata->>'qa_only')::boolean IS TRUE
        OR metadata->>'qa_only' = 'true'`,
  );

  console.log("\nInventario QA (qa_only):");
  if (!inv?.rows?.length) {
    console.log("  (ninguno — ejecutar setup-qa-sim-subscription-inventory.mjs --apply)");
  } else {
    for (const r of inv.rows) {
      const protectedMark = PROTECTED_INVENTORY_SUFFIXES.has(r.suffix) ? " [PROTEGIDO]" : "";
      console.log(`  ${maskSuffix(r.suffix)} status=${r.sales_status}${protectedMark}`);
    }
  }

  const prod030 = await pgQuery(
    `SELECT sales_status, metadata->>'qa_only' AS qa_only
     FROM real_number_inventory
     WHERE right(regexp_replace(e164_number,'[^0-9]','','g'),3) = '030'`,
  );
  const p = prod030?.rows[0];
  console.log("\n***030 productivo:", p ? `${p.sales_status} qa_only=${p.qa_only ?? "null"}` : "no encontrado");

  console.log("\n=== Fin auditoría ===");
  if (!mp.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
