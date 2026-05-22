import type { NextFunction, Request, Response } from "express";
import {
  createKnowledgeArticle,
  deleteKnowledgeArticle,
  getKnowledgeArticleById,
  listKnowledgeArticles,
  parseKeywordsInput,
  updateKnowledgeArticle,
  validateKnowledgeCategory,
} from "../services/knowledgeService.js";
import { ValidationError } from "../utils/errors.js";
import { validateUuidParam } from "../utils/validation.js";
import { simulateKnowledgeQuestion } from "../services/telegramKnowledge.js";
import {
  renderKnowledgeFormPage,
  renderKnowledgeListPage,
  renderKnowledgeTestPage,
} from "../views/admin-pages.js";

function parseKnowledgeForm(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Datos del formulario inválidos.");
  }
  const record = body as Record<string, unknown>;
  const title = String(record.title ?? "").trim();
  const category = validateKnowledgeCategory(String(record.category ?? ""));
  const content = String(record.content ?? "").trim();
  const keywords = parseKeywordsInput(String(record.keywords ?? ""));
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

  return { title, category, keywords, content, is_active };
}

export async function getKnowledgeList(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const search =
      typeof req.query.q === "string" ? req.query.q.trim() : undefined;
    const articles = await listKnowledgeArticles({
      search: search || undefined,
      limit: 100,
    });

    res.type("html").send(
      renderKnowledgeListPage({
        admin: req.adminUser!,
        articles,
        searchQuery: search,
        successMessage:
          typeof req.query.success === "string" ? req.query.success : undefined,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export function getKnowledgeNewForm(req: Request, res: Response): void {
  const error =
    typeof req.query.error === "string" ? req.query.error : undefined;
  res.type("html").send(
    renderKnowledgeFormPage({
      admin: req.adminUser!,
      mode: "create",
      error,
    }),
  );
}

export async function postCreateKnowledge(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = parseKnowledgeForm(req.body);
    await createKnowledgeArticle(data);
    res.redirect(
      `/admin/knowledge?success=${encodeURIComponent("Artículo creado correctamente.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      res.type("html").send(
        renderKnowledgeFormPage({
          admin: req.adminUser!,
          mode: "create",
          error: error.message,
          values: req.body as Record<string, unknown>,
        }),
      );
      return;
    }
    next(error);
  }
}

export async function getKnowledgeEditForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const article = await getKnowledgeArticleById(id);
    const error =
      typeof req.query.error === "string" ? req.query.error : undefined;

    res.type("html").send(
      renderKnowledgeFormPage({
        admin: req.adminUser!,
        mode: "edit",
        article,
        error,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postEditKnowledge(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const data = parseKnowledgeForm(req.body);
    await updateKnowledgeArticle(id, data);
    res.redirect(
      `/admin/knowledge?success=${encodeURIComponent("Artículo actualizado.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const id = String(req.params.id ?? "");
      try {
        const article = await getKnowledgeArticleById(
          validateUuidParam(id, "id"),
        );
        res.type("html").send(
          renderKnowledgeFormPage({
            admin: req.adminUser!,
            mode: "edit",
            article,
            error: error.message,
            values: req.body as Record<string, unknown>,
          }),
        );
        return;
      } catch {
        /* fall through */
      }
    }
    next(error);
  }
}

export async function postDeleteKnowledge(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await deleteKnowledgeArticle(id);
    res.redirect(
      `/admin/knowledge?success=${encodeURIComponent("Artículo eliminado.")}`,
    );
  } catch (error) {
    next(error);
  }
}

export function getKnowledgeTest(req: Request, res: Response): void {
  const prefill =
    typeof req.query.q === "string" ? req.query.q.trim() : undefined;
  res.type("html").send(
    renderKnowledgeTestPage({
      admin: req.adminUser!,
      question: prefill,
    }),
  );
}

export async function postKnowledgeTest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const question = String(body.question ?? "").trim();

    if (!question) {
      res.type("html").send(
        renderKnowledgeTestPage({
          admin: req.adminUser!,
          question: "",
          error: "Escribe una pregunta para probar la base Telvoice.",
        }),
      );
      return;
    }

    const simulation = await simulateKnowledgeQuestion(question);
    res.type("html").send(
      renderKnowledgeTestPage({
        admin: req.adminUser!,
        question,
        simulation,
      }),
    );
  } catch (error) {
    next(error);
  }
}
