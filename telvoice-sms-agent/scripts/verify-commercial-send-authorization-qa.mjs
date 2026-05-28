#!/usr/bin/env node
/**
 * QA — clientes retail con rate plan pueden enviar sin allowlist manual.
 * npm run build && node scripts/verify-commercial-send-authorization-qa.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SENDAS_COMPANY = "8d95a776-8527-41bc-8fa1-387b756733a5";

const distAuth = join(
  __dirname,
  "../dist/services/commercialSmsAuthorizationService.js",
);
const distLimiter = join(
  __dirname,
  "../dist/services/smsLiveTestLimiterService.js",
);
const distCampaign = join(__dirname, "../dist/services/smsCampaignPolicy.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function parseCsv(v) {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

if (!existsSync(distAuth)) {
  console.error("npm run build requerido");
  process.exit(1);
}

const {
  isCompanyAuthorizedForPanelSmsSend,
  companyHasOperationalRatePlan,
  isCompanyInLiveTestAllowlist,
} = await import(pathToFileURL(distAuth).href);

const { getLiveTestSendPageStatus } = await import(
  pathToFileURL(distLimiter).href,
);
const { assertCampaignRecipientAllowed } = await import(
  pathToFileURL(distCampaign).href,
);

assert(
  process.env.ALLOW_RATE_PLAN_COMPANIES_TO_SEND === "true" ||
    process.env.ALLOW_RATE_PLAN_COMPANIES_TO_SEND === undefined,
  "ALLOW_RATE_PLAN_COMPANIES_TO_SEND debe ser true (default)",
);

const allowBypass =
  process.env.ALLOW_RATE_PLAN_COMPANIES_TO_SEND !== "false";
assert(allowBypass, "ALLOW_RATE_PLAN_COMPANIES_TO_SEND=false bloquearía retail");

const inAllowlist = isCompanyInLiveTestAllowlist(SENDAS_COMPANY);
const hasPlan = await companyHasOperationalRatePlan(SENDAS_COMPANY);
const authorized = await isCompanyAuthorizedForPanelSmsSend(SENDAS_COMPANY);

assert(hasPlan, "sendas: rate plan operativo CL");
assert(authorized, "sendas: autorizada para panel SMS");

const pageStatus = await getLiveTestSendPageStatus(SENDAS_COMPANY);
assert(
  pageStatus.canSelectLiveTest === true,
  `canSelectLiveTest: ${pageStatus.liveTestBlockReason}`,
);
assert(
  !pageStatus.liveTestBlockReason,
  `liveTestBlockReason: ${pageStatus.liveTestBlockReason}`,
);

const phones = ["56934449937", "56974713166", "56977109623"];
for (const p of phones) {
  await assertCampaignRecipientAllowed({
    companyId: SENDAS_COMPANY,
    to: p,
  });
}

const allowlist = parseCsv(process.env.SMS_LIVE_TEST_ALLOWED_COMPANY_IDS);
console.log(
  JSON.stringify(
    {
      ok: true,
      company_id: SENDAS_COMPANY,
      in_live_test_allowlist: inAllowlist,
      allowlist_count: allowlist.length,
      authorized_via_rate_plan: hasPlan && allowBypass,
      canSelectLiveTest: pageStatus.canSelectLiveTest,
      route: pageStatus.routeName,
      provider: pageStatus.providerName,
      note: inAllowlist
        ? "También en allowlist QA; retail funciona con o sin ella si ALLOW_RATE_PLAN…=true"
        : "Autorizado solo por rate plan (sin allowlist)",
    },
    null,
    2,
  ),
);

console.log("\n✅ verify-commercial-send-authorization-qa OK");
