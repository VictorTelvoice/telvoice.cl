import type { NextFunction, Request, Response } from "express";
import {
  buildArticlePrefill,
  buildArticlePrefillFromFeedback,
} from "../services/agent/agentTrainingHelpers.js";
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
  backfillFeedbackContext,
  createUnansweredFromFeedback,
  getAgentFeedbackById,
  getAgentFeedbackStats,
  listAgentFeedback,
  markFeedbackConvertedToArticle,
  markFeedbackIgnored,
  markFeedbackReviewed,
  proposeFeedbackAnswer,
} from "../services/agent/agentFeedbackService.js";
import {
  renderAgentTrainingCreateArticleForm,
  renderAgentTrainingFeedbackCreateArticleForm,
  renderAgentTrainingFeedbackDetail,
  renderAgentTrainingFeedbackList,
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

function parseFeedbackFilters(req: Request) {
  const ratingRaw =
    typeof req.query.rating === "string" ? req.query.rating.trim() : "";
  let rating: "helpful" | "not_helpful" | "all" | undefined;
  if (ratingRaw === "helpful" || ratingRaw === "positive") {
    rating = "helpful";
  } else if (
    ratingRaw === "not_helpful" ||
    ratingRaw === "negative" ||
    ratingRaw === "negative_feedback"
  ) {
    rating = "not_helpful";
  } else if (ratingRaw) {
    rating = "all";
  }

  const status =
    typeof req.query.status === "string" ? req.query.status.trim() : "";
  const channel =
    typeof req.query.channel === "string" ? req.query.channel.trim() : "";
  const company_id =
    typeof req.query.company_id === "string" ? req.query.company_id.trim() : "";
  const search =
    typeof req.query.search === "string" ? req.query.search.trim() : "";
  const date_from =
    typeof req.query.date_from === "string" ? req.query.date_from.trim() : "";
  const date_to =
    typeof req.query.date_to === "string" ? req.query.date_to.trim() : "";

  return {
    rating,
    status: status || undefined,
    channel: channel || undefined,
    companyId: company_id || undefined,
    search: search || undefined,
    dateFrom: date_from ? `${date_from}T00:00:00.000Z` : undefined,
    dateTo: date_to ? `${date_to}T23:59:59.999Z` : undefined,
    limit: 150,
    date_from,
    date_to,
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

function parseProposeAnswerBody(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Datos del formulario inválidos.");
  }
  const record = body as Record<string, unknown>;
  const proposedAnswer = String(record.proposed_answer ?? record.content ?? "").trim();
  if (!proposedAnswer) {
    throw new ValidationError("La respuesta correcta es obligatoria.");
  }
  const priorityRaw = Number(record.priority ?? 5);
  return {
    title: String(record.title ?? "").trim() || undefined,
    category: String(record.category ?? "").trim() || undefined,
    keywords: String(record.keywords ?? "").trim() || undefined,
    proposedAnswer,
    allowedChannels: String(record.allowed_channels ?? "").trim() || undefined,
    audience: String(record.audience ?? "").trim() || undefined,
    priority: Number.isFinite(priorityRaw) ? priorityRaw : 5,
    adminNotes: String(record.admin_notes ?? "").trim() || undefined,
    convertToArticle:
      record.convert_to_article === "1" ||
      record.convert_to_article === "on" ||
      record.convert_to_article === true,
  };
}

export async function getAdminAgentHub(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await getUnansweredStats();
    const feedbackStats = await getAgentFeedbackStats();
    res.type("html").send(
      renderAgentTrainingHub({
        admin: req.adminUser!,
        stats,
        feedbackStats,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getAdminAgentFeedback(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filters = parseFeedbackFilters(req);
    const [rows, stats] = await Promise.all([
      listAgentFeedback(filters),
      getAgentFeedbackStats(),
    ]);
    res.type("html").send(
      renderAgentTrainingFeedbackList({
        admin: req.adminUser!,
        rows,
        stats,
        filters,
        successMessage:
          typeof req.query.success === "string" ? req.query.success : undefined,
        error:
          typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getAdminAgentFeedbackDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const detail = await getAgentFeedbackById(id);
    res.type("html").send(
      renderAgentTrainingFeedbackDetail({
        admin: req.adminUser!,
        detail,
        successMessage:
          typeof req.query.success === "string" ? req.query.success : undefined,
        error:
          typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getAdminAgentFeedbackCreateArticleForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const detail = await getAgentFeedbackById(id);
    const prefill = buildArticlePrefillFromFeedback(detail);

    res.type("html").send(
      renderAgentTrainingFeedbackCreateArticleForm({
        admin: req.adminUser!,
        detail,
        prefill,
        error:
          typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postAdminAgentFeedbackCreateArticle(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const id = validateUuidParam(String(req.params.id ?? ""), "id");
  try {
    await getAgentFeedbackById(id);
    const data = parseCreateArticleBody(req.body);

    const article = await createKnowledgeArticle(data);
    await markFeedbackConvertedToArticle(
      id,
      article.id,
      `Artículo creado desde feedback ${id.slice(0, 8)}`,
    );

    res.redirect(
      `/admin/agent-training/feedback/${id}?success=${encodeURIComponent("Artículo creado y feedback marcado como convertido.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      try {
        const detail = await getAgentFeedbackById(id);
        const prefill = buildArticlePrefillFromFeedback(detail);
        res.type("html").send(
          renderAgentTrainingFeedbackCreateArticleForm({
            admin: req.adminUser!,
            detail,
            prefill,
            error: error.message,
            values: req.body as Record<string, unknown>,
          }),
        );
        return;
      } catch {
        res.redirect(
          `/admin/agent-training/feedback/${id}?error=${encodeURIComponent(error.message)}`,
        );
        return;
      }
    }
    next(error);
  }
}

export async function postAdminAgentFeedbackMarkReviewed(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const notes = String(req.body?.admin_notes ?? "").trim() || null;
    await markFeedbackReviewed(id, notes);
    const back = req.body?.redirect === "list" ? "/admin/agent-training/feedback" : `/admin/agent-training/feedback/${id}`;
    res.redirect(
      `${back}?success=${encodeURIComponent("Feedback marcado como revisado.")}`,
    );
  } catch (error) {
    next(error);
  }
}

export async function postAdminAgentFeedbackIgnore(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const notes = String(req.body?.admin_notes ?? "").trim() || null;
    await markFeedbackIgnored(id, notes);
    res.redirect(
      `/admin/agent-training/feedback?success=${encodeURIComponent("Feedback ignorado.")}`,
    );
  } catch (error) {
    next(error);
  }
}

export async function postAdminAgentFeedbackProposeAnswer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const id = validateUuidParam(String(req.params.id ?? ""), "id");
  try {
    const parsed = parseProposeAnswerBody(req.body);
    await proposeFeedbackAnswer(id, parsed);

    if (parsed.convertToArticle) {
      const detail = await getAgentFeedbackById(id);
      const prefill = buildArticlePrefillFromFeedback({
        ...detail,
        proposed_answer: parsed.proposedAnswer,
      });
      const article = await createKnowledgeArticle({
        title: parsed.title || prefill.title,
        category: validateKnowledgeCategory(
          parsed.category || prefill.category,
        ),
        keywords: parsed.keywords
          ? parseKeywordsInput(parsed.keywords)
          : prefill.keywords,
        content: parsed.proposedAnswer,
        audience: parsed.audience || prefill.audience,
        priority: parsed.priority,
        allowed_channels: parsed.allowedChannels
          ? parsed.allowedChannels.split(",").map((c) => c.trim()).filter(Boolean)
          : prefill.allowed_channels,
        is_active: true,
      });
      await markFeedbackConvertedToArticle(id, article.id, parsed.adminNotes);
      res.redirect(
        `/admin/agent-training/feedback/${id}?success=${encodeURIComponent("Respuesta guardada y artículo creado.")}`,
      );
      return;
    }

    res.redirect(
      `/admin/agent-training/feedback/${id}?success=${encodeURIComponent("Respuesta correcta guardada.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      res.redirect(
        `/admin/agent-training/feedback/${id}?error=${encodeURIComponent(error.message)}`,
      );
      return;
    }
    next(error);
  }
}

export async function postAdminAgentFeedbackCreateUnanswered(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await createUnansweredFromFeedback(id);
    res.redirect(
      `/admin/agent-training/feedback/${id}?success=${encodeURIComponent("Pregunta sin respuesta creada (o deduplicada).")}`,
    );
  } catch (error) {
    next(error);
  }
}

export async function postAdminAgentFeedbackBackfill(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await backfillFeedbackContext(id);
    res.redirect(
      `/admin/agent-training/feedback/${id}?success=${encodeURIComponent("Pregunta y respuesta sincronizadas desde la sesión.")}`,
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
