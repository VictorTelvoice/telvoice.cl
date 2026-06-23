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
  "panel_cliente",
  "estrategia",
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export interface KnowledgeArticleRow {
  id: string;
  title: string;
  category: string;
  keywords: string[];
  content: string;
  content_short?: string | null;
  is_active: boolean;
  allowed_channels?: string[];
  audience?: string;
  priority?: number;
  answer_style?: string | null;
  trigger_intents?: string[];
  blocked_when_flow_active?: boolean;
  related_articles?: string[];
  metadata?: Record<string, unknown> | null;
  source_unanswered_question_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateKnowledgeArticleInput {
  title: string;
  category: string;
  keywords: string[];
  content: string;
  content_short?: string | null;
  is_active?: boolean;
  allowed_channels?: string[];
  audience?: string;
  priority?: number;
  answer_style?: string;
  trigger_intents?: string[];
  blocked_when_flow_active?: boolean;
  related_articles?: string[];
  metadata?: Record<string, unknown> | null;
  source_unanswered_question_id?: string | null;
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
