/**
 * Planes de numeración SIM real (Starter / Pro / Power) — precios mensuales con IVA incluido.
 * Única fuente de verdad para checkout Mercado Pago (el frontend solo envía plan_id).
 */

import { planItemDescription, planItemTitle } from "./plans.js";

const IVA = 0.19;

/** Total con IVA incluido → neto + IVA (pesos enteros CLP). */
function clpFromGrossTotal(totalGross) {
  const net = Math.round(totalGross / (1 + IVA));
  const tax = totalGross - net;
  return { net_amount: net, tax_amount: tax, total_amount: totalGross };
}

export const SIM_PLANS = Object.freeze({
  sim_starter: {
    plan_id: "sim_starter",
    name: "Número Real Starter",
    sim_label: "Starter",
    product_type: "sim_subscription",
    billing_period: "monthly",
    sms_quantity: 1000,
    currency: "CLP",
    ...clpFromGrossTotal(19990),
  },
  sim_pro: {
    plan_id: "sim_pro",
    name: "Número Real Pro",
    sim_label: "Pro",
    product_type: "sim_subscription",
    billing_period: "monthly",
    sms_quantity: 2000,
    currency: "CLP",
    ...clpFromGrossTotal(39990),
  },
  sim_power: {
    plan_id: "sim_power",
    name: "Número Real Power",
    sim_label: "Power",
    product_type: "sim_subscription",
    billing_period: "monthly",
    sms_quantity: 4000,
    currency: "CLP",
    ...clpFromGrossTotal(99990),
  },
});

export const SIM_PLAN_IDS = Object.freeze(Object.keys(SIM_PLANS));

/** Etiqueta landing → plan_id */
export const SIM_LABEL_TO_PLAN_ID = Object.freeze({
  starter: "sim_starter",
  pro: "sim_pro",
  power: "sim_power",
});

export function isSimPlanId(planId) {
  if (!planId || typeof planId !== "string") return false;
  return Boolean(SIM_PLANS[planId.trim().toLowerCase()]);
}

export function getSimPlan(planId) {
  if (!planId || typeof planId !== "string") return null;
  return SIM_PLANS[planId.trim().toLowerCase()] || null;
}

export function simPlanFromLabel(label) {
  if (!label || typeof label !== "string") return null;
  const key = label.trim().toLowerCase();
  const planId = SIM_LABEL_TO_PLAN_ID[key];
  return planId ? getSimPlan(planId) : null;
}

export function checkoutPlanItemTitle(plan) {
  if (plan?.product_type === "sim_subscription") {
    const qty = new Intl.NumberFormat("es-CL").format(plan.sms_quantity);
    return `Telvoice.cl — ${plan.name} (${qty} SMS/mes)`;
  }
  return planItemTitle(plan);
}

export function checkoutPlanItemDescription(plan) {
  if (plan?.product_type === "sim_subscription") {
    const qty = new Intl.NumberFormat("es-CL").format(plan.sms_quantity);
    return (
      `Suscripción mensual: número SIM real en Chile con ${qty} SMS salientes incluidos por mes. ` +
      "IVA incluido en el total. Activación manual tras confirmar el pago."
    );
  }
  return planItemDescription(plan);
}

export function resolveAnyCheckoutPlan(planId) {
  const id = String(planId || "")
    .trim()
    .toLowerCase();
  return getSimPlan(id) || null;
}
