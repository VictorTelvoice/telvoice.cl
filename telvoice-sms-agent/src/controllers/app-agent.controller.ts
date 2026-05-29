import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { runAgentCore } from "../services/agent/agentCore.js";
import { listPanelAgentMessages } from "../services/agent/panelAgentSessionService.js";
import { AppError, DatabaseError } from "../utils/errors.js";
import { recordAgentFeedback } from "../services/agent/agentFeedbackService.js";

const PERSIST_FRIENDLY_REPLY =
  "Tuve un problema guardando el historial de esta conversación, pero puedo seguir ayudándote. ¿Quieres que revise saldo, campañas, últimos envíos o compra de SMS?";

function clientSafeAgentError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (
    err instanceof DatabaseError ||
    /foreign key|violates|panel_agent_sessions|ensurepanelagentsession|postgres|supabase|sql state/i.test(
      raw,
    )
  ) {
    return PERSIST_FRIENDLY_REPLY;
  }
  if (err instanceof AppError) {
    return err.message;
  }
  return "No pude procesar tu mensaje en este momento. Intenta de nuevo en unos segundos.";
}

export async function postAppAgentChat(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const companyId = req.userProfile?.companyId ?? req.adminUser?.companyId;
    if (!companyId) {
      res.status(403).json({ success: false, error: "Empresa no asociada." });
      return;
    }

    const message = String(req.body?.message ?? "").trim();
    const sessionId = String(req.body?.sessionId ?? req.body?.session_id ?? "").trim();
    const pendingActionId = req.body?.pendingActionId ?? req.body?.pending_action_id;

    const userId =
      req.userProfile?.profileId ??
      req.userProfile?.adminUserId ??
      req.adminUser?.id ??
      null;

    const result = await runAgentCore({
      channel: "web_client",
      message,
      sessionId: sessionId || randomUUID(),
      companyId,
      userId,
      metadata: {
        ...(typeof req.body?.metadata === "object" && req.body.metadata
          ? req.body.metadata
          : {}),
        pendingActionId,
        page: req.body?.page,
      },
    });

    res.json({
      success: true,
      reply: result.reply,
      intent: result.intent,
      confidence: result.confidence,
      suggestedActions: result.suggestedActions ?? [],
      quote: result.quote ?? null,
      requiresConfirmation: result.requiresConfirmation ?? false,
      pendingActionId: result.pendingActionId ?? null,
      leadRequired: result.leadRequired ?? false,
      safeToExecute: result.safeToExecute ?? true,
      sessionId: result.sessionId,
    });
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : 500;
    res.status(status).json({ success: false, error: clientSafeAgentError(err) });
  }
}

export async function postAppAgentFeedback(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const companyId = req.userProfile?.companyId ?? req.adminUser?.companyId;
    const sessionId = String(req.body?.sessionId ?? "").trim();
    const rating = Number(req.body?.rating ?? 0);
    if (!sessionId || !Number.isFinite(rating)) {
      res.status(400).json({ success: false, error: "sessionId y rating requeridos." });
      return;
    }

    await recordAgentFeedback({
      channel: "web_client",
      sessionId,
      userId:
        req.userProfile?.profileId ??
        req.userProfile?.adminUserId ??
        req.adminUser?.id ??
        null,
      companyId: companyId ?? null,
      rating: rating >= 4 ? 5 : 1,
      feedbackText: String(req.body?.feedbackText ?? req.body?.comment ?? "").trim() || null,
      lastQuestion: String(req.body?.lastQuestion ?? "").trim() || undefined,
    });

    const needsDetail = rating < 4;
    res.json({
      success: true,
      needsDetail,
      reply: needsDetail
        ? "¿Qué faltó en la respuesta? Escríbelo en el chat."
        : "Gracias por tu feedback.",
    });
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : 500;
    res.status(status).json({
      success: false,
      error: err instanceof Error ? err.message : "Error al guardar feedback",
    });
  }
}

export async function getAppAgentHistory(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const companyId = req.userProfile?.companyId ?? req.adminUser?.companyId;
    if (!companyId) {
      res.status(403).json({ success: false, error: "Empresa no asociada." });
      return;
    }

    const sessionId = String(req.query.sessionId ?? req.query.session_id ?? "");
    if (!sessionId) {
      res.status(400).json({ success: false, error: "sessionId requerido." });
      return;
    }

    const messages = await listPanelAgentMessages(sessionId, companyId, 50);
    res.json({ success: true, sessionId, messages });
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : 500;
    res.status(status).json({
      success: false,
      error: err instanceof Error ? err.message : "Error al cargar historial.",
    });
  }
}
