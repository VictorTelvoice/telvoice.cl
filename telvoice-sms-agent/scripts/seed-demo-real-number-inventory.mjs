#!/usr/bin/env node
/**
 * Seed QA local — inventario demo con números ficticios (NO reales).
 *
 * Uso:
 *   cd telvoice-sms-agent
 *   node scripts/seed-demo-real-number-inventory.mjs
 *
 * Requiere DATABASE_URL apuntando a entorno local/QA (nunca producción).
 */
import "dotenv/config";
import pg from "pg";

const DEMO_ITEMS = [
  {
    e164_number: "+56000000001",
    webhook_connected: true,
    connection_status: "connected",
    sales_status: "connected_available",
    gateway_id: "demo-gateway-1",
    sim_slot: "demo-slot-1",
    metadata: { seed: "demo", label: "QA inventario 1" },
  },
  {
    e164_number: "+56000000002",
    webhook_connected: false,
    connection_status: "preconfigured_pending",
    sales_status: "preconfigured_pending",
    gateway_id: "demo-gateway-2",
    sim_slot: "demo-slot-2",
    metadata: { seed: "demo", label: "QA inventario 2" },
  },
  {
    e164_number: "+56000000003",
    webhook_connected: true,
    connection_status: "connected",
    sales_status: "connected_available",
    gateway_id: "demo-gateway-3",
    sim_slot: "demo-slot-3",
    metadata: { seed: "demo", label: "QA inventario 3" },
  },
];

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
  for (const item of DEMO_ITEMS) {
    await client.query(
      `INSERT INTO real_number_inventory (
        e164_number, country_code, provider, webhook_connected,
        connection_status, sales_status, gateway_id, sim_slot, metadata
      ) VALUES ($1, 'CL', 'telsim', $2, $3, $4, $5, $6, $7::jsonb)
      ON CONFLICT (e164_number) DO UPDATE SET
        webhook_connected = EXCLUDED.webhook_connected,
        connection_status = EXCLUDED.connection_status,
        sales_status = EXCLUDED.sales_status,
        gateway_id = EXCLUDED.gateway_id,
        sim_slot = EXCLUDED.sim_slot,
        metadata = EXCLUDED.metadata,
        updated_at = now()`,
      [
        item.e164_number,
        item.webhook_connected,
        item.connection_status,
        item.sales_status,
        item.gateway_id,
        item.sim_slot,
        JSON.stringify(item.metadata),
      ],
    );
    console.log("OK demo:", item.e164_number.replace(/\d(?=\d{3})/g, "*"));
  }
  console.log("Demo inventory seed complete (3 fictitious numbers).");
} finally {
  await client.end();
}
