#!/usr/bin/env node
/**
 * QA: parser de webhook agente (topics payment / subscription).
 */
import assert from "node:assert/strict";
import {
  parseMercadoPagoWebhookFromParts,
  isMercadoPagoSubscriptionWebhookTopic,
} from "../dist/utils/mercadoPagoWebhookRequest.js";

const pre = parseMercadoPagoWebhookFromParts({
  query: { topic: "subscription_preapproval", id: "pre-1" },
  body: {},
  headers: { "x-telvoice-webhook-forward": "www-legacy" },
  method: "GET",
});
assert.equal(pre.topic, "subscription_preapproval");
assert.equal(pre.resourceId, "pre-1");
assert.equal(pre.deliverySource, "www-forward");
assert.equal(isMercadoPagoSubscriptionWebhookTopic(pre.topic), true);

const auth = parseMercadoPagoWebhookFromParts({
  query: {},
  body: { type: "subscription_authorized_payment", data: { id: "auth-9" } },
  method: "POST",
});
assert.equal(auth.topic, "subscription_authorized_payment");
assert.equal(auth.resourceId, "auth-9");
assert.equal(auth.deliverySource, "direct");

const pay = parseMercadoPagoWebhookFromParts({
  query: { topic: "payment", id: "pay-77" },
  body: {},
  method: "GET",
});
assert.equal(pay.topic, "payment");
assert.equal(pay.resourceId, "pay-77");
assert.equal(isMercadoPagoSubscriptionWebhookTopic(pay.topic), false);

console.log(JSON.stringify({ ok: true, tests: 3 }, null, 2));
