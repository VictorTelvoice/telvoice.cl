import { supabase } from "./supabase.js";

function mapStatusToSupabase(orderStatus, mpStatus) {
  if (mpStatus === 'approved') return 'paid';
  if (mpStatus === 'rejected') return 'rejected';
  if (mpStatus === 'cancelled') return 'cancelled';
  if (mpStatus === 'refunded') return 'refunded';
  if (orderStatus === 'paid') return 'paid';
  if (orderStatus === 'failed') return 'rejected';
  return 'pending';
}

export async function saveOrder(order) {
  const payload = {
    id: order.id,
    checkout_email: order.customer?.email || null,
    sms_quantity: order.sms_quantity,
    amount: order.total_amount,
    currency: order.currency || 'CLP',
    payment_provider: 'mercadopago',
    payment_reference: order.mercadopago?.payment_id ? String(order.mercadopago.payment_id) : null,
    payment_status: mapStatusToSupabase(order.status, order.mercadopago?.status),
    credit_status: order.status === 'paid' ? 'pending_claim' : 'pending',
    metadata: order
  };

  const { error } = await supabase
    .from('sms_orders')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    console.error("Supabase upsert order error:", error);
    throw new Error(`Failed to save order to database: ${error.message}`);
  }
  return order;
}

export async function getOrder(orderId) {
  if (!orderId) return null;
  
  const { data, error } = await supabase
    .from('sms_orders')
    .select('metadata')
    .eq('id', orderId)
    .single();

  if (error || !data) {
    return null;
  }
  
  return data.metadata;
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
    product_type: plan.product_type || "sms_bag",
    billing_period: plan.billing_period || "one_time",
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
