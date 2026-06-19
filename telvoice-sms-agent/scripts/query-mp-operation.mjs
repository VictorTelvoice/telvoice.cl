#!/usr/bin/env node
/**
 * Consulta MercadoPago — payment / authorized_payment / preapproval
 *
 * Uso:
 *   node scripts/query-mp-operation.mjs <operation_id>
 *   node scripts/query-mp-operation.mjs <operation_id> [preapproval_id]
 */
import "dotenv/config";

const MP = "https://api.mercadopago.com";
const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
if (!token) {
  console.error("MERCADOPAGO_ACCESS_TOKEN required");
  process.exit(1);
}

const operationId = process.argv[2];
const preapprovalHint = process.argv[3] ?? null;

if (!operationId) {
  console.error("Uso: node scripts/query-mp-operation.mjs <operation_id> [preapproval_id]");
  process.exit(1);
}

async function mpGet(path) {
  const res = await fetch(`${MP}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

function summarizePayment(p) {
  if (!p || typeof p !== "object") return null;
  return {
    id: p.id,
    status: p.status,
    status_detail: p.status_detail,
    transaction_amount: p.transaction_amount,
    currency_id: p.currency_id,
    external_reference: p.external_reference,
    payer_email: p.payer?.email ?? null,
    payment_method_id: p.payment_method_id,
    preapproval_id: p.preapproval_id ?? p.metadata?.preapproval_id ?? null,
    date_created: p.date_created,
    date_approved: p.date_approved,
    description: p.description,
    metadata: p.metadata,
  };
}

function summarizePreapproval(p) {
  if (!p || typeof p !== "object") return null;
  return {
    id: p.id,
    status: p.status,
    external_reference: p.external_reference,
    payer_email: p.payer_email ?? p.payer?.email ?? null,
    reason: p.reason,
    auto_recurring: p.auto_recurring,
    date_created: p.date_created,
    last_modified: p.last_modified,
    back_url: p.back_url,
    metadata: p.metadata,
  };
}

const out = {
  operation_id: operationId,
  resolved_as: null,
  payment: null,
  authorized_payment: null,
  preapproval: null,
  authorized_payments_search: null,
};

// 1) Try as payment id
const payRes = await mpGet(`/v1/payments/${operationId}`);
if (payRes.ok) {
  out.resolved_as = "payment";
  out.payment = summarizePayment(payRes.data);
  const preId =
    out.payment?.preapproval_id ??
    preapprovalHint ??
    null;
  if (preId) {
    const preRes = await mpGet(`/preapproval/${preId}`);
    if (preRes.ok) {
      out.preapproval = summarizePreapproval(preRes.data);
    }
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

// 2) Try as authorized_payment id
const apRes = await mpGet(`/authorized_payments/${operationId}`);
if (apRes.ok) {
  out.resolved_as = "authorized_payment";
  out.authorized_payment = {
    id: apRes.data.id,
    status: apRes.data.status,
    preapproval_id: apRes.data.preapproval_id,
    payment: summarizePayment(apRes.data.payment),
  };
  const preId = apRes.data.preapproval_id ?? preapprovalHint;
  if (preId) {
    const preRes = await mpGet(`/preapproval/${preId}`);
    if (preRes.ok) {
      out.preapproval = summarizePreapproval(preRes.data);
    }
    const search = await mpGet(
      `/authorized_payments/search?preapproval_id=${encodeURIComponent(preId)}`,
    );
    if (search.ok) {
      out.authorized_payments_search = (search.data.results ?? []).map((r) => ({
        id: r.id,
        status: r.status,
        payment: summarizePayment(r.payment),
      }));
    }
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

// 3) Try as preapproval id
const preRes = await mpGet(`/preapproval/${operationId}`);
if (preRes.ok) {
  out.resolved_as = "preapproval";
  out.preapproval = summarizePreapproval(preRes.data);
  const search = await mpGet(
    `/authorized_payments/search?preapproval_id=${encodeURIComponent(operationId)}`,
  );
  if (search.ok) {
    out.authorized_payments_search = (search.data.results ?? []).map((r) => ({
      id: r.id,
      status: r.status,
      payment: summarizePayment(r.payment),
    }));
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

console.error(JSON.stringify({ error: "operation_not_found_in_mp", payment_status: payRes.status, ap_status: apRes.status, pre_status: preRes.status }, null, 2));
process.exit(1);
