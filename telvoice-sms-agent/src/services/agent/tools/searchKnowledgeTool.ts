import {
  filterKnowledgeSearchResults,
  KNOWLEDGE_MIN_SCORE,
  searchKnowledgeRaw,
} from "../../knowledgeService.js";
import { KNOWLEDGE_NOT_FOUND_MSG } from "../../telegramKnowledge.js";
import type { AgentChannel } from "../types.js";
import type { AgentToolContext, AgentToolResult } from "./types.js";

const CHANNEL_CATEGORY_HINTS: Record<AgentChannel, string[]> = {
  landing: ["comercial", "estrategia", "panel_cliente"],
  web_client: ["panel_cliente", "dlr", "estrategia", "soporte", "sms", "saldo"],
  telegram: ["dlr", "sms", "saldo", "telegram", "comercial", "soporte"],
  admin: ["errores", "seguridad", "smpp", "api", "telvoice"],
};

function articleBlockedOnChannel(
  article: { title?: string | null; allowed_channels?: string[] | null },
  channel: AgentChannel,
): boolean {
  const title = String(article.title ?? "").toLowerCase();
  if (channel === "web_client" && title.includes("telegram")) {
    return true;
  }
  return false;
}

function articleAllowsChannel(
  article: { allowed_channels?: string[] | null; category: string; title?: string | null },
  channel: AgentChannel,
): boolean {
  if (articleBlockedOnChannel(article, channel)) {
    return false;
  }
  const allowed = article.allowed_channels;
  if (allowed?.length) {
    return allowed.includes(channel);
  }
  const hints = CHANNEL_CATEGORY_HINTS[channel];
  return hints.includes(article.category) || article.category === "comercial";
}

export async function searchKnowledgeForChannel(
  query: string,
  channel: AgentChannel,
): Promise<{ reply: string; confidence: number; matched: boolean }> {
  const raw = await searchKnowledgeRaw(query, 12);
  const filtered = filterKnowledgeSearchResults(
    raw.filter((r) => articleAllowsChannel(r.article as { allowed_channels?: string[]; category: string }, channel)),
  );

  if (filtered.length > 0 && filtered[0]!.score >= KNOWLEDGE_MIN_SCORE) {
    const best = filtered[0]!.article;
    const conf = Math.min(0.95, 0.5 + filtered[0]!.score / 80);
    let reply = `${best.title}\n\n${best.content}`;
    if (filtered.length > 1) {
      reply += `\n\n—\nRelacionado:\n${filtered
        .slice(1, 3)
        .map((r) => `• ${r.article.title}`)
        .join("\n")}`;
    }
    return { reply, confidence: conf, matched: true };
  }

  return {
    reply: KNOWLEDGE_NOT_FOUND_MSG,
    confidence: 0.25,
    matched: false,
  };
}

export const searchKnowledgeTool = {
  name: "search_knowledge",
  description: "Busca en knowledge_articles filtrado por canal.",
  requiresCompany: false,
  async run(
    ctx: AgentToolContext,
    input: { query: string },
  ): Promise<AgentToolResult> {
    const result = await searchKnowledgeForChannel(
      String(input.query ?? ""),
      ctx.channel,
    );
    return {
      ok: result.matched,
      summary: result.reply,
      data: { confidence: result.confidence },
    };
  },
};
