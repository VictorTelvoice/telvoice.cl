/**
 * Guardias VERIFY_TEST → empresa QA interna únicamente.
 */
import assert from "node:assert/strict";
import {
  DEFAULT_INTERNAL_QA_COMPANY_ID,
  assertInternalQaCompanyForTestSend,
  isInternalQaCompany,
  resolveAdminMessageCompanyLabel,
  resolveInternalQaCompanyId,
} from "../src/services/internalQaCompanyService.js";
import { APP_VERIFY_TEST_SOURCE } from "../src/services/smsLiveTestLimiterService.js";

const FELIPE_COMPANY_ID = "958688d8-0b85-4e35-9449-5dd6375fd2e4";

assert.equal(resolveInternalQaCompanyId(), DEFAULT_INTERNAL_QA_COMPANY_ID);

assert.equal(
  resolveAdminMessageCompanyLabel("felipevalenciao@gmail.com", {
    source: APP_VERIFY_TEST_SOURCE,
  }),
  "Telvoice QA",
);

assert.equal(
  resolveAdminMessageCompanyLabel("Empresa Demo Telvoice", {
    internal_test: true,
  }),
  "Telvoice QA",
);

let blocked = false;
try {
  await assertInternalQaCompanyForTestSend(FELIPE_COMPANY_ID);
} catch (e) {
  blocked = e instanceof Error && e.message.includes("VERIFY_TEST");
}
assert.equal(blocked, true, "Felipe debe bloquearse");

assert.equal(
  await isInternalQaCompany(DEFAULT_INTERNAL_QA_COMPANY_ID),
  true,
);

console.log("test-internal-qa-company-guard: OK");
