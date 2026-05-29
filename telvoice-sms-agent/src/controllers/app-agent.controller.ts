import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { runAgentCore } from "../services/agent/agentCore.js";
import { listPanelAgentMessages } from "../services/agent/panelAgentSessionService.js";
import { AppError } from "../utils/errors.js";

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

    const result = await runAgentCore({
      channel: "web_client",
      message,
      sessionId: sessionId || randomUUID(),
      companyId,
      userId:
        req.userProfile?.profileId ??
        req.userProfile?.adminUserId ??
        req.adminUser?.id ??
        null,
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
    const message =
      err instanceof Error ? err.message : "Error procesando el mensaje.";
    res.status(status).json({ success: false, error: message });
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
