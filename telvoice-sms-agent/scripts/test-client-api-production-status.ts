/**
 * Tests unitarios: estado productivo API cliente (panel + /app/api/keys).
 */
import assert from "node:assert/strict";
import { resolveClientApiProductionStatusFromInputs } from "../src/services/clientApiProductionStatusService.js";
import type { ClientApiKey } from "../src/types/client-api-keys.js";

const FELIPE_COMPANY_ID = "958688d8-0b85-4e35-9449-5dd6375fd2e4";
const LICANTRAVEL_COMPANY_ID = "d7a134e0-59f2-4cd0-8bda-9efaf0e27688";

function baseKey(overrides: Partial<ClientApiKey> = {}): ClientApiKey {
  return {
    id: "key-1",
    companyId: FELIPE_COMPANY_ID,
    name: "Production",
    keyPrefix: "tlv_live_i286zm15ly9",
    keyMasked: "tlv_live_i286zm15ly9••••••••",
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

function testFelipeOperational(): void {
  const status = resolveClientApiProductionStatusFromInputs({
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [
      { status: "active", api_enabled: true },
      { status: "active", api_enabled: true },
    ],
    keys: [baseKey()],
  });
  assert.equal(status.apiEnabled, true);
  assert.equal(status.hasProductionApprovedKey, true);
  assert.equal(status.canUseProductionApi, true);
  assert.equal(status.canSendApiSms, true);
  assert.deepEqual(status.blockingReasons, []);
  assert.equal(status.primaryProductionKeyPrefix, "tlv_live_i286zm15ly9");
  console.log("✓ Felipe: API productiva operativa");
}

function testLicantravelNotEnabled(): void {
  const status = resolveClientApiProductionStatusFromInputs({
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [{ status: "active", api_enabled: false }],
    keys: [],
  });
  assert.equal(status.canUseProductionApi, false);
  assert.equal(status.canSendApiSms, false);
  assert.ok(status.blockingReasons.includes("api_not_enabled"));
  assert.ok(status.blockingReasons.includes("no_active_api_key"));
  console.log("✓ Licantravel: bloqueos api_not_enabled + no_active_api_key");
}

function testMissingProductionApproval(): void {
  const status = resolveClientApiProductionStatusFromInputs({
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [{ status: "active", api_enabled: true }],
    keys: [baseKey({ productionApproved: false, companyId: LICANTRAVEL_COMPANY_ID })],
  });
  assert.equal(status.canUseProductionApi, false);
  assert.ok(status.blockingReasons.includes("missing_production_approval"));
  console.log("✓ key production sin aprobación");
}

function testInsufficientScopes(): void {
  const status = resolveClientApiProductionStatusFromInputs({
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [{ status: "active", api_enabled: true }],
    keys: [baseKey({ scopes: ["balance:read", "messages:read"] })],
  });
  assert.equal(status.hasProductionApprovedActiveKey, true);
  assert.equal(status.canUseProductionApi, true);
  assert.equal(status.canSendApiSms, false);
  assert.ok(status.blockingReasons.includes("insufficient_scopes"));
  console.log("✓ scopes insuficientes para sms:send");
}

function testInactiveKey(): void {
  const status = resolveClientApiProductionStatusFromInputs({
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [{ status: "active", api_enabled: true }],
    keys: [baseKey({ status: "paused" })],
  });
  assert.ok(status.blockingReasons.includes("no_active_api_key"));
  console.log("✓ key pausada");
}

async function main(): Promise<void> {
  testFelipeOperational();
  testLicantravelNotEnabled();
  testMissingProductionApproval();
  testInsufficientScopes();
  testInactiveKey();
  console.log("\nTodos los tests client-api-production-status OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
