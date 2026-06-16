/**
 * Tests: documentación API sandbox vs producción (PDF/HTML content).
 */
import assert from "node:assert/strict";
import {
  buildApiDocContentOptions,
  docSnippetMessageList,
  docSnippetSend,
  getApiDocErrorRows,
  getApiDocLegalNote,
  getApiDocStatusLine,
  getApiDocSubtitle,
  resolveApiDocMode,
} from "../src/views/app-ui/api-documentation-content.js";
import { resolveClientApiProductionStatusFromInputs } from "../src/services/clientApiProductionStatusService.js";
import type { ClientApiKey } from "../src/types/client-api-keys.js";

const FELIPE_COMPANY_ID = "958688d8-0b85-4e35-9449-5dd6375fd2e4";
const LICAN_COMPANY_ID = "d7a134e0-59f2-4cd0-8bda-9efaf0e27688";

function productionKey(companyId: string): ClientApiKey {
  return {
    id: "key-prod-1",
    companyId,
    name: "Production",
    keyPrefix: "tlv_live_i286zm15ly9",
    keyMasked: "tlv_live_••••••••••••ly9x",
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
  };
}

function felipeStatus() {
  return resolveClientApiProductionStatusFromInputs({
    companyId: FELIPE_COMPANY_ID,
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [{ status: "active", api_enabled: true }],
    keys: [productionKey(FELIPE_COMPANY_ID)],
  });
}

function licanStatus() {
  return resolveClientApiProductionStatusFromInputs({
    companyId: LICAN_COMPANY_ID,
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [{ status: "active", api_enabled: true }],
    keys: [productionKey(LICAN_COMPANY_ID)],
  });
}

function sandboxStatus() {
  return resolveClientApiProductionStatusFromInputs({
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [{ status: "active", api_enabled: false }],
    keys: [],
  });
}

function testProductionModeFelipe(): void {
  const mode = resolveApiDocMode(felipeStatus());
  assert.equal(mode, "production");
  const doc = buildApiDocContentOptions(felipeStatus(), "tlv_live_••••••••••••ly9x");
  assert.match(getApiDocSubtitle(doc), /productiva/i);
  assert.match(getApiDocStatusLine(doc), /Producción activa/i);
  assert.doesNotMatch(docSnippetSend(doc), /sandbox/i);
  assert.doesNotMatch(docSnippetMessageList(doc), /sandbox_accepted/);
  assert.ok(!getApiDocErrorRows(doc).some((r) => r.code === "PRODUCTION_SEND_NOT_ENABLED"));
  assert.match(getApiDocLegalNote(doc), /consumen saldo SMS real/i);
  console.log("✓ Felipe: modo producción en documentación");
}

function testProductionModeLicantravel(): void {
  const doc = buildApiDocContentOptions(licanStatus());
  assert.equal(doc.mode, "production");
  assert.match(docSnippetSend(doc), /TU_API_KEY/);
  assert.match(docSnippetMessageList(doc), /status=sent/);
  console.log("✓ Licantravel: modo producción en documentación");
}

function testSandboxModePending(): void {
  const doc = buildApiDocContentOptions(sandboxStatus());
  assert.equal(doc.mode, "sandbox");
  assert.match(getApiDocSubtitle(doc), /Sandbox/i);
  assert.match(getApiDocStatusLine(doc), /no habilitado/i);
  assert.match(docSnippetSend(doc), /sandbox/);
  assert.match(docSnippetMessageList(doc), /sandbox_accepted/);
  assert.ok(getApiDocErrorRows(doc).some((r) => r.code === "PRODUCTION_SEND_NOT_ENABLED"));
  console.log("✓ Cuenta pending: documentación sandbox");
}

function main(): void {
  testProductionModeFelipe();
  testProductionModeLicantravel();
  testSandboxModePending();
  console.log("\nTodos los tests api-documentation-content OK");
}

main();
