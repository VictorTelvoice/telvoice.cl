#!/usr/bin/env node
/**
 * Re-aplica DLR al panel para mensajes atascados en "sent".
 *
 * Uso global (máx 50, requiere sms_dlr_events Delivered):
 *   node scripts/replay-panel-dlr.mjs
 *
 * Replay controlado (uno o varios filtros):
 *   node scripts/replay-panel-dlr.mjs --message-id=8d3db9e9-d542-4b17-9315-50a3d0c8c6e1
 *   node scripts/replay-panel-dlr.mjs --provider-message-id=22281907
 *   node scripts/replay-panel-dlr.mjs --campaign-id=dc241dd3-3dad-4091-b7ac-769787f7a802
 */
import "dotenv/config";
import pg from "pg";
import { processPanelSmsDlrFromAsmsc } from "../src/services/panelSmsDlrService.ts";

function parseArg(name) {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length).trim() || null;
    }
    if (arg === `--${name}`) {
      const idx = process.argv.indexOf(arg);
      return process.argv[idx + 1]?.trim() || null;
    }
  }
  return null;
}

const messageId = parseArg("message-id");
const providerMessageId = parseArg("provider-message-id");
const campaignId = parseArg("campaign-id");
const limitedReplay = Boolean(messageId || providerMessageId || campaignId);

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
  const conditions = [
    "p.mode IN ('live', 'live_test')",
    "p.provider_message_id IS NOT NULL",
  ];
  const params = [];

  if (messageId) {
    params.push(messageId);
    conditions.push(`p.id = $${params.length}`);
  }
  if (providerMessageId) {
    params.push(String(providerMessageId));
    conditions.push(`p.provider_message_id = $${params.length}`);
  }
  if (campaignId) {
    params.push(campaignId);
    conditions.push(`p.campaign_id = $${params.length}`);
  }

  if (!limitedReplay) {
    conditions.push("p.status = 'sent'");
    conditions.push(`EXISTS (
         SELECT 1 FROM sms_dlr_events d
         WHERE d.provider_message_id = p.provider_message_id
           AND LOWER(d.dlr_status) = 'delivered'
       )`);
  } else {
    console.log("Replay limitado:", {
      messageId: messageId ?? "(any)",
      providerMessageId: providerMessageId ?? "(any)",
      campaignId: campaignId ?? "(any)",
    });
  }

  const limit = limitedReplay ? 5 : 50;
  const sql = `SELECT p.id, p.campaign_id, p.provider_message_id, p.recipient_number, p.status
     FROM panel_sms_messages p
     WHERE ${conditions.join(" AND ")}
     ORDER BY p.created_at DESC
     LIMIT ${limit}`;

  const { rows: stuck } = await client.query(sql, params);

  console.log(`Mensajes a reparar: ${stuck.length}`);
  if (limitedReplay && stuck.length === 0) {
    console.error("No se encontró mensaje con los filtros indicados.");
    process.exit(1);
  }

  let ok = 0;
  for (const row of stuck) {
    const { rows: dlrRows } = await client.query(
      `SELECT raw_payload, dlr_status FROM sms_dlr_events
       WHERE provider_message_id = $1
       ORDER BY received_at DESC LIMIT 1`,
      [row.provider_message_id],
    );
    let payload = dlrRows[0]?.raw_payload;
    if (!payload && limitedReplay) {
      payload = {
        message_id: row.provider_message_id,
        DLRStatus: "Delivered",
        PhoneNumber: row.recipient_number?.replace(/^\+/, "") ?? "",
      };
      console.warn(
        `⚠ Sin sms_dlr_events para ${row.provider_message_id}; usando payload sintético Delivered`,
      );
    }
    if (!payload) {
      console.log(`⊘ ${row.id} sin DLR en sms_dlr_events`);
      continue;
    }
    const result = await processPanelSmsDlrFromAsmsc(payload);
    if (result.panel_message_id) {
      ok += 1;
      console.log(
        `✓ ${row.id} ${row.recipient_number} → panel (${row.provider_message_id})`,
      );
    } else {
      console.log(`✗ ${row.id} sin actualización panel (${row.provider_message_id})`);
    }
  }
  console.log(`\nActualizados: ${ok}/${stuck.length}`);
  process.exit(ok > 0 || stuck.length === 0 ? 0 : 1);
} finally {
  await client.end();
}
