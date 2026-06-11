#!/usr/bin/env node
/**
 * Carga inventario de números reales desde variable de entorno (NO commitear números).
 *
 * Uso:
 *   REAL_NUMBER_INVENTORY_JSON='[{"e164_number":"+569...","webhook_connected":true,...}]' \
 *     node scripts/seed-real-number-inventory.mjs
 *
 * Campos por ítem:
 *   e164_number (requerido)
 *   webhook_connected, connection_status, sales_status
 *   gateway_id, sim_slot, webhook_url, metadata
 *
 * Ejemplo connected (vendible online):
 *   { "e164_number": "E164_NUMBER_PLACEHOLDER", "webhook_connected": true,
 *     "connection_status": "connected", "sales_status": "connected_available" }
 *
 * Ejemplo preconfigurado (no vendible online aún):
 *   { "e164_number": "+56XXXXXXXXX", "webhook_connected": false,
 *     "connection_status": "preconfigured_pending", "sales_status": "preconfigured_pending" }
 */
import "dotenv/config";
import pg from "pg";

const raw = process.env.REAL_NUMBER_INVENTORY_JSON?.trim();
if (!raw) {
  console.error(
    "ERROR: define REAL_NUMBER_INVENTORY_JSON con un array JSON de números (no versionar en git).",
  );
  process.exit(1);
}

let items;
try {
  items = JSON.parse(raw);
} catch {
  console.error("ERROR: REAL_NUMBER_INVENTORY_JSON no es JSON válido.");
  process.exit(1);
}

if (!Array.isArray(items) || !items.length) {
  console.error("ERROR: REAL_NUMBER_INVENTORY_JSON debe ser un array no vacío.");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("ERROR: DATABASE_URL no está definido.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("supabase")
    ? { rejectUnauthorized: false }
    : undefined,
});

await client.connect();
try {
  let upserted = 0;
  for (const item of items) {
    const e164 = String(item.e164_number ?? "").trim();
    if (!e164) {
      console.warn("SKIP: ítem sin e164_number");
      continue;
    }

    const payload = {
      country_code: item.country_code ?? "CL",
      provider: item.provider ?? "telsim",
      webhook_connected: Boolean(item.webhook_connected),
      connection_status: item.connection_status ?? "preconfigured_pending",
      sales_status: item.sales_status ?? "preconfigured_pending",
      gateway_id: item.gateway_id ?? null,
      sim_slot: item.sim_slot ?? null,
      webhook_url: item.webhook_url ?? null,
      metadata: JSON.stringify(item.metadata ?? {}),
    };

    await client.query(
      `INSERT INTO real_number_inventory (
        e164_number, country_code, provider, webhook_connected,
        connection_status, sales_status, gateway_id, sim_slot, webhook_url, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
      ON CONFLICT (e164_number) DO UPDATE SET
        webhook_connected = EXCLUDED.webhook_connected,
        connection_status = EXCLUDED.connection_status,
        sales_status = EXCLUDED.sales_status,
        gateway_id = EXCLUDED.gateway_id,
        sim_slot = EXCLUDED.sim_slot,
        webhook_url = EXCLUDED.webhook_url,
        metadata = EXCLUDED.metadata,
        updated_at = now()`,
      [
        e164,
        payload.country_code,
        payload.provider,
        payload.webhook_connected,
        payload.connection_status,
        payload.sales_status,
        payload.gateway_id,
        payload.sim_slot,
        payload.webhook_url,
        payload.metadata,
      ],
    );
    upserted += 1;
  }

  const { rows } = await client.query(
    `SELECT sales_status, COUNT(*)::int AS n
     FROM real_number_inventory GROUP BY sales_status ORDER BY sales_status`,
  );

  console.log("OK: inventario actualizado.", upserted, "registro(s).");
  for (const r of rows) {
    console.log(" ", r.sales_status, "→", r.n);
  }
} catch (err) {
  console.error("ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
