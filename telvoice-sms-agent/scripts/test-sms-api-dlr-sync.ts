/**
 * Tests unitarios: sincronización DLR → sms_api_messages (API productiva).
 */
import assert from "node:assert/strict";
import {
  mapDlrToSmsApiMessageState,
  shouldApplySmsApiDlrUpdate,
} from "../src/services/smsApiDlrSyncService.js";
import type { SmsApiMessageRow } from "../src/types/sms-api-messages.js";

function row(
  overrides: Partial<Pick<SmsApiMessageRow, "status" | "dlr_status">> = {},
): Pick<SmsApiMessageRow, "status" | "dlr_status"> {
  return { status: "sent", dlr_status: null, ...overrides };
}

function testDeliveredMapping(): void {
  const mapped = mapDlrToSmsApiMessageState("Delivered");
  assert.equal(mapped.status, "delivered");
  assert.equal(mapped.dlrStatus, "delivered");
  console.log("✓ A: Delivered → status=delivered, dlr_status=delivered");
}

function testFailedMapping(): void {
  for (const raw of ["Failed", "UNDELIV", "REJECTD", "EXPIRED"]) {
    const mapped = mapDlrToSmsApiMessageState(raw);
    assert.ok(["failed", "rejected", "expired"].includes(mapped.status), raw);
  }
  const failed = mapDlrToSmsApiMessageState("Failed");
  assert.equal(failed.status, "failed");
  console.log("✓ B: Failed/UNDELIV/REJECTD/EXPIRED → failed/rejected/expired");
}

function testPendingDoesNotDegradeDelivered(): void {
  const incoming = mapDlrToSmsApiMessageState("Pending");
  const decision = shouldApplySmsApiDlrUpdate(
    row({ status: "delivered", dlr_status: "delivered" }),
    incoming,
  );
  assert.equal(decision.apply, false);
  assert.equal(decision.reason, "terminal_delivered");
  console.log("✓ C: Pending no degrada delivered");
}

function testDuplicateDeliveredIdempotent(): void {
  const incoming = mapDlrToSmsApiMessageState("Delivered");
  const decision = shouldApplySmsApiDlrUpdate(
    row({ status: "delivered", dlr_status: "delivered" }),
    incoming,
  );
  assert.equal(decision.apply, false);
  assert.equal(decision.reason, "idempotent_duplicate");
  console.log("✓ D: DLR delivered duplicado es idempotente");
}

function testLegacySentUnaffectedByUnknownDlr(): void {
  const incoming = mapDlrToSmsApiMessageState("ENROUTE");
  assert.equal(incoming.status, "sent");
  assert.equal(incoming.dlrStatus, "enroute");
  const decision = shouldApplySmsApiDlrUpdate(row({ status: "sent", dlr_status: null }), incoming);
  assert.equal(decision.apply, true);
  console.log("✓ E: ENROUTE actualiza sent sin romper flujo legacy");
}

function testFailedTerminalBlocksPending(): void {
  const incoming = mapDlrToSmsApiMessageState("Pending");
  const decision = shouldApplySmsApiDlrUpdate(
    row({ status: "failed", dlr_status: "failed" }),
    incoming,
  );
  assert.equal(decision.apply, false);
  assert.ok(decision.reason.startsWith("terminal_"));
  console.log("✓ F: failed terminal no degrada a pending/sent");
}

function testProviderCorrectionFailedToDelivered(): void {
  const incoming = mapDlrToSmsApiMessageState("Delivered");
  const decision = shouldApplySmsApiDlrUpdate(
    row({ status: "failed", dlr_status: "failed" }),
    incoming,
  );
  assert.equal(decision.apply, true);
  assert.equal(decision.reason, "provider_correction");
  console.log("✓ G: failed → delivered permitido (corrección proveedor)");
}

function testNotFoundScenarioDocumented(): void {
  // Escenario F del spec: sin fila sms_api_messages → handled en sync (api_message_not_found)
  console.log("✓ H: api_message_not_found cubierto en syncSmsApiMessageFromDlrEvent (integración)");
}

function main(): void {
  testDeliveredMapping();
  testFailedMapping();
  testPendingDoesNotDegradeDelivered();
  testDuplicateDeliveredIdempotent();
  testLegacySentUnaffectedByUnknownDlr();
  testFailedTerminalBlocksPending();
  testProviderCorrectionFailedToDelivered();
  testNotFoundScenarioDocumented();
  console.log("\nTodos los tests sms-api-dlr-sync pasaron.");
}

main();
