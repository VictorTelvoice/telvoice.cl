/**
 * Idempotency UUID y mensajes seguros al confirmar pending actions del agente.
 */
import assert from "node:assert/strict";
import { AppError } from "../src/utils/errors.js";
import {
  resolvePendingActionIdempotencyKey,
  formatAgentSmsSendError,
} from "../src/services/agent/executePendingAction.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID = "550e8400-e29b-41d4-a716-446655440000";

function testResolveKey(): void {
  assert.equal(resolvePendingActionIdempotencyKey(VALID), VALID);
  const bad = resolvePendingActionIdempotencyKey("agent-pending-abc");
  assert.match(bad, UUID_RE);
  assert.notEqual(bad, "agent-pending-abc");
  const legacy = resolvePendingActionIdempotencyKey(`agent-csv-${VALID}`);
  assert.match(legacy, UUID_RE);
  console.log("✓ resolvePendingActionIdempotencyKey → UUID válido");
}

function testSafeUserMessage(): void {
  const msg = formatAgentSmsSendError(
    new AppError("idempotency_key debe ser un UUID válido.", 400),
  );
  assert.ok(!/idempotency_key/i.test(msg));
  assert.match(msg, /No pude completar el envío/i);
  assert.match(msg, /No se descontó saldo/i);

  const saldo = formatAgentSmsSendError(
    new AppError("Saldo insuficiente en wallet.", 400),
  );
  assert.match(saldo, /saldo suficiente/i);

  console.log("✓ errores técnicos no visibles al cliente");
}

function main(): void {
  console.log("=== test:agent-pending-idempotency ===\n");
  testResolveKey();
  testSafeUserMessage();
  console.log("\nTodas las pruebas pasaron.");
}

main();
