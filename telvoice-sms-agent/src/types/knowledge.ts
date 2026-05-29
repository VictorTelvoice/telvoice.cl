export const KNOWLEDGE_CATEGORIES = [
  "sms",
  "dlr",
  "saldo",
  "api",
  "smpp",
  "telegram",
  "soporte",
  "comercial",
  "errores",
  "seguridad",
  "telvoice",
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export interface KnowledgeArticleRow {
  id: string;
  title: string;
  category: string;
  keywords: string[];
  content: string;
  is_active: boolean;
  allowed_channels?: string[];
  audience?: string;
  priority?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateKnowledgeArticleInput {
  title: string;
  category: string;
  keywords: string[];
  content: string;
  is_active?: boolean;
}

export interface UpdateKnowledgeArticleInput {
  title?: string;
  category?: string;
  keywords?: string[];
  content?: string;
  is_active?: boolean;
}

export interface KnowledgeSearchResult {
  article: KnowledgeArticleRow;
  score: number;
}
