/**
 * Precios de la calculadora — misma lógica que js/telvoice-config.js volumeTiers.
 * El cliente solo envía calc_sms; los montos se calculan en servidor.
 */

import { getPlan } from "./plans.js";

const IVA_RATE = 0.19;
const CALC_MAX_VOLUME = 120000;

const CALC_TIERS = [
  { min: 1000, max: 4000, pxSMS: 10, label: "1.000 a 4.000 SMS" },
  { min: 5000, max: 9000, pxSMS: 9, label: "5.000 a 9.000 SMS" },
  { min: 10000, max: 14000, pxSMS: 8, label: "10.000 a 14.000 SMS" },
  { min: 15000, max: 49000, pxSMS: 7, label: "15.000 a 49.000 SMS" },
  { min: 50000, max: 90000, pxSMS: 6, label: "50.000 a 90.000 SMS" },
  { min: 100000, max: 120000, pxSMS: 5, label: "100.000 a 120.000 SMS" },
];

export function buildAllowedCalcVolumes() {
  const list = [];
  let v;
  for (v = 1000; v <= 90000; v += 1000) list.push(v);
  for (v = 100000; v <= CALC_MAX_VOLUME; v += 1000) list.push(v);
  return list;
}

const ALLOWED_VOLUMES = new Set(buildAllowedCalcVolumes());

export function snapCalcVolume(vol) {
  const n = Math.round(Number(vol));
  if (!Number.isFinite(n)) return null;
  if (n < 1000) return 1000;
  let v = Math.round(n / 1000) * 1000;
  if (v < 1000) return 1000;
  if (v > CALC_MAX_VOLUME) return CALC_MAX_VOLUME;
  if (v > 90000 && v < 100000) return 100000;
  return v;
}

function findCalcTier(vol) {
  return CALC_TIERS.find((t) => vol >= t.min && vol <= t.max) || null;
}

export function getCalcPlan(smsInput) {
  const sms = snapCalcVolume(smsInput);
  if (!sms || !ALLOWED_VOLUMES.has(sms)) return null;

  const tier = findCalcTier(sms);
  if (!tier) return null;

  const net = sms * tier.pxSMS;
  const tax = Math.round(net * IVA_RATE);

  return {
    plan_id: "calc",
    name: `Bolsa ${new Intl.NumberFormat("es-CL").format(sms)} SMS`,
    sms_quantity: sms,
    net_amount: net,
    tax_amount: tax,
    total_amount: net + tax,
    currency: "CLP",
    tier_label: tier.label,
    px_sms: tier.pxSMS,
  };
}

export function resolveCheckoutPlan(body) {
  const rawCalc = body.calc_sms ?? body.calc_volume ?? body.calcSms ?? null;
  if (rawCalc != null && rawCalc !== "") {
    const plan = getCalcPlan(rawCalc);
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
  const plan = getPlan(planId);
  if (!plan) {
    return {
      ok: false,
      error: "Plan no válido. Solo están disponibles los planes publicados.",
    };
  }
  return { ok: true, plan, planId: plan.plan_id };
}
