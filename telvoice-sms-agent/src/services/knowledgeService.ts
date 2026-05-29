import { getSupabase } from "../database/supabaseClient.js";
import {
  KNOWLEDGE_CATEGORIES,
  type CreateKnowledgeArticleInput,
  type KnowledgeArticleRow,
  type KnowledgeSearchResult,
  type UpdateKnowledgeArticleInput,
} from "../types/knowledge.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

/** Score mínimo del mejor resultado para responder (evita coincidencias débiles). */
export const KNOWLEDGE_MIN_SCORE = 10;

/** Mínimo absoluto para artículos relacionados en la respuesta. */
const KNOWLEDGE_RELATED_MIN_SCORE = 10;

/** Ratio respecto al mejor score para incluir relacionados. */
const KNOWLEDGE_RELATED_SCORE_RATIO = 0.35;

export const KNOWLEDGE_MAX_RELATED = 3;

const STOP_WORDS = new Set([
  "si",
  "que",
  "significa",
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
  "sus",
  "no",
  "se",
  "lo",
]);

const SHORT_SIGNAL_TOKENS = new Set(["f", "s", "p", "t"]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeQuery(query: string): string[] {
  const normalized = normalizeText(query);
  const technicalContext =
    /\b(tipo|provider_status|status|sms_type|submitted|delivered|failed|dlr)\b/.test(
      normalized,
    );

  const tokens = normalized
    .split(/\s+/)
    .filter((t) => {
      if (!t) {
        return false;
      }
      if (STOP_WORDS.has(t)) {
        return false;
      }
      if (t.length >= 2) {
        return true;
      }
      if (technicalContext && SHORT_SIGNAL_TOKENS.has(t)) {
        return true;
      }
      return false;
    });

  return [...new Set(tokens)];
}

function keywordMatchesTerm(keyword: string, term: string): boolean {
  if (keyword === term) {
    return true;
  }
  if (term.length >= 3 && keyword.includes(term)) {
    return true;
  }
  if (keyword.length >= 3 && term.length >= 3 && term.includes(keyword)) {
    return true;
  }
  return false;
}

function applyPhraseBoosts(
  normalizedQuery: string,
  title: string,
  score: number,
): number {
  let boosted = score;
  const phrases: { patterns: string[]; titleNeedle: string; bonus: number }[] = [
    {
      patterns: ["provider_status f", "provider status f", "status f"],
      titleNeedle: "provider_status f",
      bonus: 35,
    },
    {
      patterns: ["provider_status s", "provider status s", "status s"],
      titleNeedle: "provider_status s",
      bonus: 35,
    },
    {
      patterns: ["sms_type p", "sms type p", "tipo p"],
      titleNeedle: "sms_type p",
      bonus: 30,
    },
    {
      patterns: ["sms_type t", "sms type t", "tipo t"],
      titleNeedle: "sms_type t",
      bonus: 30,
    },
  ];

  for (const { patterns, titleNeedle, bonus } of phrases) {
    if (
      patterns.some((p) => normalizedQuery.includes(p)) &&
      title.includes(titleNeedle)
    ) {
      boosted += bonus;
    }
  }

  if (
    (normalizedQuery.includes("failed") ||
      normalizedQuery.includes("fallido") ||
      normalizedQuery.includes("fallo")) &&
    title.includes("failed")
  ) {
    boosted += 25;
  }

  if (
    (normalizedQuery.includes("no llega") ||
      normalizedQuery.includes("no llego") ||
      normalizedQuery.includes("sms no llega")) &&
    title.includes("no llega")
  ) {
    boosted += 25;
  }

  return boosted;
}

const COMMERCIAL_QUERY_HINT =
  /\b(comprar|bolsa|bolsas|cotizar|precios|planes|mercadopago|recargar|cargar saldo|link|pagar|pago)\b/;

function scoreArticle(
  article: KnowledgeArticleRow,
  normalizedQuery: string,
  terms: string[],
): number {
  if (
    COMMERCIAL_QUERY_HINT.test(normalizedQuery) &&
    article.category !== "comercial" &&
    /\b(sms tipo|tipo p|tipo t|submitted|delivered|failed|dlr|provider_status)\b/.test(
      normalizeText(article.title),
    )
  ) {
    return 0;
  }

  let score = 0;
  const title = normalizeText(article.title);
  const content = normalizeText(article.content);
  const keywords = (article.keywords ?? []).map((k) => normalizeText(k));

  if (normalizedQuery.length >= 3 && title === normalizedQuery) {
    score += 50;
  } else if (
    normalizedQuery.length >= 3 &&
    (title.includes(normalizedQuery) || normalizedQuery.includes(title))
  ) {
    score += 50;
  }

  for (const term of terms) {
    if (term.length >= 3 && title.includes(term)) {
      score += 25;
    }
  }

  for (const keyword of keywords) {
    for (const term of terms) {
      if (keywordMatchesTerm(keyword, term)) {
        score += 20;
        break;
      }
    }
    if (
      normalizedQuery.length >= 3 &&
      (keyword.includes(normalizedQuery) || normalizedQuery.includes(keyword))
    ) {
      score += 20;
    }
  }

  for (const term of terms) {
    if (term.length >= 3 && content.includes(term)) {
      score += 5;
    }
  }

  for (const term of terms) {
    if (term.length >= 3) {
      score += 1;
    }
  }

  return applyPhraseBoosts(normalizedQuery, title, score);
}

export function filterKnowledgeSearchResults(
  ranked: KnowledgeSearchResult[],
): KnowledgeSearchResult[] {
  if (ranked.length === 0 || ranked[0]!.score < KNOWLEDGE_MIN_SCORE) {
    return [];
  }

  const best = ranked[0]!;
  const relatedThreshold = Math.max(
    KNOWLEDGE_RELATED_MIN_SCORE,
    Math.floor(best.score * KNOWLEDGE_RELATED_SCORE_RATIO),
  );

  const related = ranked
    .slice(1)
    .filter((r) => r.score >= relatedThreshold)
    .slice(0, KNOWLEDGE_MAX_RELATED);

  return [best, ...related];
}

export function validateKnowledgeCategory(category: string): string {
  const normalized = category.trim().toLowerCase();
  if (!KNOWLEDGE_CATEGORIES.includes(normalized as (typeof KNOWLEDGE_CATEGORIES)[number])) {
    throw new ValidationError(
      `category debe ser una de: ${KNOWLEDGE_CATEGORIES.join(", ")}.`,
    );
  }
  return normalized;
}

export function parseKeywordsInput(raw: string): string[] {
  return raw
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

export async function listKnowledgeArticles(options?: {
  activeOnly?: boolean;
  search?: string;
  limit?: number;
}): Promise<KnowledgeArticleRow[]> {
  let query = getSupabase()
    .from("knowledge_articles")
    .select("*")
    .order("updated_at", { ascending: false });

  if (options?.activeOnly) {
    query = query.eq("is_active", true);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    wrapSupabaseError(error, "listKnowledgeArticles");
  }

  let rows = (data ?? []) as KnowledgeArticleRow[];

  if (options?.search?.trim()) {
    const results = await searchKnowledge(options.search, options.limit ?? 50);
    rows = results.map((r) => r.article);
  }

  return rows;
}

export async function countActiveKnowledgeArticles(): Promise<number> {
  const { count, error } = await getSupabase()
    .from("knowledge_articles")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  if (error) {
    wrapSupabaseError(error, "countActiveKnowledgeArticles");
  }

  return count ?? 0;
}

export async function getKnowledgeArticleById(
  id: string,
): Promise<KnowledgeArticleRow> {
  const { data, error } = await getSupabase()
    .from("knowledge_articles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    wrapSupabaseError(error, "getKnowledgeArticleById");
  }

  if (!data) {
    throw new NotFoundError(`Artículo no encontrado: ${id}`);
  }

  return data as KnowledgeArticleRow;
}

export async function createKnowledgeArticle(
  input: CreateKnowledgeArticleInput,
): Promise<KnowledgeArticleRow> {
  const base: Record<string, unknown> = {
    title: input.title.trim(),
    category: validateKnowledgeCategory(input.category),
    keywords: input.keywords,
    content: input.content.trim(),
    is_active: input.is_active ?? true,
  };

  if (input.allowed_channels?.length) {
    base.allowed_channels = input.allowed_channels;
  }
  if (input.audience) {
    base.audience = input.audience;
  }
  if (input.priority != null) {
    base.priority = input.priority;
  }
  if (input.source_unanswered_question_id) {
    base.source_unanswered_question_id = input.source_unanswered_question_id;
  }

  let { data, error } = await getSupabase()
    .from("knowledge_articles")
    .insert(base)
    .select("*")
    .single();

  if (error) {
    const msg = String(error.message ?? "");
    const optionalMissing =
      /allowed_channels|audience|priority|source_unanswered/.test(msg);
    if (optionalMissing) {
      const minimal = {
        title: base.title,
        category: base.category,
        keywords: base.keywords,
        content: base.content,
        is_active: base.is_active,
      };
      const retry = await getSupabase()
        .from("knowledge_articles")
        .insert(minimal)
        .select("*")
        .single();
      data = retry.data;
      error = retry.error;
    }
  }

  if (error) {
    wrapSupabaseError(error, "createKnowledgeArticle");
  }

  return data as KnowledgeArticleRow;
}

export async function updateKnowledgeArticle(
  id: string,
  input: UpdateKnowledgeArticleInput,
): Promise<KnowledgeArticleRow> {
  const patch: Record<string, unknown> = {};

  if (input.title !== undefined) {
    patch.title = input.title.trim();
  }
  if (input.category !== undefined) {
    patch.category = validateKnowledgeCategory(input.category);
  }
  if (input.keywords !== undefined) {
    patch.keywords = input.keywords;
  }
  if (input.content !== undefined) {
    patch.content = input.content.trim();
  }
  if (input.is_active !== undefined) {
    patch.is_active = input.is_active;
  }

  const { data, error } = await getSupabase()
    .from("knowledge_articles")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updateKnowledgeArticle");
  }

  return data as KnowledgeArticleRow;
}

export async function deleteKnowledgeArticle(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from("knowledge_articles")
    .delete()
    .eq("id", id);

  if (error) {
    wrapSupabaseError(error, "deleteKnowledgeArticle");
  }
}

export async function searchKnowledge(
  query: string,
  limit = 5,
): Promise<KnowledgeSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const { data, error } = await getSupabase()
    .from("knowledge_articles")
    .select("*")
    .eq("is_active", true);

  if (error) {
    wrapSupabaseError(error, "searchKnowledge");
  }

  const normalizedQuery = normalizeText(trimmed);
  const terms = tokenizeQuery(trimmed);

  const ranked = ((data ?? []) as KnowledgeArticleRow[])
    .map((article) => ({
      article,
      score: scoreArticle(article, normalizedQuery, terms),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const filtered = filterKnowledgeSearchResults(ranked);
  const fetchLimit = Math.min(
    limit,
    1 + KNOWLEDGE_MAX_RELATED,
  );
  return filtered.slice(0, fetchLimit);
}

export async function searchKnowledgeRaw(
  query: string,
  limit = 10,
): Promise<KnowledgeSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const { data, error } = await getSupabase()
    .from("knowledge_articles")
    .select("*")
    .eq("is_active", true);

  if (error) {
    wrapSupabaseError(error, "searchKnowledge");
  }

  const normalizedQuery = normalizeText(trimmed);
  const terms = tokenizeQuery(trimmed);

  return ((data ?? []) as KnowledgeArticleRow[])
    .map((article) => ({
      article,
      score: scoreArticle(article, normalizedQuery, terms),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function checkKnowledgeTableAvailable(): Promise<boolean> {
  const { error } = await getSupabase()
    .from("knowledge_articles")
    .select("id")
    .limit(1);

  return !error;
}
