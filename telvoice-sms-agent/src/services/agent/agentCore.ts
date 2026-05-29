import { randomUUID } from "node:crypto";
import { AppError } from "../../utils/errors.js";
import {
  routeAgentIntent,
  UNAUTHORIZED_PRIVATE_MSG,
  LOW_CONFIDENCE_FALLBACK,
} from "./agentIntentRouter.js";
import { dispatchRoutedIntent } from "./agentHandlers.js";
import {
  appendPanelAgentMessage,
  ensurePanelAgentSession,
} from "./panelAgentSessionService.js";
import {
  clearPendingActionDb,
  findPendingForSessionDb,
  getPendingActionDb,
} from "./agentPendingActionsService.js";
import { executePendingAction } from "./executePendingAction.js";
import { recordUnansweredQuestion } from "./agentUnansweredService.js";
import { searchKnowledgeForChannel } from "./tools/searchKnowledgeTool.js";
import type {
  AgentCoreRequest,
  AgentCoreResponse,
  AgentExecutionContext,
  AgentSuggestedAction,
} from "./types.js";

const CLIENT_QUICK: AgentSuggestedAction[] = [
  { label: "Ver mi saldo", message: "¿Cuánto saldo tengo?" },
  { label: "Últimos envíos", message: "Muéstrame mis últimos envíos" },
  { label: "Cotizar SMS", message: "Quiero comprar 30000 SMS" },
  { label: "Ayuda DLR", message: "¿Qué significa submitted?" },
];

function isAuthorized(metadata?: Record<string, unknown>): boolean {
  return metadata?.authorized === true || metadata?.telegramAuthorized === true;
}

async function handleConfirmCancel(
  message: string,
  ctx: AgentExecutionContext,
  sessionId: string,
  metadata?: Record<string, unknown>,
): Promise<AgentCoreResponse> {
  const isCancel = /^cancel/i.test(message.trim());
  const pending =
    (metadata?.pendingActionId
      ? await getPendingActionDb(String(metadata.pendingActionId))
      : null) ?? (await findPendingForSessionDb(sessionId, ctx.companyId));

  if (isCancel) {
    if (pending) {
      await clearPendingActionDb(pending.id, "cancelled");
    }
    return {
      reply: "Acción cancelada. ¿En qué más te ayudo?",
      intent: "cancel",
      confidence: 0.99,
      sessionId,
      suggestedActions: CLIENT_QUICK,
    };
  }

  if (!pending) {
    return {
      reply: "No hay acciones pendientes de confirmación.",
      intent: "confirm",
      confidence: 0.5,
      sessionId,
      suggestedActions: CLIENT_QUICK,
    };
  }

  if (pending.context.companyId && pending.context.companyId !== ctx.companyId) {
    throw new AppError("Acción no autorizada para esta empresa.", 403);
  }

  const reply = await executePendingAction(pending);
  await clearPendingActionDb(pending.id, "confirmed");

  return {
    reply,
    intent: "confirm",
    confidence: 0.99,
    requiresConfirmation: false,
    safeToExecute: true,
    sessionId,
    suggestedActions: CLIENT_QUICK,
  };
}

async function persistTurn(
  channel: AgentCoreRequest["channel"],
  companyId: string | null | undefined,
  userId: string | null | undefined,
  sessionId: string | undefined,
  userMessage: string,
  assistant: AgentCoreResponse,
): Promise<string> {
  if (channel !== "web_client" || !companyId) {
    return sessionId ?? `sess-${randomUUID()}`;
  }

  const sid = await ensurePanelAgentSession({
    sessionId,
    companyId,
    userId: userId ?? null,
    channel: "web_client",
  });

  await appendPanelAgentMessage({
    sessionId: sid,
    companyId,
    role: "user",
    content: userMessage,
    metadata: { intent: assistant.intent },
  });

  await appendPanelAgentMessage({
    sessionId: sid,
    companyId,
    role: "assistant",
    content: assistant.reply,
    metadata: {
      intent: assistant.intent,
      confidence: assistant.confidence,
      pendingActionId: assistant.pendingActionId,
    },
  });

  return sid;
}

export async function runAgentCore(
  request: AgentCoreRequest,
): Promise<AgentCoreResponse> {
  const message = String(request.message ?? "").trim();
  if (!message) {
    throw new AppError("El mensaje no puede estar vacío.", 400);
  }

  const channel = request.channel;
  const metadata = request.metadata ?? {};
  const authorized = isAuthorized(metadata);
  const command =
    typeof metadata.command === "string" ? metadata.command : "";

  let sessionId =
    request.sessionId?.trim() ||
    (channel === "telegram" && metadata.telegramChatId
      ? `tg-${metadata.telegramChatId}`
      : randomUUID());

  const companyId =
    channel === "web_client" || channel === "admin"
      ? request.companyId ?? null
      : (metadata.resolvedCompanyId as string | undefined) ??
        request.companyId ??
        null;

  const execCtx: AgentExecutionContext = {
    channel,
    companyId: companyId ?? "",
    userId: request.userId ?? null,
    sessionId,
  };

  const route = routeAgentIntent(message, channel, {
    command,
    authorized,
  });

  if (route.intent === "confirm" || route.intent === "cancel") {
    if (!companyId && channel === "web_client") {
      throw new AppError("Sesión de empresa requerida.", 401);
    }
    if (companyId) {
      execCtx.companyId = companyId;
    }
    const result = await handleConfirmCancel(message, execCtx, sessionId, metadata);
    sessionId = await persistTurn(
      channel,
      companyId,
      request.userId,
      sessionId,
      message,
      result,
    );
    return { ...result, sessionId };
  }

  if (route.requiresAuth && !companyId && channel !== "landing") {
    if (channel === "telegram" && !authorized) {
      const commercial = await dispatchRoutedIntent(
        { ...route, intent: "commercial", requiresAuth: false },
        message,
        { ...execCtx, companyId: "" },
        sessionId,
      );
      if (commercial.intent === "commercial" && commercial.quote) {
        sessionId = await persistTurn(
          channel,
          null,
          request.userId,
          sessionId,
          message,
          commercial,
        );
        return { ...commercial, sessionId };
      }
      return {
        reply: UNAUTHORIZED_PRIVATE_MSG,
        intent: "unknown",
        confidence: 0.6,
        sessionId,
        suggestedActions: [
          { label: "Cotizar 1000 SMS", message: "cotizar 1000 sms" },
        ],
      };
    }
    throw new AppError("Esta acción requiere sesión de empresa.", 403);
  }

  if (
    (channel === "web_client" || channel === "admin") &&
    route.requiresAuth &&
    !companyId
  ) {
    throw new AppError("Empresa no asociada.", 403);
  }

  if (companyId) {
    execCtx.companyId = companyId;
  }

  let response: AgentCoreResponse;

  if (channel === "landing") {
    if (route.requiresAuth) {
      response = {
        reply:
          "Para consultar saldo o envíos necesitas ingresar al portal cliente. ¿Te cotizo una bolsa SMS?",
        intent: "register",
        confidence: 0.7,
        sessionId,
        suggestedActions: [
          { label: "Calculadora", href: "https://www.telvoice.cl/#calculadora" },
        ],
      };
    } else {
      response = await dispatchRoutedIntent(route, message, execCtx, sessionId);
    }
  } else if (companyId || channel === "admin") {
    response = await dispatchRoutedIntent(route, message, execCtx, sessionId);
  } else {
    response = {
      reply: UNAUTHORIZED_PRIVATE_MSG,
      intent: route.intent,
      confidence: route.confidence,
      sessionId,
    };
  }

  if (
    response.confidence < 0.45 &&
    response.intent !== "commercial" &&
    response.intent !== "knowledge"
  ) {
    const k = await searchKnowledgeForChannel(message, channel);
    if (k.matched && k.confidence > response.confidence) {
      response = {
        ...response,
        reply: k.reply,
        intent: "knowledge",
        confidence: k.confidence,
      };
    } else {
      await recordUnansweredQuestion({
        channel,
        sessionId,
        userId: request.userId,
        companyId,
        question: message,
        detectedIntent: String(response.intent),
        confidence: response.confidence,
      });
      response = {
        ...response,
        reply: LOW_CONFIDENCE_FALLBACK,
        confidence: 0.35,
      };
    }
  }

  sessionId = await persistTurn(
    channel,
    companyId,
    request.userId,
    sessionId,
    message,
    response,
  );

  return { ...response, sessionId };
}
