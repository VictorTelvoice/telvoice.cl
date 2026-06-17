/**
 * Guardias VERIFY_TEST → empresa QA interna únicamente.
 */
import assert from "node:assert/strict";
import {
  DEFAULT_INTERNAL_QA_COMPANY_ID,
  assertInternalQaCompanyForTestSend,
  formatShortCompanyId,
  isInternalQaCompany,
  resolveAdminMessageCompanyLabel,
  resolveInternalQaCompanyId,
} from "../src/services/internalQaCompanyService.js";
import { APP_VERIFY_TEST_SOURCE } from "../src/services/smsLiveTestLimiterService.js";
import { renderAdminTestPage } from "../src/views/admin-ui/sections/test-page.js";

const FELIPE_COMPANY_ID = "958688d8-0b85-4e35-9449-5dd6375fd2e4";

const qaContext = {
  companyId: DEFAULT_INTERNAL_QA_COMPANY_ID,
  companyIdShort: formatShortCompanyId(DEFAULT_INTERNAL_QA_COMPANY_ID),
  companyName: "Empresa Demo Telvoice",
  alias: "Telvoice QA",
  availableSms: 4982,
};

const superadminHtml = renderAdminTestPage({
  admin: {
    id: "admin-1",
    email: "victor@telvoice.net",
    name: "Telvoice Superadmin",
    role: "superadmin",
  },
  panel: null,
  sendEnabled: false,
  qaContext,
});

assert.match(superadminHtml, /Contexto QA interno/);
assert.match(superadminHtml, /Empresa Demo Telvoice/);
assert.match(superadminHtml, /Telvoice QA/);
assert.match(superadminHtml, /6cd1db92…3350/);
assert.match(superadminHtml, /Copiar ID/);
assert.doesNotMatch(superadminHtml, /felipevalenciao/i);

const operatorHtml = renderAdminTestPage({
  admin: {
    id: "admin-2",
    email: "ops@telvoice.net",
    name: "Operador",
    role: "telvoice_operator",
  },
  panel: null,
  sendEnabled: false,
  qaContext,
});

assert.doesNotMatch(operatorHtml, /Contexto QA interno/);

assert.equal(resolveInternalQaCompanyId(), DEFAULT_INTERNAL_QA_COMPANY_ID);

assert.equal(
  formatShortCompanyId(DEFAULT_INTERNAL_QA_COMPANY_ID),
  "6cd1db92…3350",
);

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
