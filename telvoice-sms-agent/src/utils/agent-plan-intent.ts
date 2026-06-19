import type { AgentPlanCode } from "../types/client-numbers.js";
import {
  getSimPlan,
  type PublicSimSubscriptionPlanId,
  type SimPlanId,
} from "./simPlans.js";

export const AGENT_PLAN_CODES: AgentPlanCode[] = ["start", "pro", "business"];

const LEGACY_PLAN_NAMES: Record<AgentPlanCode, string> = {
  start: "Starter",
  pro: "Pro",
  business: "Power",
};

const LEGACY_TO_SIM_PLAN: Record<AgentPlanCode, SimPlanId> = {
  start: "sim_starter",
  pro: "sim_pro",
  business: "sim_power",
};

export function parseAgentPlanCode(raw: unknown): AgentPlanCode | undefined {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  return AGENT_PLAN_CODES.includes(value as AgentPlanCode)
    ? (value as AgentPlanCode)
    : undefined;
}

export function isAgentPlanIntentQuery(
  query: Record<string, string | string[] | undefined>,
): boolean {
  const intent =
    typeof query.intent === "string" ? query.intent.trim() : undefined;
  if (intent !== "agent_plan") return false;
  return (
    !!parseAgentPlanCode(query.plan) || !!parseSimSubscriptionPlanId(query.plan)
  );
}

export function resolveAgentPlanDashboardSelection(
  raw: unknown,
): PublicSimSubscriptionPlanId | undefined {
  const simPlan = parseSimSubscriptionPlanId(raw);
  if (simPlan) return simPlan;
  const legacy = parseAgentPlanCode(raw);
  if (!legacy) return undefined;
  if (legacy === "business") return "sim_pro";
  return legacy === "start" ? "sim_starter" : "sim_pro";
}

export function parseSimSubscriptionPlanId(
  raw: unknown,
): PublicSimSubscriptionPlanId | undefined {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "sim_starter" || value === "sim_pro") {
    return value;
  }
  return undefined;
}

export function parseSimPlanSelection(
  raw: unknown,
): PublicSimSubscriptionPlanId | undefined {
  return parseSimSubscriptionPlanId(raw) ?? undefined;
}

export function isSimSubscriptionIntentQuery(
  query: Record<string, string | string[] | undefined>,
): boolean {
  return !!parseSimSubscriptionPlanId(query.plan);
}

export function agentPlanDisplayName(code: AgentPlanCode): string {
  const simPlan = getSimPlan(LEGACY_TO_SIM_PLAN[code]);
  if (simPlan) return simPlan.sim_label;
  return LEGACY_PLAN_NAMES[code] ?? code;
}

export function simPlanDisplayLabel(planId: SimPlanId): string {
  return getSimPlan(planId)?.sim_label ?? planId;
}

export function buildAgentPlanLoginUrl(
  plan: AgentPlanCode,
  baseUrl = "https://agent.telvoice.cl",
): string {
  const params = new URLSearchParams({
    intent: "agent_plan",
    plan,
  });
  return `${baseUrl.replace(/\/$/, "")}/login?${params.toString()}`;
}

export function buildAgentPlanDashboardPath(
  plan: AgentPlanCode | PublicSimSubscriptionPlanId,
  extra?: Record<string, string>,
): string {
  const resolved =
    parseSimSubscriptionPlanId(plan) ?? resolveAgentPlanDashboardSelection(plan);
  const params = new URLSearchParams({
    plan: resolved ?? String(plan),
  });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  return `/app/planes-agente?${params.toString()}`;
}

export function parseSafeAppNextPath(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const path = raw.trim();
  if (!path.startsWith("/app/")) return undefined;
  if (path.includes("://") || path.startsWith("//")) return undefined;
  return path;
}
