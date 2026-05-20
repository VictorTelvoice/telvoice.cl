import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const ORDERS_PREFIX = "orders/";
const LOCAL_ORDERS_DIR = path.join(process.cwd(), "data", "orders");

function useBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function orderBlobPath(orderId) {
  return `${ORDERS_PREFIX}${orderId}.json`;
}

async function saveOrderLocal(order) {
  await mkdir(LOCAL_ORDERS_DIR, { recursive: true });
  const filePath = path.join(LOCAL_ORDERS_DIR, `${order.id}.json`);
  await writeFile(filePath, JSON.stringify(order, null, 2), "utf8");
}

async function getOrderLocal(orderId) {
  try {
    const filePath = path.join(LOCAL_ORDERS_DIR, `${orderId}.json`);
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveOrderBlob(order) {
  const { put } = await import("@vercel/blob");
  await put(orderBlobPath(order.id), JSON.stringify(order), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function getOrderBlob(orderId) {
  try {
    const { get } = await import("@vercel/blob");
    const result = await get(orderBlobPath(orderId), { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const raw = await new Response(result.stream).text();
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveOrder(order) {
  if (useBlob()) {
    await saveOrderBlob(order);
  } else {
    await saveOrderLocal(order);
  }
  return order;
}

export async function getOrder(orderId) {
  if (!orderId) return null;
  if (useBlob()) {
    return getOrderBlob(orderId);
  }
  return getOrderLocal(orderId);
}

export async function updateOrder(orderId, patch) {
  const order = await getOrder(orderId);
  if (!order) return null;
  const updated = {
    ...order,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  await saveOrder(updated);
  return updated;
}

export function createOrderRecord({ id, plan, customer }) {
  const now = new Date().toISOString();
  return {
    id,
    status: "pending_payment",
    plan_id: plan.plan_id,
    plan_name: plan.name,
    sms_quantity: plan.sms_quantity,
    net_amount: plan.net_amount,
    tax_amount: plan.tax_amount,
    total_amount: plan.total_amount,
    currency: plan.currency,
    customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      rut: customer.rut,
      business_name: customer.business_name || null,
    },
    mercadopago: {
      preference_id: null,
      payment_id: null,
      status: null,
      status_detail: null,
      payment_method_id: null,
      transaction_amount: null,
      date_approved: null,
    },
    payment_logs: [],
    created_at: now,
    updated_at: now,
  };
}

export function appendPaymentLog(order, entry) {
  const logs = Array.isArray(order.payment_logs) ? order.payment_logs : [];
  return {
    ...order,
    payment_logs: [...logs, { at: new Date().toISOString(), ...entry }],
  };
}
