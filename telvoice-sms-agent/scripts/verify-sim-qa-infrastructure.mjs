#!/usr/bin/env node
/**
 * Verifica infraestructura sim-qa antes de E2E sandbox MP.
 * No imprime tokens ni números completos.
 *
 * Uso: node scripts/verify-sim-qa-infrastructure.mjs
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { assertSandboxMpEnv, maskSuffix, PROTECTED_INVENTORY_SUFFIXES } from "./lib/sim-qa-guards.mjs";

const EXPECTED_VPS_IP = (process.env.SIM_QA_EXPECTED_VPS_IP || "2.24.120.99").trim();
const QA_HOST = "agent-qa.telvoice.cl";

function pass(msg) {
  console.log(`✓ ${msg}`);
}
function fail(msg) {
  console.error(`✗ ${msg}`);
}

function digShort(host) {
  try {
    const out = execSync(`dig ${host} +short`, { encoding: "utf8" }).trim();
    return out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // ignore
    }
    return { ok: res.ok, status: res.status, json, server: res.headers.get("server"), text: text.slice(0, 120) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  console.log("=== Verificación infraestructura sim-qa ===\n");
  let blockers = 0;

  const ips = digShort(QA_HOST);
  console.log(`DNS ${QA_HOST}:`, ips.length ? ips.join(", ") : "(vacío)");
  if (ips.includes(EXPECTED_VPS_IP)) {
    pass(`DNS incluye VPS ${EXPECTED_VPS_IP}`);
  } else {
    fail(`DNS no apunta al VPS (esperado ${EXPECTED_VPS_IP}). Cambiar registro A en DNS.`);
    blockers++;
  }
  if (ips.some((ip) => ip.startsWith("64.") || ip.includes("vercel"))) {
    fail("DNS aún resuelve a rangos Vercel — MercadoPago no llegará al nginx QA");
    blockers++;
  }

  const http = await fetchJson(`http://${QA_HOST}/health`);
  if (http.json?.service === "telvoice-sms-agent" && http.json?.build) {
    pass(`HTTP /health OK build=${http.json.build}`);
  } else if (http.server?.toLowerCase().includes("vercel")) {
    fail("HTTP /health responde Vercel (no nginx QA)");
    blockers++;
  } else {
    fail(`HTTP /health inesperado: ${http.error ?? http.status ?? http.text}`);
    blockers++;
  }

  const https = await fetchJson(`https://${QA_HOST}/health`);
  if (https.json?.service === "telvoice-sms-agent") {
    pass(`HTTPS /health OK build=${https.json.build}`);
  } else if (https.server?.toLowerCase().includes("vercel") || https.text?.includes("DEPLOYMENT_NOT_FOUND")) {
    fail("HTTPS /health responde Vercel — falta DNS + certbot en VPS");
    blockers++;
  } else {
    fail(`HTTPS /health: ${https.error ?? https.status ?? "no JSON QA"}`);
    blockers++;
  }

  const mp = assertSandboxMpEnv();
  console.log(`\nMercadoPago: sandbox=${mp.sandbox} token=${mp.tokenKind}`);
  if (mp.ok) pass("guards MP");
  else {
    for (const e of mp.errors) fail(e);
    blockers++;
  }

  const webhook = `https://${QA_HOST}/api/mercadopago/webhook`;
  console.log(`\nWebhook esperado: ${webhook}`);

  if (process.env.DATABASE_URL) {
    const pg = await import("pg");
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost")
        ? false
        : { rejectUnauthorized: false },
    });
    await client.connect();
    try {
      const { rows } = await client.query(
        `SELECT right(regexp_replace(e164_number,'[^0-9]','','g'),3) AS suffix,
                sales_status, metadata->>'qa_only' AS qa_only
         FROM real_number_inventory WHERE (metadata->>'qa_only')='true'`,
      );
      const qa = rows.find((r) => !PROTECTED_INVENTORY_SUFFIXES.has(r.suffix));
      if (qa) pass(`inventario QA ${maskSuffix(qa.suffix)} status=${qa.sales_status}`);
      else {
        fail("sin inventario qa_only");
        blockers++;
      }
      const p030 = await client.query(
        `SELECT sales_status FROM real_number_inventory
         WHERE right(regexp_replace(e164_number,'[^0-9]','','g'),3)='030'`,
      );
      if (p030.rows[0]?.sales_status === "connected_available") {
        pass("***030 productivo sin cambios");
      } else {
        fail(`***030 status=${p030.rows[0]?.sales_status}`);
        blockers++;
      }
    } finally {
      await client.end();
    }
  }

  console.log(`\n=== Resultado: ${blockers === 0 ? "LISTO para E2E" : `${blockers} bloqueante(s)`} ===`);
  process.exit(blockers > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
