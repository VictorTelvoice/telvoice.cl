import type { AgentChannel } from "./types.js";
import type { UnansweredQuestionRow } from "./agentUnansweredService.js";

const STOP = new Set([
  "si",
  "que",
  "como",
  "cual",
  "cuanto",
  "cuanta",
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "y",
  "o",
  "de",
  "del",
  "por",
  "para",
  "con",
  "es",
  "mi",
  "en",
  "al",
  "a",
  "su",
  "no",
  "se",
  "lo",
  "me",
  "te",
]);

export function suggestKeywordsFromQuestion(
  normalized: string | null,
  question: string,
): string[] {
  const base = (normalized ?? question)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
  return [...new Set(base)].slice(0, 12);
}

export function suggestCategoryFromIntent(intent: string | null): string {
  const map: Record<string, string> = {
    commercial: "comercial",
    quote_purchase: "comercial",
    balance: "saldo",
    wallet: "saldo",
    invoices: "saldo",
    dlr_help: "dlr",
    reports: "dlr",
    segments: "sms",
    copy_help: "estrategia",
    strategy: "estrategia",
    campaign_draft: "panel_cliente",
    campaign_cost: "panel_cliente",
    recent_campaigns: "panel_cliente",
    contact_list: "panel_cliente",
    knowledge: "soporte",
    capabilities: "soporte",
    register: "comercial",
    lead_capture: "comercial",
  };
  if (!intent) {
    return "soporte";
  }
  return map[intent] ?? "soporte";
}

export function suggestAudienceForChannel(channel: string): string {
  switch (channel as AgentChannel) {
    case "landing":
      return "public";
    case "telegram":
      return "mixed";
    case "web_client":
      return "customer";
    case "admin":
      return "internal";
    default:
      return "general";
  }
}

export function suggestAllowedChannels(channel: string): string[] {
  switch (channel as AgentChannel) {
    case "landing":
      return ["landing", "telegram"];
    case "telegram":
      return ["telegram", "landing", "web_client"];
    case "web_client":
      return ["web_client", "telegram"];
    case "admin":
      return ["admin", "web_client"];
    default:
      return ["telegram", "landing", "web_client", "admin"];
  }
}

export function suggestTitleFromQuestion(question: string): string {
  const t = question.trim().replace(/\s+/g, " ");
  if (t.length <= 80) {
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  return `${t.slice(0, 77).trim()}…`;
}

export function buildArticlePrefill(row: UnansweredQuestionRow): {
  title: string;
  category: string;
  keywords: string[];
  content: string;
  allowed_channels: string[];
  audience: string;
  priority: number;
} {
  return {
    title: suggestTitleFromQuestion(row.question),
    category:
      row.suggested_category?.trim() ||
      suggestCategoryFromIntent(row.detected_intent),
    keywords: suggestKeywordsFromQuestion(
      row.normalized_question,
      row.question,
    ),
    content: "",
    allowed_channels: suggestAllowedChannels(row.channel),
    audience: suggestAudienceForChannel(row.channel),
    priority: row.channel === "web_client" ? 10 : 5,
  };
}
