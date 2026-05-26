#!/usr/bin/env node
/**
 * QA Etapa 7.1 — hardening worker aSMSC (sin SMS real, sin proveedor).
 * Uso: npm run build && node scripts/verify-sms-worker-hardening-qa.mjs
 */
import "dotenv/config";

const {
  isAttemptExhausted,
  getRetryDelayMs,
  computeNextScheduledAt,
} = await import("../dist/services/smsQueueRetryService.js");
const {
  tryAcquireProviderDispatchLock,
  releaseProviderDispatchLock,
  resetProviderDispatchLocksForTest,
  isProviderDispatchLocked,
} = await import("../dist/services/smsProviderDispatchLock.js");
const { getSmsQueueSchedulerConfig } = await import(
  "../dist/services/smsDispatchWorkerService.js"
);
const {
  logProviderDispatchIssue,
  sanitizeLogPayloadForAudit,
  maskDispatchApiId,
} = await import("../dist/utils/smsProviderDispatchLog.js");

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

console.log("QA worker hardening Etapa 7.1 (sin SMS real)\n");

// 1. attempts / max_attempts
assert(!isAttemptExhausted(0, 3), "attempts=0 no agotado con max=3");
assert(!isAttemptExhausted(2, 3), "attempts=2 no agotado con max=3");
assert(isAttemptExhausted(3, 3), "attempts=3 agotado con max=3 (bloquea 4.º HTTP)");
assert(isAttemptExhausted(4, 3), "attempts=4 agotado con max=3");

const maxHttpCalls = 3;
let simulatedAttempts = 0;
let httpCalls = 0;
while (!isAttemptExhausted(simulatedAttempts, maxHttpCalls)) {
  simulatedAttempts += 1;
  httpCalls += 1;
}
assert(httpCalls === 3, "simulación: exactamente 3 llamadas HTTP con max=3", String(httpCalls));

// 2. backoff
assert(getRetryDelayMs(1) === 60_000, "backoff tras intento 1 = 60s");
assert(getRetryDelayMs(2) === 180_000, "backoff tras intento 2 = 180s");
const t0 = Date.parse("2026-05-26T18:00:00.000Z");
const next1 = Date.parse(computeNextScheduledAt(1, t0));
assert(next1 - t0 === 60_000, "scheduled_at +60s tras intento 1");
const next2 = Date.parse(computeNextScheduledAt(2, t0));
assert(next2 - t0 === 180_000, "scheduled_at +180s tras intento 2");

// 3. provider lock
resetProviderDispatchLocksForTest();
const pid = "test-provider-asmsc";
assert(tryAcquireProviderDispatchLock(pid), "lock adquirido");
assert(isProviderDispatchLocked(pid), "lock activo");
assert(!tryAcquireProviderDispatchLock(pid), "segundo lock bloqueado (no paralelo)");
releaseProviderDispatchLock(pid);
assert(!isProviderDispatchLocked(pid), "lock liberado");
assert(tryAcquireProviderDispatchLock(pid), "lock re-adquirido tras release");
releaseProviderDispatchLock(pid);

// Simular concurrencia: con lock held, segundo acquire falla
resetProviderDispatchLocksForTest();
assert(tryAcquireProviderDispatchLock(pid), "primer lock en batch");
const blockedWhileHeld = tryAcquireProviderDispatchLock(pid);
assert(!blockedWhileHeld, "segundo lock bloqueado mientras el primero está activo");
releaseProviderDispatchLock(pid);
resetProviderDispatchLocksForTest();

// 4. scheduler config readable
const sch = getSmsQueueSchedulerConfig();
assert(typeof sch.enabled === "boolean", "scheduler.enabled leído");
assert(sch.intervalSeconds >= 1, "scheduler.intervalSeconds >= 1", String(sch.intervalSeconds));
assert(sch.batchSize >= 1, "scheduler.batchSize >= 1", String(sch.batchSize));

// 5. logs sanitizados
const logs = [];
const origWarn = console.warn;
console.warn = (...parts) => {
  logs.push(parts.join(" "));
};
logProviderDispatchIssue({
  providerId: pid,
  routeId: "route-1",
  queueId: "queue-1",
  messageId: "msg-1",
  campaignId: null,
  senderId: "TELVOICE",
  phone: "+56934449937",
  apiIdMasked: maskDispatchApiId("API211TEST"),
  endpointHost: "api.telvoice.net",
  attempt: 2,
  maxAttempts: 3,
  workerSource: "scheduler",
  errorCode: "F",
  errorMessage: "IP not Whitelisted",
});
console.warn = origWarn;

const logLine = logs.join("\n");
assert(!logLine.includes("api_password"), "log sin api_password");
assert(!logLine.includes("SECRET"), "log sin secretos");
assert(logLine.includes("IP not Whitelisted") || logLine.includes("provider_dispatch_issue"), "log incluye evento");
assert(logLine.includes("phone_masked"), "log incluye phone enmascarado");

const sanitized = sanitizeLogPayloadForAudit({
  api_id: "x",
  api_password: "must-not-appear",
  ok: true,
});
assert(!("api_password" in sanitized), "sanitizeLogPayloadForAudit omite password");

console.log(`\n=== RESUMEN: ${passed} OK, ${failed} fallos ===`);
process.exit(failed > 0 ? 1 : 0);
