#!/usr/bin/env node
/**
 * Diagnóstico egress aSMSC — sin envío SMS.
 * Ejecutar en el VPS para IP pública real de salida.
 */
import { execSync } from "node:child_process";
import "dotenv/config";

function mask(s) {
  if (!s?.trim()) return null;
  const v = s.trim();
  if (v.length <= 6) return "***";
  return `${v.slice(0, 4)}…${v.slice(-2)}`;
}

function envOrDefault(key, fallback = "(unset)") {
  const v = process.env[key]?.trim();
  return v || fallback;
}

async function fetchText(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  }
}

async function curlText(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 8000 }).trim();
  } catch {
    return null;
  }
}

const baseUrl = envOrDefault("ASMSC_BASE_URL", "http://api.telvoice.net/api");
let host = baseUrl;
try {
  host = new URL(baseUrl.replace(/\/$/, "")).host;
} catch {
  /* keep raw */
}

console.log("=== diagnose-asmsc-egress (sin SMS) ===\n");

const ipv4Fetch = await fetchText("https://api.ipify.org");
const ipv4Curl = curlText("curl -4 -s --max-time 8 https://api.ipify.org");
const ipv4Ifconfig = curlText("curl -4 -s --max-time 8 https://ifconfig.me");

console.log("IPv4 pública:");
console.log("  fetch api.ipify.org:", ipv4Fetch ?? "(no disponible)");
console.log("  curl -4 api.ipify.org:", ipv4Curl ?? "(no disponible)");
console.log("  curl -4 ifconfig.me:", ipv4Ifconfig ?? "(no disponible)");

const ipv6Fetch = await fetchText("https://api64.ipify.org");
const ipv6Curl = curlText("curl -6 -s --max-time 8 https://api.ipify.org || true");

console.log("\nIPv6 (si aplica):");
console.log("  fetch api64.ipify.org:", ipv6Fetch ?? "(no disponible)");
console.log("  curl -6 api.ipify.org:", ipv6Curl ?? "(no disponible)");

console.log("\nConfig (sanitizada):");
console.log("  ASMSC_BASE_URL host:", host);
console.log("  ASMSC_API_ID:", mask(process.env.ASMSC_API_ID));
console.log("  ASMSC_API_PASSWORD:", process.env.ASMSC_API_PASSWORD ? "SET" : "UNSET");
console.log("  ASMSC_DEFAULT_SENDER_ID:", envOrDefault("ASMSC_DEFAULT_SENDER_ID"));
console.log("  PUBLIC_WEBHOOK_BASE_URL:", envOrDefault("PUBLIC_WEBHOOK_BASE_URL"));
console.log(
  "  SMS_QUEUE_SCHEDULER_ENABLED:",
  envOrDefault("SMS_QUEUE_SCHEDULER_ENABLED", "true (default)"),
);
console.log(
  "  SMS_QUEUE_SCHEDULER_INTERVAL_SECONDS:",
  envOrDefault("SMS_QUEUE_SCHEDULER_INTERVAL_SECONDS", "1 (default)"),
);
console.log(
  "  SMS_QUEUE_SCHEDULER_BATCH_SIZE:",
  envOrDefault("SMS_QUEUE_SCHEDULER_BATCH_SIZE", "20 (default)"),
);

console.log(
  "\nNota: ejecuta este script en el VPS (agent.telvoice.cl) para confirmar la IP whitelisteada en aSMSC.",
);
