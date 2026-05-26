#!/usr/bin/env node
/**
 * QA Etapa 7.2 — metadata TPS de campaña (sin SMS real, sin tick).
 * Uso: npm run build && node scripts/verify-campaign-tps-metadata-qa.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPolicy = join(__dirname, "../dist/services/smsTrafficPolicyService.js");
const distTpsMeta = join(__dirname, "../dist/utils/campaignTpsMetadata.js");
const distEnv = join(__dirname, "../dist/config/env.js");

if (!existsSync(distPolicy) || !existsSync(distTpsMeta)) {
  console.error("Ejecuta npm run build primero");
  process.exit(1);
}

const { resolveTrafficPolicy } = await import(pathToFileURL(distPolicy).href);
const {
  buildCampaignTpsMetadataFields,
  capRequestedTps,
  interpretCampaignTpsMetadata,
  isLegacyTargetTpsBatchMetadata,
} = await import(pathToFileURL(distTpsMeta).href);
const { env } = await import(pathToFileURL(distEnv).href);

const DEMO_COMPANY_ID =
  process.env.QA_COMPANY_ID || "6cd1db92-d5c7-45e0-8548-df8907843350";

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

console.log("QA metadata TPS campaña Etapa 7.2 (sin SMS real)\n");

const policy = await resolveTrafficPolicy({
  companyId: DEMO_COMPANY_ID,
  routeId: process.env.QA_ROUTE_ID,
  providerId: process.env.QA_PROVIDER_ID,
  ratePlanId: process.env.QA_RATE_PLAN_ID,
  trafficType: "transactional",
});

assert(policy.effective_tps >= 1, "resolveTrafficPolicy", `effective=${policy.effective_tps}`);
assert(policy.effective_tps <= 20, "effective_tps <= cap 20", String(policy.effective_tps));

const fields = buildCampaignTpsMetadataFields({ policy, requestedTps: null });
assert(fields.effective_tps === policy.effective_tps, "metadata.effective_tps = policy");
assert(
  fields.scheduler_batch_size === env.smsQueueScheduler.batchSize,
  "metadata.scheduler_batch_size = env batch",
  String(fields.scheduler_batch_size),
);
assert(
  fields.scheduler_interval_seconds === env.smsQueueScheduler.intervalSeconds,
  "metadata.scheduler_interval_seconds = env interval",
);
assert(fields.target_tps === fields.effective_tps, "target_tps = effective_tps (nuevo semántica)");
assert(fields.target_tps_semantics === "effective_tps", "target_tps_semantics documentado");
assert(
  fields.target_tps !== fields.scheduler_batch_size ||
    env.smsQueueScheduler.batchSize === policy.effective_tps,
  "target_tps ya no es batch salvo coincidencia numérica",
);

const highRequested = capRequestedTps(99, policy);
assert(
  highRequested != null && highRequested <= policy.effective_tps,
  "requested 99 limitado por política",
  String(highRequested),
);
const limitedFields = buildCampaignTpsMetadataFields({
  policy,
  requestedTps: 99,
});
assert(
  limitedFields.requested_tps === highRequested,
  "buildCampaign requested_tps capped",
);

const interpreted = interpretCampaignTpsMetadata(limitedFields);
assert(
  interpreted.requestedLimitedWarning != null ||
    (interpreted.requestedTps ?? 0) <= (interpreted.effectiveTps ?? 0),
  "warning o requested <= effective",
);

const legacyMeta = {
  target_tps: 15,
  production: true,
  bulk_queue: true,
};
assert(
  isLegacyTargetTpsBatchMetadata(legacyMeta),
  "detecta legacy target_tps = batch sin effective_tps",
);
const legacyInterp = interpretCampaignTpsMetadata(legacyMeta);
assert(legacyInterp.legacyTargetTpsWarning != null, "warning metadata legacy");
assert(
  legacyInterp.schedulerBatchSize === legacyMeta.target_tps,
  "legacy infiere batch desde target_tps histórico",
  String(legacyInterp.schedulerBatchSize),
);

const modernInterp = interpretCampaignTpsMetadata(fields);
assert(modernInterp.effectiveTps === policy.effective_tps, "interpret effective moderno");
assert(modernInterp.legacyTargetTpsWarning == null, "sin warning en metadata nueva");

console.log(`\n=== RESUMEN: ${passed} OK, ${failed} fallos ===`);
process.exit(failed > 0 ? 1 : 0);
