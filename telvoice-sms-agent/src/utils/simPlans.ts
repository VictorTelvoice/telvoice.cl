/**
 * Planes de numeración real Telvoice — fuente de verdad en el agente (mirror de lib/sim-plans.js).
 */

import type { AgentAddonId } from "./agentAddons.js";

const IVA = 0.19;

function clpFromGrossTotal(totalGross: number) {
  const net = Math.round(totalGross / (1 + IVA));
  const tax = totalGross - net;
  return { net_amount: net, tax_amount: tax, total_amount: totalGross };
}

export type SimPlanDefinition = {
  plan_id: SimPlanId;
  name: string;
  sim_label: string;
  product_type: "sim_subscription";
  billing_period: "monthly";
  sms_quantity: number;
  includes_outbound_sms?: boolean;
  currency: "CLP";
  net_amount: number;
  tax_amount: number;
  total_amount: number;
};

export type SimOutboundSmsSettings = {
  includes_outbound_sms?: boolean;
  included_sms?: number;
};

export const SIM_NO_OUTBOUND_SMS_FEATURE = "Sin SMS salientes incluidos";

/** Si el plan incluye bolsa mensual de SMS salientes según BD/admin. */
export function planIncludesOutboundSms(settings: SimOutboundSmsSettings): boolean {
  if (settings.includes_outbound_sms === false) return false;
  return Math.max(0, Math.round(Number(settings.included_sms) || 0)) > 0;
}

/** SMS incluidos efectivos — nunca usa fallback hardcodeado del catálogo. */
export function effectiveSimIncludedSms(settings: SimOutboundSmsSettings): number {
  if (!planIncludesOutboundSms(settings)) return 0;
  return Math.max(0, Math.round(Number(settings.included_sms) || 0));
}

export function isOutboundSmsFeatureLine(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return (
    lower.includes("sms saliente") ||
    lower.includes("sms/mes") ||
    /\d[\d.]*\s*sms\s*(salientes|incluidos|mensual)/i.test(text)
  );
}

export function formatOutboundSmsFeatureLine(includedSms: number): string {
  const fmt = new Intl.NumberFormat("es-CL").format(Math.max(0, includedSms));
  return `${fmt} SMS salientes incluidos cada mes`;
}

/** Filtra líneas de SMS salientes y agrega copy cuando el plan no los incluye. */
export function normalizeSimPlanFeatures(
  features: string[],
  includesOutbound: boolean,
  includedSms: number,
): string[] {
  const filtered = features.filter((line) => !isOutboundSmsFeatureLine(line));
  if (!includesOutbound || includedSms <= 0) {
    if (!filtered.some((line) => line.toLowerCase().includes("sin sms saliente"))) {
      return [...filtered, SIM_NO_OUTBOUND_SMS_FEATURE];
    }
    return filtered;
  }
  const smsLine = formatOutboundSmsFeatureLine(includedSms);
  if (filtered.some(isOutboundSmsFeatureLine)) {
    return filtered;
  }
  const result = [...filtered];
  const insertAt = result.length > 0 ? 1 : 0;
  result.splice(insertAt, 0, smsLine);
  return result;
}

export type SimPlanId = "sim_starter" | "sim_pro" | "sim_power";

/** Plan SIM público → agente interno incluido en el bundle (sin cargo adicional). */
export const SIM_PLAN_AGENT_MAP: Record<
  SimPlanId,
  Exclude<AgentAddonId, "none">
> = {
  sim_starter: "agent_start",
  sim_pro: "agent_pro",
  sim_power: "agent_business",
};

export function getBundledAgentAddonForSimPlan(
  planId: SimPlanId,
): Exclude<AgentAddonId, "none"> {
  return SIM_PLAN_AGENT_MAP[planId];
}

export const SIM_PLANS: Record<SimPlanId, SimPlanDefinition> = {
  sim_starter: {
    plan_id: "sim_starter",
    name: "Número Real Starter",
    sim_label: "Starter",
    product_type: "sim_subscription",
    billing_period: "monthly",
    sms_quantity: 1000,
    currency: "CLP",
    ...clpFromGrossTotal(29990),
  },
  sim_pro: {
    plan_id: "sim_pro",
    name: "Número Real Pro",
    sim_label: "Pro",
    product_type: "sim_subscription",
    billing_period: "monthly",
    sms_quantity: 2000,
    currency: "CLP",
    ...clpFromGrossTotal(49990),
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
};

export const SIM_PLAN_IDS = Object.keys(SIM_PLANS) as SimPlanId[];

/** Planes públicos visibles en landing y panel cliente (sin Power legacy en UI pública). */
export const PUBLIC_SIM_SUBSCRIPTION_PLAN_IDS = [
  "sim_starter",
  "sim_pro",
] as const satisfies readonly SimPlanId[];

export type PublicSimSubscriptionPlanId =
  (typeof PUBLIC_SIM_SUBSCRIPTION_PLAN_IDS)[number];

export type SimSubscriptionPlanCatalogEntry = SimPlanDefinition & {
  description: string;
  features: string[];
  ctaLabel: string;
  featured?: boolean;
};

/** Catálogo comercial alineado con numeracion-sim.html (nombres, precios, SMS, beneficios, CTA). */
export const SIM_SUBSCRIPTION_PLAN_CATALOG: Record<
  PublicSimSubscriptionPlanId,
  SimSubscriptionPlanCatalogEntry
> = {
  sim_starter: {
    ...SIM_PLANS.sim_starter,
    description: "Activa tu primer número SIM real con recepción SMS.",
    features: [
      "1 número SIM real",
      "1.000 SMS salientes incluidos cada mes",
      "Recepción SMS",
      "Panel web Telvoice",
      "Agente Telvoice incluido",
      "Activación asistida",
    ],
    ctaLabel: "Suscribirme Starter",
  },
  sim_pro: {
    ...SIM_PLANS.sim_pro,
    description:
      "Mayor capacidad operativa, notificaciones por Telegram, webhooks e integraciones.",
    features: [
      "Todo lo que incluye Starter",
      "2.000 SMS salientes incluidos cada mes",
      "Bot de Telegram para alertas y operación",
      "Automatizaciones iniciales",
      "Webhooks/API para integración",
    ],
    ctaLabel: "Suscribirme Pro",
    featured: true,
  },
};

export function getPublicSimSubscriptionCatalog(): SimSubscriptionPlanCatalogEntry[] {
  return PUBLIC_SIM_SUBSCRIPTION_PLAN_IDS.map(
    (id) => SIM_SUBSCRIPTION_PLAN_CATALOG[id],
  );
}

export function buildPublicSimNumeracionUrl(
  planId: PublicSimSubscriptionPlanId,
  publicSiteUrl: string,
): string {
  const base = publicSiteUrl.replace(/\/$/, "");
  return `${base}/numeracion-sim.html?plan=${encodeURIComponent(planId)}`;
}

export function isSimPlanId(planId: string | null | undefined): planId is SimPlanId {
  if (!planId || typeof planId !== "string") return false;
  return SIM_PLAN_IDS.includes(planId.trim().toLowerCase() as SimPlanId);
}

export function getSimPlan(planId: string): SimPlanDefinition | null {
  if (!isSimPlanId(planId)) return null;
  return SIM_PLANS[planId.trim().toLowerCase() as SimPlanId];
}

/** Etiqueta SMS para reason/título MP — sin separador de miles (evita "1.000" → "1.00" en emails MP). */
export function simMpSmsQuantityLabel(quantity: number): string {
  return `${Math.round(quantity)} SMS/mes`;
}

export function simCheckoutItemTitle(plan: Pick<SimPlanDefinition, "name" | "sms_quantity" | "includes_outbound_sms">): string {
  const includes =
    plan.includes_outbound_sms !== false && Math.round(Number(plan.sms_quantity) || 0) > 0;
  if (!includes) {
    return `Telvoice.cl — ${plan.name} (recepción SMS)`;
  }
  return `Telvoice.cl — ${plan.name} (${simMpSmsQuantityLabel(plan.sms_quantity)})`;
}

export function simCheckoutItemDescription(
  plan: Pick<SimPlanDefinition, "name" | "sms_quantity" | "includes_outbound_sms">,
): string {
  const includes =
    plan.includes_outbound_sms !== false && Math.round(Number(plan.sms_quantity) || 0) > 0;
  const base =
    `Suscripción mensual: ${plan.name} — numeración SIM real con recepción SMS. ` +
    `Agente Telvoice incluido sin costo adicional. IVA incluido. Activación tras confirmar el pago.`;
  if (!includes) {
    return `${base} Esta suscripción no incluye SMS salientes mensuales.`;
  }
  const qty = new Intl.NumberFormat("es-CL").format(plan.sms_quantity);
  return (
    `Suscripción mensual: ${plan.name} con ${qty} SMS salientes incluidos por mes. ` +
    `Agente Telvoice incluido sin costo adicional. IVA incluido. Activación tras confirmar el pago.`
  );
}
