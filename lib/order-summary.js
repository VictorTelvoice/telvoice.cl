import { formatClp, maskRut } from "./format-clp.js";

/** Resumen seguro para la página de retorno y APIs públicas. */
export function toPublicOrderSummary(order) {
  if (!order) return null;

  const mp = order.mercadopago || {};
  const customer = order.customer || {};

  return {
    order_id: order.id,
    status: order.status,
    plan_id: order.plan_id,
    plan_name: order.plan_name,
    sms_quantity: order.sms_quantity,
    net_amount: order.net_amount,
    tax_amount: order.tax_amount,
    total_amount: order.total_amount,
    currency: order.currency || "CLP",
    customer: {
      name: customer.name || null,
      email: customer.email || null,
      business_name: customer.business_name || null,
    },
    mercadopago: {
      payment_id: mp.payment_id || null,
      status: mp.status || null,
      date_approved: mp.date_approved || null,
    },
    formatted: {
      net: formatClp(order.net_amount),
      tax: formatClp(order.tax_amount),
      total: formatClp(order.total_amount),
      sms: order.sms_quantity
        ? new Intl.NumberFormat("es-CL").format(order.sms_quantity)
        : null,
    },
    rut_masked: maskRut(customer.rut),
    created_at: order.created_at || null,
  };
}
