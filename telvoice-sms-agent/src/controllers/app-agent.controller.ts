import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { runAgentCore } from "../services/agent/agentCore.js";
import { listPanelAgentMessages } from "../services/agent/panelAgentSessionService.js";
import { AppError, DatabaseError } from "../utils/errors.js";
import { recordAgentFeedback } from "../services/agent/agentFeedbackService.js";
import {
  AGENT_CSV_MAX_BYTES,
  parseAgentRecipientCsv,
} from "../services/agent/agentPanelCsvService.js";
import { saveAgentCsvUpload } from "../services/agent/agentCsvUploadStore.js";
import {
  getConversationMemory,
  updateConversationMemory,
} from "../services/agent/agentConversationMemory.js";
import { handleSendSmsFlow } from "../services/agent/agentSendSmsFlow.js";

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
      lastReply: String(req.body?.lastReply ?? req.body?.agentReply ?? "").trim() || undefined,
      intent: String(req.body?.intent ?? "").trim() || null,
      confidence:
        req.body?.confidence != null && Number.isFinite(Number(req.body.confidence))
          ? Number(req.body.confidence)
          : null,
      userMessageId: String(req.body?.userMessageId ?? "").trim() || null,
      agentMessageId: String(req.body?.agentMessageId ?? "").trim() || null,
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

export async function postAppAgentUploadCsv(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const companyId = req.userProfile?.companyId ?? req.adminUser?.companyId;
    if (!companyId) {
      res.status(403).json({ success: false, error: "Empresa no asociada." });
      return;
    }

    const sessionId = String(req.body?.sessionId ?? req.body?.session_id ?? "").trim();
    if (!sessionId) {
      res.status(400).json({ success: false, error: "sessionId requerido." });
      return;
    }

    const csvText = String(req.body?.csvText ?? req.body?.csv_text ?? "").trim();
    if (!csvText) {
      res.status(400).json({ success: false, error: "Contenido CSV requerido." });
      return;
    }

    const byteLen = Buffer.byteLength(csvText, "utf8");
    if (byteLen > AGENT_CSV_MAX_BYTES) {
      res.status(400).json({
        success: false,
        error: `El archivo supera el máximo de ${Math.round(AGENT_CSV_MAX_BYTES / (1024 * 1024))} MB.`,
      });
      return;
    }

    const parsed = parseAgentRecipientCsv(csvText);
    const userId =
      req.userProfile?.profileId ??
      req.userProfile?.adminUserId ??
      req.adminUser?.id ??
      null;

    const upload = saveAgentCsvUpload({
      companyId,
      sessionId,
      userId,
      parsed,
    });

    const memory = await getConversationMemory(sessionId, "web_client");
    const msgBody = memory.pendingSmsMessage?.trim() ?? null;

    await updateConversationMemory(
      sessionId,
      "web_client",
      {
        sendSmsFlowActive: true,
        pendingCsvUploadId: upload.id,
        sendSmsDestMode: "csv",
        sendSmsFlowStep: msgBody ? "confirm_ready" : "need_csv_file",
      },
      companyId,
    );

    if (!msgBody) {
      res.json({
        success: true,
        uploadId: upload.id,
        summary: parsed,
        reply:
          "Recibí tu planilla. Antes de calcular el envío, dime qué mensaje quieres enviar en el SMS.",
        intent: "send_sms_flow",
        requiresMessage: true,
        sessionId,
      });
      return;
    }

    const flowReply = await handleSendSmsFlow(
      {
        intent: "send_sms_flow",
        confidence: 0.9,
        commercialQuantity: null,
        requiresAuth: true,
        operationalCommand: null,
      },
      msgBody,
      {
        channel: "web_client",
        companyId,
        userId,
        sessionId,
        metadata: { csvUploadId: upload.id },
      },
      sessionId,
      { csvUploadId: upload.id },
    );

    res.json({
      success: true,
      uploadId: upload.id,
      summary: parsed,
      reply: flowReply.reply,
      intent: flowReply.intent,
      confidence: flowReply.confidence,
      suggestedActions: flowReply.suggestedActions ?? [],
      requiresConfirmation: flowReply.requiresConfirmation ?? false,
      pendingActionId: flowReply.pendingActionId ?? null,
      sessionId: flowReply.sessionId,
    });
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : 500;
    res.status(status).json({
      success: false,
      error: err instanceof Error ? err.message : "Error al procesar CSV.",
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
