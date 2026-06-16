/**
 * Tests: auto-aprobación de API Keys production al crear desde panel cliente.
 */
import assert from "node:assert/strict";
import {
  MIN_PRODUCTION_API_SCOPES,
  mergeMinProductionApiScopes,
  shouldAutoApproveProductionKeyOnCreate,
} from "../src/services/clientApiKeyService.js";
import { resolveClientApiProductionStatusFromInputs } from "../src/services/clientApiProductionStatusService.js";
import type { ClientApiKey } from "../src/types/client-api-keys.js";
import type { ClientApiProductionStatus } from "../src/types/client-api-production-status.js";

const COMPANY_ID = "958688d8-0b85-4e35-9449-5dd6375fd2e4";
const USER_ID = "user-owner-1";

function productionKey(overrides: Partial<ClientApiKey> = {}): ClientApiKey {
  return {
    id: "key-existing",
    companyId: COMPANY_ID,
    name: "API TLV-1001",
    keyPrefix: "tlv_live_abcd1234",
    keyMasked: "tlv_live_••••••••••••1234",
    status: "active",
    scopes: ["balance:read", "messages:read", "sms:send"],
    environment: "production",
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    revokedReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    productionApproved: true,
    productionApprovedAt: "2026-01-01T00:00:00.000Z",
    productionApprovedByAdminId: "admin-1",
    productionApprovalNotes: null,
    ...overrides,
  };
}

function enabledCompanyStatus(keys: ClientApiKey[] = [productionKey()]): ClientApiProductionStatus {
  return resolveClientApiProductionStatusFromInputs({
    companyId: COMPANY_ID,
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [{ status: "active", api_enabled: true }],
    keys,
  });
}

function firstKeyCompanyStatus(): ClientApiProductionStatus {
  return resolveClientApiProductionStatusFromInputs({
    companyId: COMPANY_ID,
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [{ status: "active", api_enabled: true }],
    keys: [],
  });
}

function testMergeScopesPreservesExtras(): void {
  const merged = mergeMinProductionApiScopes(["sms:send"]);
  for (const scope of MIN_PRODUCTION_API_SCOPES) {
    assert.ok(merged.includes(scope), `falta scope mínimo ${scope}`);
  }
  assert.equal(merged.length, MIN_PRODUCTION_API_SCOPES.length);
  console.log("✓ scopes mínimos fusionados sin perder extras");
}

function testAutoApproveWhenCompanyAlreadyProductionEnabled(): void {
  const status = enabledCompanyStatus();
  assert.equal(status.canUseProductionApi, true);

  const should = shouldAutoApproveProductionKeyOnCreate({
    environment: "production",
    companyId: COMPANY_ID,
    createdByUserId: USER_ID,
    productionStatus: status,
    existingProductionKeys: [productionKey()],
  });
  assert.equal(should, true);
  console.log("✓ auto-aprueba production con empresa ya habilitada");
}

function testAutoApproveFirstProductionKeyWhenApiEnabled(): void {
  const status = firstKeyCompanyStatus();
  assert.equal(status.canUseProductionApi, false);
  assert.equal(status.apiEnabled, true);

  const should = shouldAutoApproveProductionKeyOnCreate({
    environment: "production",
    companyId: COMPANY_ID,
    createdByUserId: USER_ID,
    productionStatus: status,
    existingProductionKeys: [],
  });
  assert.equal(should, true);
  console.log("✓ auto-aprueba primer key production si api_enabled en plan");
}

function testNoAutoApproveSandbox(): void {
  const status = enabledCompanyStatus();
  const should = shouldAutoApproveProductionKeyOnCreate({
    environment: "sandbox",
    companyId: COMPANY_ID,
    createdByUserId: USER_ID,
    productionStatus: status,
    existingProductionKeys: [productionKey()],
  });
  assert.equal(should, false);
  console.log("✓ no auto-aprueba sandbox");
}

function testNoAutoApproveWhenApiDisabled(): void {
  const status = resolveClientApiProductionStatusFromInputs({
    companyId: COMPANY_ID,
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [{ status: "active", api_enabled: false }],
    keys: [],
  });
  const should = shouldAutoApproveProductionKeyOnCreate({
    environment: "production",
    companyId: COMPANY_ID,
    createdByUserId: USER_ID,
    productionStatus: status,
    existingProductionKeys: [],
  });
  assert.equal(should, false);
  console.log("✓ no auto-aprueba si api_enabled=false");
}

function testNoAutoApproveWhenWalletInactive(): void {
  const status = resolveClientApiProductionStatusFromInputs({
    companyId: COMPANY_ID,
    companyStatus: "active",
    walletStatus: "suspended",
    ratePlanRows: [{ status: "active", api_enabled: true }],
    keys: [productionKey()],
  });
  const should = shouldAutoApproveProductionKeyOnCreate({
    environment: "production",
    companyId: COMPANY_ID,
    createdByUserId: USER_ID,
    productionStatus: status,
    existingProductionKeys: [productionKey()],
  });
  assert.equal(should, false);
  console.log("✓ no auto-aprueba si wallet inactive");
}

function testNoAutoApproveWithoutActor(): void {
  const status = enabledCompanyStatus();
  const should = shouldAutoApproveProductionKeyOnCreate({
    environment: "production",
    companyId: COMPANY_ID,
    createdByUserId: null,
    productionStatus: status,
    existingProductionKeys: [productionKey()],
  });
  assert.equal(should, false);
  console.log("✓ no auto-aprueba sin actor cliente");
}

function testNoAutoApproveQaDemoBlocking(): void {
  const status = resolveClientApiProductionStatusFromInputs({
    companyId: COMPANY_ID,
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [{ status: "active", api_enabled: true }],
    keys: [productionKey()],
    qaDemoAccount: true,
  });
  const should = shouldAutoApproveProductionKeyOnCreate({
    environment: "production",
    companyId: COMPANY_ID,
    createdByUserId: USER_ID,
    productionStatus: status,
    existingProductionKeys: [productionKey()],
  });
  assert.equal(should, false);
  console.log("✓ no auto-aprueba cuenta QA/demo");
}

function testNoSecretsInPureFunctions(): void {
  const sample = "tlv_live_secret_should_not_appear_in_tests";
  const merged = mergeMinProductionApiScopes(["sms:send"]);
  const serialized = JSON.stringify(merged);
  assert.doesNotMatch(serialized, /tlv_live_/);
  assert.doesNotMatch(sample, /plainTextKey/);
  console.log("✓ funciones puras no exponen secret");
}

testMergeScopesPreservesExtras();
testAutoApproveWhenCompanyAlreadyProductionEnabled();
testAutoApproveFirstProductionKeyWhenApiEnabled();
testNoAutoApproveSandbox();
testNoAutoApproveWhenApiDisabled();
testNoAutoApproveWhenWalletInactive();
testNoAutoApproveWithoutActor();
testNoAutoApproveQaDemoBlocking();
testNoSecretsInPureFunctions();
console.log("\nTodos los tests client-api-key-auto-approval OK");
