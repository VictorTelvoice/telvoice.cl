/**
 * Planes cerrados — única fuente de verdad de precios para Mercado Pago.
 * El frontend solo envía plan_id; nunca confiar en montos del cliente.
 */

export const PLANS = Object.freeze({
  prueba: {
    plan_id: "prueba",
    name: "Bolsa 200 SMS",
    sms_quantity: 200,
    net_amount: 2000,
    tax_amount: 380,
    total_amount: 2380,
    currency: "CLP",
  },
  inicial: {
    plan_id: "inicial",
    name: "Plan Starter",
    sms_quantity: 1000,
    net_amount: 10000,
    tax_amount: 1900,
    total_amount: 11900,
    currency: "CLP",
  },
  empresa: {
    plan_id: "empresa",
    name: "Plan Business",
    sms_quantity: 15000,
    net_amount: 105000,
    tax_amount: 19950,
    total_amount: 124950,
    currency: "CLP",
  },
  volumen: {
    plan_id: "volumen",
    name: "Plan Corporativo",
    sms_quantity: 100000,
    net_amount: 500000,
    tax_amount: 95000,
    total_amount: 595000,
    currency: "CLP",
  },
  /** Placeholder; montos reales vienen de lib/calc-plans.js por volumen. */
  calc: {
    plan_id: "calc",
    name: "Bolsa SMS calculadora",
    sms_quantity: 0,
    net_amount: 0,
    tax_amount: 0,
    total_amount: 0,
    currency: "CLP",
  },
});

export const ALLOWED_PLAN_IDS = Object.freeze(Object.keys(PLANS));

export function getPlan(planId) {
  if (!planId || typeof planId !== "string") return null;
  return PLANS[planId.trim().toLowerCase()] || null;
}

export function planItemTitle(plan) {
  const qty = new Intl.NumberFormat("es-CL").format(plan.sms_quantity);
  return `Telvoice.cl — ${plan.name} (${qty} SMS)`;
}

export function planItemDescription(plan) {
  const qty = new Intl.NumberFormat("es-CL").format(plan.sms_quantity);
  return `Bolsa de ${qty} mensajes SMS para envíos masivos en Chile. IVA incluido en el total.`;
}
