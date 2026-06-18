#!/usr/bin/env node
/**
 * QA del template de alerta interna — cliente nuevo + compra SMS.
 * Solo render + idempotency key; no envía correo real ni toca wallet.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distTemplates = join(__dirname, "../dist/services/transactionalEmailTemplates.js");
const distSvc = join(__dirname, "../dist/services/newCustomerPurchaseAlertEmailService.js");

const templates = await import(pathToFileURL(distTemplates).toString());
const svc = await import(pathToFileURL(distSvc).toString());

const orderId = "00000000-0000-4000-8000-000000000099";
const idempotencyKey = svc.newCustomerPurchaseAlertIdempotencyKey(orderId);
assert.equal(idempotencyKey, `new-customer-purchase-alert:${orderId}`);

const maliciousName = 'Empresa <script>alert("x")</script> Demo';
const rendered = templates.renderNewCustomerPurchaseInternalAlert({
  companyName: maliciousName,
  buyerEmail: "cliente@example.com",
  whatsapp: "+56912345678",
  taxId: "12.345.678-9",
  legalName: "Empresa Demo SpA",
  packageName: "Bolsa 1.000 SMS",
  smsQuantity: 1000,
  netAmount: 84034,
  taxAmount: 15966,
  totalAmount: 100000,
  currency: "CLP",
  orderStatusLabel: "Pago: paid · Crédito: credited",
  walletStatusLabel: "Acreditada · saldo 1.000 SMS",
  orderRef: "TV-ORD-12345",
  orderId,
  mercadoPagoPaymentId: "987654321",
  purchasedAt: new Date().toISOString(),
  isConfirmedNewCustomer: true,
  probableNewCustomer: false,
  adminClientUrl: "https://admin.telvoice.cl/admin/clients?q=cliente%40example.com",
  adminOrderUrl: `https://admin.telvoice.cl/admin/orders/${orderId}`,
});

assert.match(
  rendered.subject,
  /Nuevo cliente compró SMS en Telvoice — Empresa <script>alert\("x"\)<\/script> Demo/,
);
assert.ok(rendered.html.includes("&lt;script&gt;"), "HTML debe escapar tags peligrosos");
assert.ok(!rendered.html.includes("<script>alert"), "HTML no debe incluir script sin escapar");
assert.match(rendered.text, /Bolsa 1.000 SMS \(1\.000 SMS\)/);
assert.match(rendered.html, /Ver cliente en superadmin/);
assert.match(rendered.html, /Ver orden en superadmin/);
assert.match(rendered.html, /Nueva compra online/);
assert.match(rendered.html, /Cliente nuevo/);
assert.match(rendered.html, /MercadoPago payment id/);

const assessmentPending = await svc.assessNewCustomerPurchaseAlert({
  id: orderId,
  payment_status: "pending",
  credit_status: "pending",
  sms_quantity: 1000,
  amount: 100000,
  currency: "CLP",
  package_id: "pkg-1",
  metadata: { provision_is_new_company: true },
});

assert.equal(assessmentPending.shouldAlert, false);
assert.equal(assessmentPending.reason, "not_paid");

const assessmentNew = await svc.assessNewCustomerPurchaseAlert({
  id: orderId,
  payment_status: "paid",
  credit_status: "credited",
  sms_quantity: 1000,
  amount: 100000,
  currency: "CLP",
  package_id: "pkg-1",
  package_name: "Bolsa 1.000 SMS",
  metadata: { provision_is_new_company: true },
});
assert.equal(assessmentNew.shouldAlert, true);
assert.equal(assessmentNew.isConfirmedNewCustomer, true);

const recipients = svc.resolveNewCustomerNotifyEmails();
assert.ok(Array.isArray(recipients) && recipients.length >= 1);
assert.ok(recipients.every((e) => e.includes("@")));

console.log(
  JSON.stringify(
    {
      ok: true,
      templateKey: svc.NEW_CUSTOMER_PURCHASE_ALERT_TEMPLATE_KEY,
      subject: rendered.subject,
      idempotencyKey,
      recipientKeyExample: `${idempotencyKey}:${recipients[0]}`,
      assessmentNew,
      recipients,
    },
    null,
    2,
  ),
);

console.log("verify-new-customer-purchase-alert-email-template: OK");
