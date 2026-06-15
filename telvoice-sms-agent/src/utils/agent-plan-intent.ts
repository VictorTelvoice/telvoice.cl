import type { AgentPlanCode } from "../types/client-numbers.js";

export const AGENT_PLAN_CODES: AgentPlanCode[] = ["start", "pro", "business"];

const PLAN_NAMES: Record<AgentPlanCode, string> = {
  start: "Numeración Start",
  pro: "Numeración Pro",
  business: "Numeración Business",
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
  return intent === "agent_plan" && !!parseAgentPlanCode(query.plan);
}

export function agentPlanDisplayName(code: AgentPlanCode): string {
  return PLAN_NAMES[code] ?? code;
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
  plan: AgentPlanCode,
  extra?: Record<string, string>,
): string {
  const params = new URLSearchParams({ plan, intent: "agent_plan" });
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
