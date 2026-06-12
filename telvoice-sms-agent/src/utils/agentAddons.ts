import type { AgentPlanCode } from "../types/client-numbers.js";

export type AgentAddonId =
  | "none"
  | "agent_start"
  | "agent_pro"
  | "agent_business";

export type AgentAddonDefinition = {
  id: AgentAddonId;
  name: string;
  priceClp: number;
  description: string;
  planCode: AgentPlanCode | null;
};

export const AGENT_ADDONS: Record<Exclude<AgentAddonId, "none">, AgentAddonDefinition> = {
  agent_start: {
    id: "agent_start",
    name: "Agente Start",
    priceClp: 39990,
    description:
      "Recepción SMS, consultas básicas, asistencia operativa y gestión inicial.",
    planCode: "start",
  },
  agent_pro: {
    id: "agent_pro",
    name: "Agente Pro",
    priceClp: 59900,
    description:
      "Campañas asistidas, Telegram, notificaciones y operación comercial.",
    planCode: "pro",
  },
  agent_business: {
    id: "agent_business",
    name: "Agente Business",
    priceClp: 99990,
    description:
      "API, webhooks, reglas operativas, soporte prioritario y automatización avanzada.",
    planCode: "business",
  },
};

export const AGENT_ADDON_IDS = [
  "none",
  "agent_start",
  "agent_pro",
  "agent_business",
] as const;

export function isAgentAddonId(
  value: string | null | undefined,
): value is AgentAddonId {
  if (!value || typeof value !== "string") return false;
  return AGENT_ADDON_IDS.includes(value.trim().toLowerCase() as AgentAddonId);
}

export function getAgentAddon(
  addonId: string,
): AgentAddonDefinition | null {
  const key = addonId.trim().toLowerCase();
  if (key === "none") return null;
  if (key in AGENT_ADDONS) {
    return AGENT_ADDONS[key as Exclude<AgentAddonId, "none">];
  }
  return null;
}

export function agentAddonCheckoutItemTitle(addon: AgentAddonDefinition): string {
  return `Agente Telvoice ${addon.name.replace(/^Agente\s+/i, "")}`;
}

export function agentAddonCheckoutItemDescription(addon: AgentAddonDefinition): string {
  return `${addon.description} Suscripción mensual. IVA incluido en el total.`;
}

export function calculateSimAgentBundleTotal(
  simTotalAmount: number,
  agentAddonId: AgentAddonId,
): number {
  const addon = getAgentAddon(agentAddonId);
  return Math.round(simTotalAmount + (addon?.priceClp ?? 0));
}
