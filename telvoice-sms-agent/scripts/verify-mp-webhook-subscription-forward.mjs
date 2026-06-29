#!/usr/bin/env node
/**
 * QA: parser y forward URL del webhook legacy www → agent.
 */
import assert from "node:assert/strict";
import {
  extractMercadoPagoSubscriptionWebhookEvent,
  buildAgentWebhookForwardUrl,
  SUBSCRIPTION_WEBHOOK_TOPICS,
} from "../../lib/mercadopago-webhook-forward.js";

assert.ok(SUBSCRIPTION_WEBHOOK_TOPICS.has("subscription_preapproval"));
assert.ok(SUBSCRIPTION_WEBHOOK_TOPICS.has("subscription_authorized_payment"));

const preReq = {
  method: "GET",
  query: { topic: "subscription_preapproval", id: "abc123" },
  body: {},
};
const pre = extractMercadoPagoSubscriptionWebhookEvent(preReq);
assert.deepEqual(pre, {
  topic: "subscription_preapproval",
  resourceId: "abc123",
});

const authReq = {
  method: "POST",
  query: {},
  body: {
    type: "subscription_authorized_payment",
    data: { id: "7029511954" },
  },
};
const auth = extractMercadoPagoSubscriptionWebhookEvent(authReq);
assert.deepEqual(auth, {
  topic: "subscription_authorized_payment",
  resourceId: "7029511954",
});

const paymentReq = {
  method: "GET",
  query: { topic: "payment", id: "165517293751" },
  body: {},
};
assert.equal(extractMercadoPagoSubscriptionWebhookEvent(paymentReq), null);

const forwardUrl = buildAgentWebhookForwardUrl(
  "https://agent.telvoice.cl/api/mercadopago/webhook",
  preReq,
);
assert.equal(
  forwardUrl,
  "https://agent.telvoice.cl/api/mercadopago/webhook?topic=subscription_preapproval&id=abc123",
);

console.log(JSON.stringify({ ok: true, tests: 5 }, null, 2));
