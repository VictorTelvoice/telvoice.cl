/**
 * Precios de la calculadora — tramos oficiales Telvoice.cl.
 */

import { getPlan } from "./plans.js";
import { getSimPlan } from "./sim-plans.js";
import {
  CALC_MAX_VOLUME,
  IVA_RATE,
  SMS_MIN_QUANTITY,
  SMS_QUANTITY_STEP,
  VOLUME_TIER_RANGES,
  normalizeSmsQuantity,
  getUnitPriceForQuantity,
} from "./telvoice-pricing-tiers.js";

/** Volúmenes del slider del landing (máx. 120.000). No limita checkout del agente. */
export function buildAllowedCalcVolumes() {
  const list = [];
  for (let v = 1000; v <= CALC_MAX_VOLUME; v += 1000) {
    list.push(v);
  }
  return list;
}

export function snapCalcVolume(vol, options = {}) {
  const norm = normalizeSmsQuantity(vol, options);
  return norm.normalized_quantity;
}

export function getCalcPlan(smsInput, options = {}) {
  const norm = normalizeSmsQuantity(smsInput, options);
  const sms = norm.normalized_quantity;
  if (sms < SMS_MIN_QUANTITY || sms % SMS_QUANTITY_STEP !== 0) {
    return null;
  }

  const pricing = getUnitPriceForQuantity(sms);
  const net = sms * pricing.unit_price;
  const tax = Math.round(net * IVA_RATE);

  return {
    plan_id: "calc",
    name: `Bolsa ${new Intl.NumberFormat("es-CL").format(sms)} SMS`,
    sms_quantity: sms,
    net_amount: net,
    tax_amount: tax,
    total_amount: net + tax,
    currency: "CLP",
    tier_label: pricing.tier_label,
    px_sms: pricing.unit_price,
  };
}

export function resolveCheckoutPlan(body) {
  const rawCalc = body.calc_sms ?? body.calc_volume ?? body.calcSms ?? null;
  if (rawCalc != null && rawCalc !== "") {
    const plan = getCalcPlan(rawCalc, { applyCalcMaxCap: false });
    if (!plan) {
      return {
        ok: false,
        error: "Cantidad de SMS no válida para compra online desde la calculadora.",
      };
    }
    return { ok: true, plan, planId: "calc" };
  }

  const planId = String(body.plan_id || body.planId || "")
    .trim()
    .toLowerCase();

  const simPlan = getSimPlan(planId);
  if (simPlan) {
    return { ok: true, plan: simPlan, planId: simPlan.plan_id };
  }

  const plan = getPlan(planId);
  if (!plan) {
    return {
      ok: false,
      error: "Plan no válido. Solo están disponibles los planes publicados.",
    };
  }
  return { ok: true, plan, planId: plan.plan_id };
}

export { VOLUME_TIER_RANGES };
