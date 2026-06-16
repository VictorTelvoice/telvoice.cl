/**
 * Tests unitarios: acceso envío API productivo (sin dispatch real).
 */
import assert from "node:assert/strict";
import {
  publicApiErrorCodeForBlockingReason,
  resolveClientApiProductionStatusFromInputs,
} from "../src/services/clientApiProductionStatusService.js";
import type { ClientApiKey } from "../src/types/client-api-keys.js";
import type { AuthenticatedApiKeyContext } from "../src/types/client-api-keys.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const FELIPE_COMPANY_ID = "958688d8-0b85-4e35-9449-5dd6375fd2e4";

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

function felipeAuth(overrides: Partial<AuthenticatedApiKeyContext> = {}): AuthenticatedApiKeyContext {
  return {
    apiKeyId: "key-1",
    companyId: FELIPE_COMPANY_ID,
    environment: "production",
    scopes: ["balance:read", "messages:read", "sms:send"],
    keyPrefix: "tlv_live_i286zm15ly9",
    productionApproved: true,
    ...overrides,
  };
}

function testFelipeLikeApproved(): void {
  const status = resolveClientApiProductionStatusFromInputs({
    companyId: FELIPE_COMPANY_ID,
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [{ status: "active", api_enabled: true }],
    keys: [baseKey()],
    qaDemoAccount: false,
  });
  assert.equal(status.canSendApiSms, true);
  const auth = felipeAuth();
  assert.equal(auth.productionApproved, true);
  assert.ok(auth.scopes.includes("sms:send"));
  console.log("✓ Felipe-like: canSendApiSms + auth OK");
}

function testNotApproved(): void {
  const status = resolveClientApiProductionStatusFromInputs({
    companyId: FELIPE_COMPANY_ID,
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [{ status: "active", api_enabled: true }],
    keys: [baseKey({ productionApproved: false })],
    qaDemoAccount: false,
  });
  assert.equal(status.canSendApiSms, false);
  assert.equal(
    publicApiErrorCodeForBlockingReason("missing_production_approval"),
    "PRODUCTION_KEY_NOT_APPROVED",
  );
  console.log("✓ key sin production_approved → PRODUCTION_KEY_NOT_APPROVED");
}

function testApiNotEnabled(): void {
  const status = resolveClientApiProductionStatusFromInputs({
    companyId: FELIPE_COMPANY_ID,
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [{ status: "active", api_enabled: false }],
    keys: [baseKey()],
    qaDemoAccount: false,
  });
  assert.equal(status.canSendApiSms, false);
  assert.equal(publicApiErrorCodeForBlockingReason("api_not_enabled"), "API_NOT_ENABLED");
  console.log("✓ api_enabled false → API_NOT_ENABLED");
}

function testInsufficientScope(): void {
  const status = resolveClientApiProductionStatusFromInputs({
    companyId: FELIPE_COMPANY_ID,
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [{ status: "active", api_enabled: true }],
    keys: [baseKey({ scopes: ["balance:read", "messages:read"] })],
    qaDemoAccount: false,
  });
  assert.equal(status.canSendApiSms, false);
  assert.ok(status.blockingReasons.includes("insufficient_scopes"));
  console.log("✓ sin sms:send → INSUFFICIENT_SCOPE");
}

function testWalletInactive(): void {
  const status = resolveClientApiProductionStatusFromInputs({
    companyId: FELIPE_COMPANY_ID,
    companyStatus: "active",
    walletStatus: "frozen",
    ratePlanRows: [{ status: "active", api_enabled: true }],
    keys: [baseKey()],
    qaDemoAccount: false,
  });
  assert.equal(status.canSendApiSms, false);
  assert.ok(status.blockingReasons.includes("wallet_inactive"));
  console.log("✓ wallet inactiva");
}

function testControllerNoGlobalProductionBlock(): void {
  const controllerPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/controllers/public-api-sms-send.controller.ts",
  );
  const source = readFileSync(controllerPath, "utf8");
  assert.ok(!source.includes("PRODUCTION_SEND_NOT_ENABLED"));
  assert.ok(source.includes("validateProductionApiSmsSendAccess"));
  assert.ok(source.includes("resolveProductionSmsSend"));
  console.log("✓ controller sin PRODUCTION_SEND_NOT_ENABLED global");
}

async function main(): Promise<void> {
  testFelipeLikeApproved();
  testNotApproved();
  testApiNotEnabled();
  testInsufficientScope();
  testWalletInactive();
  testControllerNoGlobalProductionBlock();
  console.log("\nTodos los tests public-api-production-send-access OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
