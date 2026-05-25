#!/usr/bin/env node
/**
 * Re-aplica DLR al panel para mensajes atascados en "sent" (bug message_id numérico).
 * Uso: node scripts/replay-panel-dlr.mjs
 */
import "dotenv/config";
import pg from "pg";
import { processPanelSmsDlrFromAsmsc } from "../src/services/panelSmsDlrService.ts";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL requerido en .env");
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
  const { rows: stuck } = await client.query(
    `SELECT p.id, p.provider_message_id, p.recipient_number, p.status
     FROM panel_sms_messages p
     WHERE p.mode = 'live_test'
       AND p.status = 'sent'
       AND p.provider_message_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM sms_dlr_events d
         WHERE d.provider_message_id = p.provider_message_id
           AND LOWER(d.dlr_status) = 'delivered'
       )
     ORDER BY p.created_at DESC
     LIMIT 50`,
  );

  console.log(`Mensajes a reparar: ${stuck.length}`);
  let ok = 0;
  for (const row of stuck) {
    const { rows: dlrRows } = await client.query(
      `SELECT raw_payload FROM sms_dlr_events
       WHERE provider_message_id = $1
       ORDER BY received_at DESC LIMIT 1`,
      [row.provider_message_id],
    );
    const payload = dlrRows[0]?.raw_payload;
    if (!payload) {
      continue;
    }
    const result = await processPanelSmsDlrFromAsmsc(payload);
    if (result.panel_message_id) {
      ok += 1;
      console.log(`✓ ${row.recipient_number} → delivered (${row.provider_message_id})`);
    } else {
      console.log(`✗ ${row.recipient_number} sin match panel (${row.provider_message_id})`);
    }
  }
  console.log(`\nActualizados: ${ok}/${stuck.length}`);
} finally {
  await client.end();
}
