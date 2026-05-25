#!/usr/bin/env node
/**
 * Diagnóstico DLR: últimos envíos a números QA.
 */
import "dotenv/config";
import pg from "pg";

const phones = ["+56934449937", "+56974713166", "+56977109623"];

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL no definido");
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
  const { rows } = await client.query(
    `SELECT id, recipient_number, status, mode, segments, sent_at, delivered_at,
            provider_message_id,
            metadata->>'asmsc_uid' AS asmsc_uid,
            metadata->>'source' AS source,
            metadata->>'last_dlr_status' AS last_dlr_status,
            metadata->>'last_dlr_at' AS last_dlr_at,
            metadata->'last_dlr_payload' AS last_dlr_payload,
            created_at, error_code, error_message
     FROM panel_sms_messages
     WHERE recipient_number = ANY($1::text[])
     ORDER BY created_at DESC
     LIMIT 12`,
    [phones],
  );

  console.log("Últimos mensajes panel (3 números QA):\n");
  for (const r of rows) {
    console.log("---");
    console.log("  created_at:", r.created_at);
    console.log("  to:", r.recipient_number);
    console.log("  status:", r.status, "| mode:", r.mode);
    console.log("  sent_at:", r.sent_at);
    console.log("  delivered_at:", r.delivered_at);
    console.log("  provider_message_id:", r.provider_message_id);
    console.log("  asmsc_uid:", r.asmsc_uid);
    console.log("  source:", r.source);
    console.log("  last_dlr_status:", r.last_dlr_status);
    console.log("  last_dlr_at:", r.last_dlr_at);
    if (r.error_code) console.log("  error:", r.error_code, r.error_message);
  }

  const ids = rows.map((r) => r.id);
  if (ids.length) {
    const { rows: events } = await client.query(
      `SELECT message_id, status, created_at,
              LEFT(raw_payload::text, 200) AS payload_preview
       FROM panel_sms_delivery_events
       WHERE message_id = ANY($1::uuid[])
       ORDER BY created_at DESC
       LIMIT 20`,
      [ids],
    );
    console.log("\nEventos DLR (panel_sms_delivery_events):", events.length);
    for (const e of events) {
      console.log("  ", e.created_at, "| msg:", e.message_id?.slice(0, 8), "... |", e.status);
    }
  }

  const { rows: dlrLegacy } = await client.query(
    `SELECT id, status, created_at
     FROM sms_dlr_events
     ORDER BY created_at DESC
     LIMIT 5`,
  ).catch(() => ({ rows: [] }));
  if (dlrLegacy.length) {
    console.log("\nÚltimos sms_dlr_events (legacy):", dlrLegacy.length);
  }
} catch (err) {
  if (err.message?.includes("panel_sms_delivery_events")) {
    console.log("(tabla panel_sms_delivery_events no existe o sin datos)");
  } else {
    throw err;
  }
} finally {
  await client.end();
}
