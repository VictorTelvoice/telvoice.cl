#!/usr/bin/env node
/**
 * QA local: plantillas post-compra numeración SIM (sin envío ni DB).
 */
import assert from "node:assert/strict";
import {
  renderSimSubscriptionPaymentConfirmed,
  renderSimSubscriptionInternalAlert,
} from "../dist/services/transactionalEmailTemplates.js";
import { resolveSimSubscriptionNotifyEmails } from "../dist/services/transactionalEmailService.js";

const customer = renderSimSubscriptionPaymentConfirmed({
  contactName: "Fer Miranda",
  planName: "Número Real Starter",
  assignedNumber: null,
  activationStatus: "paid_pending_activation",
  includedSmsMonthly: 1000,
  amount: 1250,
  currency: "CLP",
  billingCycle: "mensual",
  nextRenewal: "19 de julio de 2026",
  numeracionesUrl: "https://agent.telvoice.cl/app/numeraciones",
  panelAccessUrl: "https://agent.telvoice.cl/auth/magic?token=example",
});

assert.equal(
  customer.subject,
  "Recibimos tu compra de numeración SIM real en Telvoice",
);
assert.match(
  customer.html,
  /24 a 48 horas hábiles/,
  "debe indicar plazo de activación",
);
assert.match(customer.html, /Acceder al panel Telvoice/);

const internal = renderSimSubscriptionInternalAlert({
  companyName: "Fer Miranda",
  checkoutEmail: "fermiranda9303@gmail.com",
  phone: "+56912345678",
  planName: "Número Real Starter",
  assignedNumber: null,
  amount: 1250,
  currency: "CLP",
  paymentId: "164841006974",
  preapprovalId: "960bf2c8869849abb5e0ea493c0bfaea",
  activationStatus: "paid_pending_activation",
  orderId: "8b2dd4e7-404f-4d1c-9896-adfe35f89bf5",
  adminUrl: "https://agent.telvoice.cl/admin/numeraciones?sim_pending=1",
});

assert.equal(
  internal.subject,
  "Nueva compra de numeración SIM real — Telvoice",
);
assert.match(internal.html, /164841006974/);
assert.match(internal.html, /paid_pending_activation/);

const notify = resolveSimSubscriptionNotifyEmails();
assert.ok(Array.isArray(notify) && notify.length >= 1, "notify list");

console.log(JSON.stringify({ ok: true, notify, customerSubject: customer.subject, internalSubject: internal.subject }, null, 2));
