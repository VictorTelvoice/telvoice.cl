import type { Request, Response } from "express";
import { runAgentCore } from "../services/agent/agentCore.js";
import { AppError } from "../utils/errors.js";

export async function postWebAgentChat(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const message = String(req.body?.message ?? "").trim();
    if (!message) {
      res.status(400).json({ success: false, error: "message requerido" });
      return;
    }

    const sessionId =
      String(req.body?.sessionId ?? req.body?.session_id ?? "").trim() ||
      `landing-${Date.now()}`;

    const result = await runAgentCore({
      channel: "landing",
      message,
      sessionId,
      metadata: {
        page: req.body?.current_url ?? req.body?.page,
        visitorKey: req.body?.session_token ?? req.body?.visitor_key,
        quick_action: req.body?.quick_action,
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
      sessionId: result.sessionId,
    });
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : 500;
    res.status(status).json({
      success: false,
      error: err instanceof Error ? err.message : "Error en agente",
    });
  }
}
