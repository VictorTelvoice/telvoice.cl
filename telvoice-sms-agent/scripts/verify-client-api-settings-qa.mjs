#!/usr/bin/env node
/**
 * QA: client_api_settings — servicio + limpieza demo.
 */
import "dotenv/config";
import pg from "pg";
import {
  buildDefaultClientApiSettings,
  getClientApiSettings,
  getClientApiSettingsModuleState,
  regenerateDemoApiKey,
  requestSmppAccess,
  updateClientWebhookSettings,
} from "../dist/services/clientApiSettingsService.js";

const DEMO = process.env.QA_COMPANY_ID || "6cd1db92-d5c7-45e0-8548-df8907843350";
const QA_WEBHOOK = "https://telvoice.cl/qa-webhook-dlr";

const module = await getClientApiSettingsModuleState();
if (!module.available) {
  console.error("FAIL: módulo API no disponible", module);
  process.exit(1);
}
console.log("OK: módulo disponible");

const defaults = buildDefaultClientApiSettings();
const regen = await regenerateDemoApiKey(DEMO, defaults);
if (!regen.ok || !regen.data.apiKeyDemo.startsWith("tlv_live_")) {
  console.error("FAIL regenerate", regen);
  process.exit(1);
}
console.log("OK: regenerate demo key", regen.data.apiKeyDemo.slice(0, 16) + "…");

const wh = await updateClientWebhookSettings(DEMO, defaults, {
  webhookUrl: QA_WEBHOOK,
  webhookEvents: ["delivered", "failed"],
});
if (!wh.ok || wh.data.webhookStatus !== "Activo") {
  console.error("FAIL webhook", wh);
  process.exit(1);
}
console.log("OK: webhook guardado");

const smpp = await requestSmppAccess(DEMO, defaults);
if (!smpp.ok || !smpp.data.smppRequested) {
  console.error("FAIL smpp", smpp);
  process.exit(1);
}
console.log("OK: smpp requested");

const loaded = await getClientApiSettings(DEMO, defaults);
if (!loaded.ok || !loaded.data.hasStoredRecord) {
  console.error("FAIL load", loaded);
  process.exit(1);
}
console.log("OK: read");

const conn = process.env.DATABASE_URL?.trim();
if (conn) {
  const client = new pg.Client({
    connectionString: conn,
    ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  const { rowCount } = await client.query(
    `delete from client_api_settings where company_id = $1`,
    [DEMO],
  );
  await client.end();
  console.log("OK: limpieza demo (filas:", rowCount, ")");
}

console.log("\n✅ verify-client-api-settings-qa completado");
