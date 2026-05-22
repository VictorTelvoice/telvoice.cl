import type { KnowledgeSearchResult } from "../types/knowledge.js";
import {
  filterKnowledgeSearchResults,
  KNOWLEDGE_MIN_SCORE,
  searchKnowledge,
  searchKnowledgeRaw,
} from "./knowledgeService.js";

export const KNOWLEDGE_NOT_FOUND_MSG =
  "No encontré una respuesta exacta en la base Telvoice. Puedes preguntarme sobre saldo, envío SMS, DLR, submitted, delivered, failed, IP whitelist, API o Telegram.";

export const KNOWLEDGE_ADMIN_NOT_FOUND_MSG = KNOWLEDGE_NOT_FOUND_MSG;

export const KNOWLEDGE_TEST_EXAMPLES = [
  "qué significa failed",
  "Y failed? Que no llegó el SMS?",
  "por qué mi sms no llega",
  "qué significa provider_status F",
  "qué es dlr",
  "cómo autorizo un usuario telegram",
] as const;

export interface KnowledgeSimulationResult {
  question: string;
  results: KnowledgeSearchResult[];
  /** Top candidatos sin filtrar (útil en el simulador admin). */
  candidates: KnowledgeSearchResult[];
  belowThreshold: boolean;
  telegramReply: string;
}

export function extractBuscarQuery(text: string): string | null {
  const match = /^(?:\/)?buscar(?:@\w+)?\s+(.+)$/i.exec(text.trim());
  const query = match?.[1]?.trim();
  return query && query.length > 0 ? query : null;
}

export function formatKnowledgeReply(results: KnowledgeSearchResult[]): string {
  const best = results[0]!.article;
  let message = `${best.title}\n\n${best.content}`;

  if (results.length > 1) {
    const related = results
      .slice(1)
      .map((r) => `• ${r.article.title}`)
      .join("\n");
    message += `\n\n—\nTambién relacionado:\n${related}`;
  }

  return message;
}

export function formatBuscarReply(
  query: string,
  results: KnowledgeSearchResult[],
): string {
  if (results.length === 0) {
    return `Sin resultados para "${query}".\n\n${KNOWLEDGE_NOT_FOUND_MSG}`;
  }

  const lines = [`Resultados para "${query}":`, ""];
  for (const r of results) {
    lines.push(
      `• ${r.article.title} (${r.article.category})`,
      r.article.content.length > 200
        ? `${r.article.content.slice(0, 200)}…`
        : r.article.content,
      "",
    );
  }
  return lines.join("\n").trim();
}

export async function answerKnowledgeQuestion(
  text: string,
): Promise<string> {
  const results = await searchKnowledge(text, 3);
  if (results.length === 0) {
    return KNOWLEDGE_NOT_FOUND_MSG;
  }
  return formatKnowledgeReply(results);
}

export async function answerBuscarCommand(query: string): Promise<string> {
  const raw = await searchKnowledgeRaw(query, 15);
  const results = raw
    .filter((r) => r.score >= KNOWLEDGE_MIN_SCORE)
    .slice(0, 5);
  return formatBuscarReply(query, results);
}

export async function simulateKnowledgeQuestion(
  text: string,
): Promise<KnowledgeSimulationResult> {
  const question = text.trim();
  if (!question) {
    return {
      question: "",
      results: [],
      candidates: [],
      belowThreshold: false,
      telegramReply: KNOWLEDGE_ADMIN_NOT_FOUND_MSG,
    };
  }

  const candidates = await searchKnowledgeRaw(question, 8);
  const results = filterKnowledgeSearchResults(candidates);
  const belowThreshold =
    candidates.length > 0 &&
    results.length === 0 &&
    candidates[0]!.score < KNOWLEDGE_MIN_SCORE;

  const telegramReply =
    results.length === 0
      ? KNOWLEDGE_ADMIN_NOT_FOUND_MSG
      : formatKnowledgeReply(results);

  return {
    question,
    results,
    candidates,
    belowThreshold,
    telegramReply,
  };
}
