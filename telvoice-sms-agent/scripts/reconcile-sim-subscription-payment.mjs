#!/usr/bin/env node
/**
 * Reconciliación segura — suscripción SIM MercadoPago (primer cobro / activación).
 *
 * Uso:
 *   node scripts/reconcile-sim-subscription-payment.mjs \
 *     --operation-id 164839622838 \
 *     --email fermiranda9303@gmail.com \
 *     --dry-run
 *
 *   node scripts/reconcile-sim-subscription-payment.mjs \
 *     --order-id <UUID> --email fermiranda9303@gmail.com --apply
 */
import "dotenv/config";

function arg(name) {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return null;
}

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !apply;
const operationId = arg("operation-id") ?? arg("operationId");
const orderId = arg("order-id") ?? arg("orderId");
const preapprovalId = arg("preapproval-id") ?? arg("preapprovalId");
const externalReference = arg("external-reference") ?? arg("externalReference");
const expectedEmail = (arg("email") ?? arg("expected-email") ?? "").trim().toLowerCase();

if (!operationId && !orderId && !preapprovalId && !externalReference) {
  console.error(
    "Indica --operation-id, --order-id, --preapproval-id o --external-reference",
  );
  process.exit(1);
}

if (!process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()) {
  console.error("MERCADOPAGO_ACCESS_TOKEN requerido para consultar MercadoPago.");
  process.exit(1);
}

const {
  resolveSimSubscriptionOrder,
  inspectSimSubscriptionPaymentState,
  applySimSubscriptionApprovedPayment,
  tryReconcileSimSubscriptionFirstPaymentFromPreapproval,
} = await import("../dist/services/simSubscriptionPaymentActivationService.js");
const { getMercadoPagoPayment, getMercadoPagoAuthorizedPayment } = await import(
  "../dist/services/mercadoPagoService.js"
);
const { getMercadoPagoPreapproval } = await import("../dist/services/mercadoPagoService.js");

function normEmail(v) {
  return String(v ?? "").trim().toLowerCase();
}

function assertEmailMatch(label, actual, expected) {
  if (!expected) return;
  const a = normEmail(actual);
  if (!a) {
    console.error(`\n✗ ABORT: ${label} sin email — se requiere --email=${expected}`);
    process.exit(2);
  }
  if (a !== expected) {
    console.error(
      `\n✗ ABORT: ${label} email mismatch`,
      JSON.stringify({ actual: a, expected, hint: "No activar orden de otro comprador." }),
    );
    process.exit(2);
  }
}

console.log("=== Reconcile SIM subscription ===");
console.log(
  JSON.stringify(
    {
      mode: dryRun ? "dry-run" : "apply",
      operationId,
      orderId,
      preapprovalId,
      externalReference,
      expectedEmail: expectedEmail || null,
    },
    null,
    2,
  ),
);

// --- Consulta MP primero (fuente de verdad para external_reference / payer) ---
let mpPaymentId = null;
let mpPaymentStatus = "";
let mpTransactionAmount = 0;
let mpExternalReference = externalReference?.trim() ?? null;
let mpPayerEmail = null;
let mpPreapprovalFromPayment = preapprovalId?.trim() ?? null;

if (operationId) {
  try {
    const payment = await getMercadoPagoPayment(operationId);
    mpPaymentId = String(payment.id);
    mpPaymentStatus = String(payment.status ?? "");
    mpTransactionAmount = Number(payment.transaction_amount ?? 0);
    mpExternalReference = payment.external_reference?.trim() ?? mpExternalReference;
    mpPayerEmail = payment.payer?.email ?? null;
    mpPreapprovalFromPayment =
      payment.preapproval_id?.trim() ??
      mpPreapprovalFromPayment;
    console.log("\n--- MP payment (operation as payment_id) ---");
    console.log(
      JSON.stringify(
        {
          payment_id: mpPaymentId,
          status: mpPaymentStatus,
          transaction_amount: mpTransactionAmount,
          external_reference: mpExternalReference,
          payer_email: mpPayerEmail,
          preapproval_id: mpPreapprovalFromPayment,
        },
        null,
        2,
      ),
    );
  } catch {
    try {
      const ap = await getMercadoPagoAuthorizedPayment(operationId);
      mpPaymentId = ap.payment?.id != null ? String(ap.payment.id) : null;
      mpPaymentStatus = String(ap.payment?.status ?? "");
      mpTransactionAmount = Number(ap.payment?.transaction_amount ?? 0);
      mpPreapprovalFromPayment = ap.preapproval_id?.trim() ?? mpPreapprovalFromPayment;
      if (mpPaymentId) {
        const payment = await getMercadoPagoPayment(mpPaymentId);
        mpExternalReference = payment.external_reference?.trim() ?? mpExternalReference;
        mpPayerEmail = payment.payer?.email ?? null;
        mpPreapprovalFromPayment =
          payment.preapproval_id?.trim() ??
          mpPreapprovalFromPayment;
      }
      console.log("\n--- MP authorized_payment ---");
      console.log(
        JSON.stringify(
          {
            authorized_payment_id: operationId,
            payment_id: mpPaymentId,
            status: mpPaymentStatus,
            transaction_amount: mpTransactionAmount,
            external_reference: mpExternalReference,
            payer_email: mpPayerEmail,
            preapproval_id: mpPreapprovalFromPayment,
          },
          null,
          2,
        ),
      );
    } catch (e) {
      console.warn("No se pudo resolver operation-id como payment ni authorized_payment:", e.message);
    }
  }
}

if (expectedEmail && mpPayerEmail) {
  assertEmailMatch("MP payer", mpPayerEmail, expectedEmail);
} else if (expectedEmail && mpPayerEmail == null) {
  console.warn("\nWARN: MP no expuso payer_email — validación cruzada solo por orden Telvoice.");
}

// Resolver orden: preferir external_reference de MP
const resolveInput = {
  orderId: orderId ?? mpExternalReference,
  preapprovalId: preapprovalId ?? mpPreapprovalFromPayment,
  externalReference: mpExternalReference ?? externalReference,
  operationId,
};

const state = await inspectSimSubscriptionPaymentState(resolveInput);
console.log("\n--- Estado Telvoice + MP ---");
console.log(JSON.stringify(state, null, 2));

const resolved = await resolveSimSubscriptionOrder(resolveInput);

if (!resolved) {
  console.error("\n✗ No se encontró orden/suscripción SIM para los identificadores dados.");
  if (mpPaymentStatus === "approved" && expectedEmail) {
    console.error(
      "MP puede estar aprobado pero sin orden local — NO inventar activación manual. Revisar external_reference.",
    );
  }
  process.exit(1);
}

const { order, subscription } = resolved;

// Guard email obligatorio contra orden incorrecta (ej. licantravel)
assertEmailMatch("Orden Telvoice checkout_email", order.checkout_email, expectedEmail);
if (expectedEmail) {
  const subEmail = normEmail(subscription.checkout_email);
  if (subEmail && subEmail !== expectedEmail) {
    console.error("\n✗ ABORT: sim_subscriptions.checkout_email mismatch", {
      actual: subEmail,
      expected: expectedEmail,
    });
    process.exit(2);
  }
}

const blockedEmails = ["licantravel@gmail.com"];
const orderEmail = normEmail(order.checkout_email);
if (blockedEmails.includes(orderEmail) && expectedEmail && orderEmail !== expectedEmail) {
  console.error("\n✗ ABORT: orden pertenece a Licantravel — no es la compra objetivo.");
  process.exit(2);
}

const preId =
  preapprovalId ??
  mpPreapprovalFromPayment ??
  subscription.mercadopago_preapproval_id ??
  order.payment_reference ??
  null;

let paymentId = mpPaymentId;
let paymentStatus = mpPaymentStatus;
let transactionAmount = mpTransactionAmount;

if (!paymentId && preId) {
  console.log("\n--- Buscando primer cobro autorizado por preapproval ---");
  const { searchMercadoPagoAuthorizedPaymentsByPreapproval } = await import(
    "../dist/services/mercadoPagoService.js"
  );
  try {
    const pre = await getMercadoPagoPreapproval(preId);
    const authorized = await searchMercadoPagoAuthorizedPaymentsByPreapproval(preId);
    const approved = authorized.find((row) => row.payment?.status === "approved");
    console.log(
      JSON.stringify(
        {
          preapproval_id: preId,
          preapproval_status: pre.status,
          external_reference: pre.external_reference,
          payer_email: pre.payer_email,
          transaction_amount: pre.auto_recurring?.transaction_amount,
          authorized_payments: authorized.map((row) => ({
            id: row.id,
            status: row.status,
            payment_id: row.payment?.id ?? null,
            payment_status: row.payment?.status ?? null,
            transaction_amount: row.transaction_amount,
          })),
        },
        null,
        2,
      ),
    );
    if (approved?.payment?.id) {
      paymentId = String(approved.payment.id);
      paymentStatus = String(approved.payment.status ?? "approved");
      transactionAmount = Number(approved.transaction_amount ?? transactionAmount);
      console.log("\n(dry-run) primer cobro aprobado detectado:", paymentId);
    } else if (dryRun) {
      console.log("\n(dry-run) sin cobro aprobado en authorized_payments — no apply");
    }
  } catch (e) {
    console.warn("preapproval/authorized fetch failed:", e.message);
  }
  if (!dryRun && !paymentId) {
    const fromPre = await tryReconcileSimSubscriptionFirstPaymentFromPreapproval(preId);
    if (fromPre) {
      console.log(JSON.stringify(fromPre, null, 2));
      process.exit(fromPre.ok ? 0 : 1);
    }
  }
}

if (!paymentId) {
  console.error("\n✗ MP no expone payment aprobado aún. No activar numeración.");
  process.exit(1);
}

if (paymentStatus !== "approved") {
  console.error(`\n✗ MP payment ${paymentId} status=${paymentStatus} — no activar.`);
  process.exit(1);
}

// Validar external_reference MP vs orden resuelta
if (mpExternalReference && mpExternalReference !== order.id) {
  console.error("\n✗ ABORT: external_reference MP no coincide con orden resuelta", {
    mp_external_reference: mpExternalReference,
    resolved_order_id: order.id,
  });
  process.exit(2);
}

console.log("\n--- Acción planificada ---");
console.log(
  JSON.stringify(
    {
      order_id: order.id,
      company_id: order.company_id,
      checkout_email: order.checkout_email,
      payer_name: order.metadata?.payer_name ?? null,
      preapproval_id: preId,
      payment_id: paymentId,
      mp_status: paymentStatus,
      mp_amount: transactionAmount,
      order_amount: Number(order.amount),
      order_payment_status: order.payment_status,
      subscription_status: subscription.status,
      inventory_number_id: subscription.inventory_number_id,
      plan_id: subscription.plan_id,
      would_apply: !dryRun,
    },
    null,
    2,
  ),
);

const result = await applySimSubscriptionApprovedPayment({
  orderId: order.id,
  paymentId,
  paymentStatus,
  transactionAmount,
  preapprovalId: preId,
  source: dryRun ? "reconcile_dry_run" : "reconcile_apply",
  dryRun,
});

console.log("\n--- Resultado ---");
console.log(JSON.stringify(result, null, 2));

if (dryRun) {
  console.log("\nDry-run OK. Re-ejecutar con --apply --email=<mismo> solo tras confirmar MP + email.");
} else {
  console.log("\nApply ejecutado.");
}

process.exit(result.ok ? 0 : 1);
