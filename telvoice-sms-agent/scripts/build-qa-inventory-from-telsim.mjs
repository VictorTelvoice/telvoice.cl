#!/usr/bin/env node
/**
 * Construye inventario QA desde telsim_slot_bindings (sin imprimir E.164).
 * Top 3 líneas con actividad inbound → connected_available.
 * Resto → preconfigured_pending.
 * Escribe /tmp/telvoice-qa/real-number-inventory.qa.json (ignorado por Git).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import "dotenv/config";
import pg from "pg";

const OUT = process.env.QA_INVENTORY_FILE?.trim() || "/tmp/telvoice-qa/real-number-inventory.qa.json";
const CONNECTED_COUNT = Number(process.env.QA_INVENTORY_CONNECTED_COUNT ?? 3);

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("ERROR: DATABASE_URL requerido.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

await client.connect();
try {
  const { rows: bindings } = await client.query(
    `SELECT slot_id, verify_phone FROM telsim_slot_bindings ORDER BY slot_id`,
  );
  if (!bindings.length) {
    console.error("ERROR: telsim_slot_bindings vacío.");
    process.exit(1);
  }

  const { rows: activity } = await client.query(
    `SELECT line_phone, COUNT(*)::int AS n
     FROM telsim_inbound_sms
     WHERE line_phone IS NOT NULL
     GROUP BY line_phone`,
  );
  const activityMap = new Map(activity.map((r) => [r.line_phone, Number(r.n)]));

  const ranked = bindings
    .map((b) => ({
      slot_id: b.slot_id,
      verify_phone: b.verify_phone,
      activity: activityMap.get(b.verify_phone) ?? 0,
    }))
    .sort((a, b) => b.activity - a.activity || String(a.slot_id).localeCompare(String(b.slot_id)));

  const connected = ranked.slice(0, CONNECTED_COUNT);
  const preconfigured = ranked.slice(CONNECTED_COUNT);

  const items = [
    ...connected.map((r) => ({
      e164_number: r.verify_phone,
      webhook_connected: true,
      connection_status: "connected",
      sales_status: "connected_available",
      provider: "telsim",
      gateway_id: "telsim-qa",
      sim_slot: String(r.slot_id),
      webhook_url: "telsim-webhook-qa",
      metadata: { qa_source: "telsim_slot_bindings", inbound_events: r.activity },
    })),
    ...preconfigured.map((r) => ({
      e164_number: r.verify_phone,
      webhook_connected: false,
      connection_status: "preconfigured_pending",
      sales_status: "preconfigured_pending",
      provider: "telsim",
      gateway_id: "telsim-qa-pending",
      sim_slot: String(r.slot_id),
      metadata: { qa_source: "telsim_slot_bindings", inbound_events: r.activity },
    })),
  ];

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(items, null, 2));

  console.log(
    JSON.stringify(
      {
        ok: true,
        output_file: OUT,
        total_items: items.length,
        connected_available: connected.length,
        preconfigured_pending: preconfigured.length,
        note: "E.164 no impreso — ver Supabase QA o archivo local privado.",
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
