import { randomUUID } from "node:crypto";
import { AppError } from "../../utils/errors.js";
import {
  routeAgentIntent,
  UNAUTHORIZED_PRIVATE_MSG,
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
import { matchesSendSmsIntent } from "./agentSendSmsIntent.js";
import { getAgentPersona } from "./agentPersona.js";
import {
  getConversationMemory,
  updateConversationMemory,
} from "./agentConversationMemory.js";
import {
  composeAgentResponse,
  composeLowConfidenceReply,
} from "./agentResponseComposer.js";
import {
  extractLeadFieldsFromText,
  leadFieldsComplete,
  mergeLeadFields,
  missingLeadFieldPrompt,
  saveLandingLead,
} from "./agentLeadCapture.js";
import { extractSmsQuantityFromText } from "../commercialQuoteService.js";
import { isLikelyCommercialPhrase } from "./agentCommercialText.js";
import { recordAgentFeedback } from "./agentFeedbackService.js";
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
  const persona = getAgentPersona(ctx.channel);
  const pending =
    (metadata?.pendingActionId
      ? await getPendingActionDb(String(metadata.pendingActionId))
      : null) ?? (await findPendingForSessionDb(sessionId, ctx.companyId));
  const isCancel =
    /^(cancelar|cancelo|no confirmo|anular|detener)\b/i.test(message.trim()) ||
    (pending != null && /^(no|nop)\b/i.test(message.trim().toLowerCase()));

  if (isCancel) {
    if (pending) {
      await clearPendingActionDb(pending.id, "cancelled");
    }
    await updateConversationMemory(
      sessionId,
      ctx.channel,
      { pendingSmsPhone: undefined, pendingSmsMessage: undefined },
      ctx.companyId,
    );
    return {
      reply: composeAgentResponse({
        persona,
        channel: ctx.channel,
        intent: "cancel",
        rawReply: "Acción cancelada.",
        memory: await getConversationMemory(sessionId, ctx.channel),
        confidence: 0.99,
        acknowledgment: persona.defaultCTA,
      }),
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

  const rawReply = await executePendingAction(pending);
  await clearPendingActionDb(pending.id, "confirmed");
  await updateConversationMemory(
    sessionId,
    ctx.channel,
    { pendingSmsPhone: undefined, pendingSmsMessage: undefined },
    ctx.companyId,
  );

  return {
    reply: composeAgentResponse({
      persona,
      channel: ctx.channel,
      intent: "confirm",
      rawReply,
      memory: await getConversationMemory(sessionId, ctx.channel),
      confidence: 0.99,
    }),
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

  const fallbackId = sessionId ?? `sess-${randomUUID()}`;

  try {
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
  } catch (err) {
    console.warn(
      "[agentCore] persistTurn failed; chat continues without DB history",
      err instanceof Error ? err.message : err,
    );
    return fallbackId;
  }
}

async function applyLandingLeadFlow(
  message: string,
  sessionId: string,
  response: AgentCoreResponse,
  memory: Awaited<ReturnType<typeof getConversationMemory>>,
): Promise<AgentCoreResponse> {
  const extracted = extractLeadFieldsFromText(message);
  const leadPartial = mergeLeadFields(memory.leadPartial ?? {}, extracted);
  const qty =
    response.quote?.quoted_quantity ??
    extractSmsQuantityFromText(message) ??
    leadPartial.requested_quantity;

  if (qty) {
    leadPartial.requested_quantity = qty;
  }

  await updateConversationMemory(sessionId, "landing", {
    leadPartial,
    lastQuote: response.quote ?? memory.lastQuote,
    lastQuantity: qty ?? memory.lastQuantity,
    lastIntent: response.intent,
  });

  const commercialIntents = new Set([
    "commercial",
    "quote_purchase",
    "lead_capture",
    "human_contact",
    "payment",
  ]);

  if (!commercialIntents.has(String(response.intent)) && !leadPartial.name) {
    return response;
  }

  if (leadFieldsComplete(leadPartial)) {
    const saved = await saveLandingLead({
      fields: leadPartial,
      sessionId,
      quote: response.quote ?? memory.lastQuote,
      lastMessage: message,
    });
    if (saved.ok) {
      return {
        ...response,
        reply: `${response.reply}\n\nListo, registré tus datos. Un ejecutivo Telvoice puede contactarte pronto.`,
        leadRequired: false,
      };
    }
  }

  const missing = missingLeadFieldPrompt(leadPartial);
  if (missing && (response.leadRequired || commercialIntents.has(String(response.intent)))) {
    return {
      ...response,
      reply: `${response.reply}\n\nPara avanzar necesito: ${missing}.`,
      leadRequired: true,
    };
  }

  return response;
}

async function finalizeResponse(
  request: AgentCoreRequest,
  sessionId: string,
  companyId: string | null,
  response: AgentCoreResponse,
  message: string,
): Promise<AgentCoreResponse> {
  const channel = request.channel;
  const persona = getAgentPersona(channel);
  const userName =
    typeof request.metadata?.userDisplayName === "string"
      ? request.metadata.userDisplayName
      : typeof request.metadata?.telegramFirstName === "string"
        ? request.metadata.telegramFirstName
        : null;

  let memory = await getConversationMemory(sessionId, channel);

  const composed = composeAgentResponse({
    persona,
    channel,
    intent: response.intent,
    rawReply: response.reply,
    memory,
    confidence: response.confidence,
    quote: response.quote ?? null,
    userName,
  });

  response = { ...response, reply: composed };

  const qty =
    response.quote?.quoted_quantity ??
    extractSmsQuantityFromText(message) ??
    undefined;

  memory = await updateConversationMemory(
    sessionId,
    channel,
    {
      lastIntent: String(response.intent),
      lastQuantity: qty ?? memory.lastQuantity,
      lastQuote: response.quote ?? memory.lastQuote,
      lastTopic: String(response.intent),
      userDisplayName: userName ?? memory.userDisplayName,
    },
    companyId,
  );

  if (channel === "landing") {
    response = await applyLandingLeadFlow(message, sessionId, response, memory);
  }

  return response;
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

  let memory = await getConversationMemory(sessionId, channel);

  if (memory.pendingFeedback) {
    await recordAgentFeedback({
      channel,
      sessionId,
      userId: request.userId,
      companyId,
      rating: 1,
      feedbackText: message,
      lastQuestion: memory.lastUserQuestion,
    });
    await updateConversationMemory(sessionId, channel, { pendingFeedback: false }, companyId);
    const persona = getAgentPersona(channel);
    const fbReply = composeAgentResponse({
      persona,
      channel,
      intent: "negative_feedback",
      rawReply: "Gracias, registré tu comentario para mejorar el agente.",
      memory,
      confidence: 0.9,
    });
    sessionId = await persistTurn(channel, companyId, request.userId, sessionId, message, {
      reply: fbReply,
      intent: "negative_feedback",
      confidence: 0.9,
      sessionId,
    });
    return { reply: fbReply, intent: "negative_feedback", confidence: 0.9, sessionId };
  }

  const execCtx: AgentExecutionContext = {
    channel,
    companyId: companyId ?? "",
    userId: request.userId ?? null,
    sessionId,
  };

  const route = routeAgentIntent(message, channel, {
    command,
    authorized,
    memory,
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
        let out = await finalizeResponse(
          request,
          sessionId,
          null,
          commercial,
          message,
        );
        sessionId = await persistTurn(
          channel,
          null,
          request.userId,
          sessionId,
          message,
          out,
        );
        return { ...out, sessionId };
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
  } else if (companyId || channel === "admin" || !route.requiresAuth) {
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
    response.intent !== "knowledge" &&
    isLikelyCommercialPhrase(message)
  ) {
    const commercialRoute = routeAgentIntent(message, channel, {
      command,
      authorized,
      memory: await getConversationMemory(sessionId, channel),
    });
    if (commercialRoute.intent === "commercial") {
      if (companyId) {
        execCtx.companyId = companyId;
      }
      response = await dispatchRoutedIntent(
        commercialRoute,
        message,
        execCtx,
        sessionId,
      );
    }
  }

  if (
    response.confidence < 0.45 &&
    response.intent !== "commercial" &&
    response.intent !== "knowledge" &&
    response.intent !== "send_sms" &&
    response.intent !== "campaign_draft" &&
    response.intent !== "technical_doubt" &&
    !matchesSendSmsIntent(message) &&
    !/\b(ayudame a crear|ayúdame a crear|crear\s+(?:una\s+)?campana)\b/i.test(message)
  ) {
    const k = await searchKnowledgeForChannel(message, channel);
    if (k.matched && k.confidence > response.confidence) {
      response = {
        ...response,
        reply: k.reply,
        intent: "knowledge",
        confidence: k.confidence,
      };
    } else if (!isLikelyCommercialPhrase(message)) {
      await recordUnansweredQuestion({
        channel,
        sessionId,
        userId: request.userId,
        companyId,
        question: message,
        detectedIntent: String(response.intent),
        confidence: response.confidence,
        suggestedCategory: "comercial",
      });
      response = {
        ...response,
        reply: composeLowConfidenceReply(getAgentPersona(channel), channel),
        confidence: 0.35,
      };
    }
  }

  if (route.intent === "negative_feedback") {
    await updateConversationMemory(
      sessionId,
      channel,
      { pendingFeedback: true, lastUserQuestion: message },
      companyId,
    );
  } else {
    await updateConversationMemory(
      sessionId,
      channel,
      { lastUserQuestion: message },
      companyId,
    );
  }

  response = await finalizeResponse(
    request,
    sessionId,
    companyId,
    response,
    message,
  );

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
