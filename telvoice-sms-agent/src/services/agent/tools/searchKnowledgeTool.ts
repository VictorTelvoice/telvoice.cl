import {
  filterKnowledgeSearchResults,
  KNOWLEDGE_MIN_SCORE,
  searchKnowledgeRaw,
} from "../../knowledgeService.js";
import { KNOWLEDGE_NOT_FOUND_MSG } from "../../telegramKnowledge.js";
import type { KnowledgeArticleRow } from "../../../types/knowledge.js";
import type { AgentChannel } from "../types.js";
import type { AgentToolContext, AgentToolResult } from "./types.js";

const CHANNEL_CATEGORY_HINTS: Record<AgentChannel, string[]> = {
  landing: ["comercial", "estrategia", "panel_cliente"],
  web_client: ["panel_cliente", "dlr", "estrategia", "soporte", "sms", "saldo"],
  telegram: ["dlr", "sms", "saldo", "telegram", "comercial", "soporte"],
  admin: ["errores", "seguridad", "smpp", "api", "telvoice"],
};

const PANEL_MAX_CHARS = 680;
const PANEL_MAX_LINES = 7;
const PANEL_KNOWLEDGE_CLOSER =
  "Puedo ayudarte a hacerlo paso a paso desde el panel.";

type KnowledgeArticleExtended = {
  title?: string | null;
  content: string;
  category: string;
  allowed_channels?: string[] | null;
  content_short?: string | null;
  answer_style?: string | null;
  blocked_when_flow_active?: boolean | null;
  metadata?: Record<string, unknown> | null;
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

function resolveArticleMeta(article: KnowledgeArticleExtended): Record<string, unknown> {
  const row = article as KnowledgeArticleRow & { metadata?: Record<string, unknown> };
  return (row.metadata ?? {}) as Record<string, unknown>;
}

function articleContentShort(article: KnowledgeArticleExtended): string | null {
  const meta = resolveArticleMeta(article);
  if (typeof article.content_short === "string" && article.content_short.trim()) {
    return article.content_short.trim();
  }
  if (typeof meta.content_short === "string" && meta.content_short.trim()) {
    return meta.content_short.trim();
  }
  return null;
}

function articleBlockedWhenFlowActive(article: KnowledgeArticleExtended): boolean {
  if (article.blocked_when_flow_active === false) {
    return false;
  }
  const meta = resolveArticleMeta(article);
  if (meta.blocked_when_flow_active === false) {
    return false;
  }
  return true;
}

function resolveShortContent(article: KnowledgeArticleExtended): string {
  const short = articleContentShort(article);
  if (short) {
    return short;
  }
  return summarizeContent(article.content, PANEL_MAX_CHARS);
}

function summarizeContent(full: string, maxChars: number): string {
  const trimmed = full.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
  let out = "";
  for (const s of sentences.slice(0, 3)) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > maxChars) {
      break;
    }
    out = next;
  }
  if (!out) {
    out = trimmed.slice(0, maxChars - 1).trimEnd() + "…";
  }
  return out;
}

function trimPanelLines(text: string, maxLines = PANEL_MAX_LINES): string {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length <= maxLines) {
    return text.trim();
  }
  return lines.slice(0, maxLines).join("\n");
}

/** Truncado runtime para respuestas knowledge del panel (título + cuerpo). */
export function truncatePanelKnowledgeReply(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }
  let body = trimPanelLines(trimmed);
  if (body.length > PANEL_MAX_CHARS) {
    body = summarizeContent(body, PANEL_MAX_CHARS - PANEL_KNOWLEDGE_CLOSER.length - 4);
  }
  const truncated =
    trimmed.length > body.length + 20 ||
    trimmed.split("\n").filter((l) => l.trim()).length >
      body.split("\n").filter((l) => l.trim()).length;
  if (truncated && !body.includes(PANEL_KNOWLEDGE_CLOSER)) {
    body = `${body}\n\n${PANEL_KNOWLEDGE_CLOSER}`;
  }
  return body.trim();
}

function formatKnowledgeReply(
  article: KnowledgeArticleExtended,
  channel: AgentChannel,
  relatedTitles: string[],
  options?: { operationalMode?: boolean },
): string {
  const operational = options?.operationalMode === true;
  const style = article.answer_style ?? "short";
  let body: string;

  if (channel === "web_client" && !operational && style !== "detailed") {
    body = resolveShortContent(article);
    body = trimPanelLines(body);
  } else if (channel === "telegram" && article.content.length > 600) {
    body = summarizeContent(article.content, 600);
  } else {
    body = article.content.trim();
  }

  let reply = `${article.title ?? "Información"}\n\n${body}`;

  if (channel === "web_client" && !operational) {
    reply = truncatePanelKnowledgeReply(reply);
  }

  if (
    !operational &&
    relatedTitles.length > 0 &&
    channel !== "web_client"
  ) {
    reply += `\n\n—\nRelacionado:\n${relatedTitles.map((t) => `• ${t}`).join("\n")}`;
  }

  return reply;
}

export type KnowledgeSearchOptions = {
  operationalMode?: boolean;
  flowActive?: boolean;
};

export async function searchKnowledgeForChannel(
  query: string,
  channel: AgentChannel,
  options?: KnowledgeSearchOptions,
): Promise<{ reply: string; confidence: number; matched: boolean }> {
  const raw = await searchKnowledgeRaw(query, 12);
  const flowActive = options?.flowActive === true;

  const filtered = filterKnowledgeSearchResults(
    raw.filter((r) => {
      const art = r.article as KnowledgeArticleExtended;
      if (!articleAllowsChannel(art, channel)) {
        return false;
      }
      if (flowActive && articleBlockedWhenFlowActive(art)) {
        return false;
      }
      return true;
    }),
  );

  if (filtered.length > 0 && filtered[0]!.score >= KNOWLEDGE_MIN_SCORE) {
    const best = filtered[0]!.article as KnowledgeArticleExtended;
    const conf = Math.min(0.95, 0.5 + filtered[0]!.score / 80);
    const related = filtered
      .slice(1, 3)
      .map((r) => String(r.article.title ?? ""))
      .filter(Boolean);
    const reply = formatKnowledgeReply(best, channel, related, options);
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
