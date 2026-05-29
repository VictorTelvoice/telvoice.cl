import type { NextFunction, Request, Response } from "express";
import { buildArticlePrefill } from "../services/agent/agentTrainingHelpers.js";
import {
  getUnansweredQuestionById,
  getUnansweredStats,
  listUnansweredQuestions,
  markUnansweredIgnored,
  markUnansweredReviewed,
} from "../services/agent/agentUnansweredService.js";
import {
  createKnowledgeArticle,
  parseKeywordsInput,
  validateKnowledgeCategory,
} from "../services/knowledgeService.js";
import { ValidationError } from "../utils/errors.js";
import { validateUuidParam } from "../utils/validation.js";
import {
  renderAgentTrainingCreateArticleForm,
  renderAgentTrainingHub,
  renderAgentTrainingUnansweredList,
} from "../views/admin-ui/sections/agent-training-pages.js";

function parseListFilters(req: Request) {
  const status =
    typeof req.query.status === "string" ? req.query.status.trim() : "";
  const channel =
    typeof req.query.channel === "string" ? req.query.channel.trim() : "";
  const detected_intent =
    typeof req.query.detected_intent === "string"
      ? req.query.detected_intent.trim()
      : "";
  const date_from =
    typeof req.query.date_from === "string" ? req.query.date_from.trim() : "";
  const date_to =
    typeof req.query.date_to === "string" ? req.query.date_to.trim() : "";

  return {
    status: status || undefined,
    channel: channel || undefined,
    detectedIntent: detected_intent || undefined,
    dateFrom: date_from ? `${date_from}T00:00:00.000Z` : undefined,
    dateTo: date_to ? `${date_to}T23:59:59.999Z` : undefined,
    limit: 150,
  };
}

function parseCreateArticleBody(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Datos del formulario inválidos.");
  }
  const record = body as Record<string, unknown>;
  const title = String(record.title ?? "").trim();
  const category = validateKnowledgeCategory(String(record.category ?? ""));
  const content = String(record.content ?? "").trim();
  const keywords = parseKeywordsInput(String(record.keywords ?? ""));
  const audience = String(record.audience ?? "general").trim() || "general";
  const priorityRaw = Number(record.priority ?? 0);
  const priority = Number.isFinite(priorityRaw) ? Math.max(0, priorityRaw) : 0;
  const channelsRaw = String(record.allowed_channels ?? "").trim();
  const allowed_channels = channelsRaw
    ? channelsRaw
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
    : ["telegram", "landing", "web_client", "admin"];
  const is_active =
    record.is_active === "1" ||
    record.is_active === "on" ||
    record.is_active === true;

  if (!title) {
    throw new ValidationError("title es obligatorio.");
  }
  if (!content) {
    throw new ValidationError("content es obligatorio.");
  }

  return {
    title,
    category,
    keywords,
    content,
    audience,
    priority,
    allowed_channels,
    is_active,
  };
}

export async function getAdminAgentHub(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await getUnansweredStats();
    res.type("html").send(
      renderAgentTrainingHub({ admin: req.adminUser!, stats }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getAdminAgentUnanswered(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filters = parseListFilters(req);
    const rows = await listUnansweredQuestions(filters);
    const successMessage =
      typeof req.query.success === "string" ? req.query.success : undefined;

    res.type("html").send(
      renderAgentTrainingUnansweredList({
        admin: req.adminUser!,
        rows,
        filters: {
          status: filters.status,
          channel: filters.channel,
          detected_intent: filters.detectedIntent,
          date_from:
            typeof req.query.date_from === "string"
              ? req.query.date_from
              : undefined,
          date_to:
            typeof req.query.date_to === "string" ? req.query.date_to : undefined,
        },
        successMessage,
        error:
          typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getAdminAgentCreateArticleForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const unanswered = await getUnansweredQuestionById(id);
    const prefill = buildArticlePrefill(unanswered);

    res.type("html").send(
      renderAgentTrainingCreateArticleForm({
        admin: req.adminUser!,
        unanswered,
        prefill,
        error:
          typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postAdminAgentCreateArticle(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const id = validateUuidParam(String(req.params.id ?? ""), "id");
  try {
    await getUnansweredQuestionById(id);
    const data = parseCreateArticleBody(req.body);

    const article = await createKnowledgeArticle({
      ...data,
      source_unanswered_question_id: id,
    });

    await markUnansweredReviewed(
      id,
      `knowledge_article:${article.id} — creado desde entrenamiento`,
    );

    res.redirect(
      `/admin/agent-training/unanswered?success=${encodeURIComponent(`Artículo creado y pregunta marcada como revisada.`)}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      try {
        const unanswered = await getUnansweredQuestionById(id);
        const prefill = buildArticlePrefill(unanswered);
        res.type("html").send(
          renderAgentTrainingCreateArticleForm({
            admin: req.adminUser!,
            unanswered,
            prefill,
            error: error.message,
            values: req.body as Record<string, unknown>,
          }),
        );
        return;
      } catch {
        res.redirect(
          `/admin/agent-training/unanswered?error=${encodeURIComponent(error.message)}`,
        );
        return;
      }
    }
    next(error);
  }
}

export async function postAdminAgentMarkReviewed(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await markUnansweredReviewed(id);
    res.redirect(
      `/admin/agent-training/unanswered?success=${encodeURIComponent("Pregunta marcada como revisada.")}`,
    );
  } catch (error) {
    next(error);
  }
}

export async function postAdminAgentIgnore(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await markUnansweredIgnored(id);
    res.redirect(
      `/admin/agent-training/unanswered?success=${encodeURIComponent("Pregunta marcada como ignorada.")}`,
    );
  } catch (error) {
    next(error);
  }
}
