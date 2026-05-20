/**
 * Planes cerrados — única fuente de verdad de precios para Mercado Pago.
 * El frontend solo envía plan_id; nunca confiar en montos del cliente.
 */

export const PLANS = Object.freeze({
  inicial: {
    plan_id: "inicial",
    name: "Plan Inicial",
    sms_quantity: 1000,
    net_amount: 10000,
    tax_amount: 1900,
    total_amount: 11900,
    currency: "CLP",
  },
  empresa: {
    plan_id: "empresa",
    name: "Plan Empresa",
    sms_quantity: 15000,
    net_amount: 105000,
    tax_amount: 19950,
    total_amount: 124950,
    currency: "CLP",
  },
  volumen: {
    plan_id: "volumen",
    name: "Plan Volumen",
    sms_quantity: 100000,
    net_amount: 500000,
    tax_amount: 95000,
    total_amount: 595000,
    currency: "CLP",
  },
});

export const ALLOWED_PLAN_IDS = Object.freeze(Object.keys(PLANS));

export function getPlan(planId) {
  if (!planId || typeof planId !== "string") return null;
  return PLANS[planId.trim().toLowerCase()] || null;
}

export function planItemTitle(plan) {
  return `Bolsa SMS ${plan.name} - ${new Intl.NumberFormat("es-CL").format(plan.sms_quantity)} SMS`;
}
