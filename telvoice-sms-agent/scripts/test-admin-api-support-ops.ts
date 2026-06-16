/**
 * Tests: toggle API acceso admin + mensajes.
 */
import assert from "node:assert/strict";
import {
  buildApiAccessToggleMessage,
} from "../src/services/adminClientApiAccessService.js";
import { resolveClientApiProductionStatusFromInputs } from "../src/services/clientApiProductionStatusService.js";
import type { ClientApiKey } from "../src/types/client-api-keys.js";
import { resolveSupportReplyDisplayName, SUPPORT_PUBLIC_DISPLAY_NAME } from "../src/utils/supportDisplayName.js";
import { renderSupportTicketCreatedAdminAlert } from "../src/services/supportTicketNotificationService.js";

function productionKey(): ClientApiKey {
  return {
    id: "key-1",
    companyId: "company-1",
    name: "Prod",
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
  };
}

function testApiToggleMessages(): void {
  const withKey = resolveClientApiProductionStatusFromInputs({
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [{ status: "active", api_enabled: true }],
    keys: [productionKey()],
  });
  assert.match(
    buildApiAccessToggleMessage(true, withKey),
    /API productiva habilitada/i,
  );

  const withoutKey = resolveClientApiProductionStatusFromInputs({
    companyStatus: "active",
    walletStatus: "active",
    ratePlanRows: [{ status: "active", api_enabled: true }],
    keys: [],
  });
  assert.match(
    buildApiAccessToggleMessage(true, withoutKey),
    /crear o regenerar una API Key/i,
  );
  assert.equal(buildApiAccessToggleMessage(false, withKey), "API productiva desactivada.");
  console.log("✓ mensajes toggle API");
}

function testSupportDisplayName(): void {
  assert.equal(resolveSupportReplyDisplayName("Telvoice Superadmin"), SUPPORT_PUBLIC_DISPLAY_NAME);
  assert.equal(resolveSupportReplyDisplayName("Superadmin Telvoice"), SUPPORT_PUBLIC_DISPLAY_NAME);
  assert.equal(resolveSupportReplyDisplayName(null), SUPPORT_PUBLIC_DISPLAY_NAME);
  console.log("✓ nombre visible soporte");
}

function testSupportAlertTemplate(): void {
  const content = renderSupportTicketCreatedAdminAlert({
    companyName: "Empresa QA",
    clientEmail: "cliente@empresa.cl",
    ticket: {
      code: "TLV-1002",
      subject: "API no habilitada",
      priority: "Media",
      category: "api",
      message: "Hola, necesito ayuda con la API productiva.",
      createdAt: "2026-06-16T12:00:00.000Z",
    },
  });
  assert.match(content.subject, /TLV-1002/);
  assert.match(content.text, /Empresa QA/);
  assert.match(content.text, /cliente@empresa\.cl/);
  assert.match(content.text, /admin\/support/);
  assert.doesNotMatch(content.text, /tlv_live_/);
  console.log("✓ plantilla alerta ticket soporte");
}

testApiToggleMessages();
testSupportDisplayName();
testSupportAlertTemplate();
console.log("\nTodos los tests admin api/support OK");
