#!/usr/bin/env node
/**
 * QA Etapa 7.2 — fail-fast IP not Whitelisted (sin SMS real, sin proveedor).
 * Uso: npm run build && node scripts/verify-provider-whitelist-failfast-qa.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPolicy = join(__dirname, "../dist/services/providerRejectionPolicy.js");
const distHints = join(__dirname, "../dist/utils/asmsc-hints.js");
const distLog = join(__dirname, "../dist/utils/smsProviderDispatchLog.js");
const distRetry = join(__dirname, "../dist/services/smsQueueRetryService.js");

if (!existsSync(distPolicy) || !existsSync(distHints)) {
  console.error("Ejecuta npm run build primero");
  process.exit(1);
}

const { resolveProviderRejectionStrategy } = await import(
  pathToFileURL(distPolicy).href
);
const {
  isIpWhitelistProviderError,
  IP_WHITELIST_FAIL_FAST_PANEL_METADATA,
} = await import(pathToFileURL(distHints).href);
const { logProviderDispatchIssue, maskDispatchApiId } = await import(
  pathToFileURL(distLog).href
);
const { isAttemptExhausted } = await import(pathToFileURL(distRetry).href);

let passed = 0;
let failed = 0;

function ok(name, detail = "") {
  passed += 1;
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  failed += 1;
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(cond, name, detail = "") {
  if (cond) ok(name, detail);
  else fail(name, detail);
}

console.log("QA fail-fast IP whitelist Etapa 7.2 (sin SMS real)\n");

assert(
  isIpWhitelistProviderError("IP not Whitelisted", { status: "F" }),
  "detecta error_message IP not Whitelisted",
);
assert(
  isIpWhitelistProviderError(null, { remarks: "IP not Whitelisted" }),
  "detecta remarks en raw_response",
);

const strategy = resolveProviderRejectionStrategy({
  errorMessage: "IP not Whitelisted",
  rawResponse: { status: "F", remarks: "IP not Whitelisted" },
  attemptAfterProcessing: 1,
  maxAttempts: 3,
});
assert(strategy === "fail_fast_ip_whitelist", "estrategia fail_fast en intento 1/3");

const strategyLate = resolveProviderRejectionStrategy({
  errorMessage: "IP not Whitelisted",
  attemptAfterProcessing: 2,
  maxAttempts: 3,
});
assert(strategyLate === "fail_fast_ip_whitelist", "fail_fast también en intento 2");

const transient = resolveProviderRejectionStrategy({
  errorMessage: "Temporary error",
  attemptAfterProcessing: 1,
  maxAttempts: 3,
});
assert(transient === "requeue", "otros errores siguen con requeue");

const terminal = resolveProviderRejectionStrategy({
  errorMessage: "Permanent reject",
  attemptAfterProcessing: 3,
  maxAttempts: 3,
});
assert(terminal === "fail_terminal", "agotado max_attempts = fail_terminal");

// Simular worker: con fail_fast no debe haber 2.º reintento
let attempts = 0;
let requeues = 0;
let failCount = 0;
const maxAttempts = 3;
while (attempts < maxAttempts) {
  attempts += 1;
  const s = resolveProviderRejectionStrategy({
    errorMessage: "IP not Whitelisted",
    attemptAfterProcessing: attempts,
    maxAttempts,
  });
  if (s === "fail_fast_ip_whitelist") {
    failCount += 1;
    break;
  }
  if (s === "requeue") {
    requeues += 1;
    continue;
  }
  failCount += 1;
  break;
}
assert(attempts === 1, "solo 1 intento HTTP simulado ante whitelist", String(attempts));
assert(requeues === 0, "sin requeue ante whitelist");
assert(failCount === 1, "marca failed en primer rechazo");

assert(
  IP_WHITELIST_FAIL_FAST_PANEL_METADATA.retry_policy === "fail_fast_ip_whitelist",
  "metadata panel retry_policy",
);
assert(
  IP_WHITELIST_FAIL_FAST_PANEL_METADATA.provider_hint?.includes("aSMSC"),
  "metadata panel provider_hint",
);

const logs = [];
const origWarn = console.warn;
console.warn = (...parts) => logs.push(parts.join(" "));
logProviderDispatchIssue({
  providerId: "prov-asmsc",
  routeId: "route-cl",
  queueId: "queue-test",
  messageId: "msg-test",
  campaignId: "camp-test",
  senderId: "EMPRESADEMO",
  phone: "+56912345678",
  apiIdMasked: maskDispatchApiId("API211TEST"),
  endpointHost: "api.example.com",
  attempt: 1,
  maxAttempts: 3,
  workerSource: "qa",
  errorCode: "F",
  errorMessage: "IP not Whitelisted",
  effectiveTps: 5,
  schedulerBatchSize: 15,
});
console.warn = origWarn;

const logLine = logs.join("\n");
assert(logLine.includes("effective_tps"), "log incluye effective_tps");
assert(logLine.includes("scheduler_batch_size"), "log incluye scheduler_batch_size");
assert(logLine.includes("fail_fast_ip_whitelist"), "log incluye retry_policy");
assert(!logLine.includes("api_password"), "log sin password");
assert(logLine.includes("phone_masked"), "teléfono enmascarado");

// No wallet: este script no importa debitSmsUsage ni billing
assert(true, "sin import wallet/billing/MercadoPago en QA");

console.log(`\n=== RESUMEN: ${passed} OK, ${failed} fallos ===`);
process.exit(failed > 0 ? 1 : 0);
