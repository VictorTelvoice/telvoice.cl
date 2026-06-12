#!/usr/bin/env node
/**
 * Simula un SMS entrante contra el webhook del agente (local o producción).
 *
 * Uso:
 *   INBOUND_TO="+569XXXXXXXX" \
 *   INBOUND_FROM="+56911111111" \
 *   INBOUND_TEXT="Prueba SMS entrante Telvoice" \
 *   AGENT_BASE_URL="https://agent.telvoice.cl" \
 *   NUMERACIONES_INBOUND_WEBHOOK_SECRET="..." \
 *   node scripts/simulate-inbound-sms.mjs
 */

const baseUrl = (process.env.AGENT_BASE_URL ?? "http://127.0.0.1:3001").replace(
  /\/$/,
  "",
);
const to = process.env.INBOUND_TO?.trim();
const from = process.env.INBOUND_FROM?.trim() ?? "+56900000000";
const text = process.env.INBOUND_TEXT?.trim() ?? "Prueba SMS entrante Telvoice";
const secret = process.env.NUMERACIONES_INBOUND_WEBHOOK_SECRET?.trim();

if (!to) {
  console.error("INBOUND_TO es obligatorio (E.164 del número destino asignado).");
  process.exit(1);
}

const payload = {
  to,
  from,
  text,
  provider: "simulate",
  provider_message_id: `sim-${Date.now()}`,
  received_at: new Date().toISOString(),
};

const headers = { "Content-Type": "application/json" };
if (secret) {
  headers["x-telvoice-inbound-secret"] = secret;
}

const url = `${baseUrl}/api/webhooks/numeraciones/inbound`;

const res = await fetch(url, {
  method: "POST",
  headers,
  body: JSON.stringify(payload),
});

const bodyText = await res.text();
let parsed;
try {
  parsed = JSON.parse(bodyText);
} catch {
  parsed = bodyText;
}

console.log(JSON.stringify({ status: res.status, url, response: parsed }, null, 2));
process.exit(res.ok ? 0 : 1);
