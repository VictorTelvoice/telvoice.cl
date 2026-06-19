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
  currency: "CLP";
  net_amount: number;
  tax_amount: number;
  total_amount: number;
};

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
      "Para empresas que necesitan mayor capacidad operativa, notificaciones por Telegram, webhooks e integraciones.",
    features: [
      "Todo lo que incluye Starter",
      "Bot de Telegram para alertas y operación",
      "Automatizaciones iniciales",
      "Webhooks/API para integración",
      "Mayor capacidad operativa",
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

export function simCheckoutItemTitle(plan: SimPlanDefinition): string {
  const qty = new Intl.NumberFormat("es-CL").format(plan.sms_quantity);
  return `Telvoice.cl — ${plan.name} (${qty} SMS/mes)`;
}

export function simCheckoutItemDescription(plan: SimPlanDefinition): string {
  const qty = new Intl.NumberFormat("es-CL").format(plan.sms_quantity);
  return (
    `Suscripción mensual: ${plan.name} con ${qty} SMS salientes incluidos por mes. ` +
    `Agente Telvoice incluido sin costo adicional. IVA incluido. Activación tras confirmar el pago.`
  );
}
