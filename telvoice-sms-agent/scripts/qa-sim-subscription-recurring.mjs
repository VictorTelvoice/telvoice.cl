#!/usr/bin/env node
/**
 * QA offline: idempotencia y helpers de suscripción SIM (sin pago real).
 */
import {
  subscriptionCreditIdempotencyKey,
  hasSubscriptionCreditForPayment,
} from "../dist/services/simSubscriptionService.js";

const pre = "preapproval_test_123";
const pay = "payment_test_456";
const key = subscriptionCreditIdempotencyKey(pre, pay);

console.log("idempotency_key:", key);
if (key !== "subscription-credit:preapproval_test_123:payment_test_456") {
  console.error("✗ key format");
  process.exit(1);
}
console.log("✓ key format");

if (process.env.DATABASE_URL) {
  const exists = await hasSubscriptionCreditForPayment(pre, pay);
  console.log("hasSubscriptionCreditForPayment (expect false):", exists);
}

console.log("✅ qa-sim-subscription-recurring OK");
