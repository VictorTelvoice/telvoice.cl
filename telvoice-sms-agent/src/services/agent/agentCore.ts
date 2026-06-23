import { randomUUID } from "node:crypto";
import { AppError } from "../../utils/errors.js";
import {
  matchesCancelIntent,
  matchesConfirmIntent,
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
import { matchesSendSmsFlowIntent } from "./agentSendSmsIntent.js";
import {
  clearSendSmsFlowMemory,
  postAgentSendQuickActions,
  tryActiveSendSmsFlowFirst,
} from "./agentSendSmsFlow.js";
import {
  detectPurchaseIntent,
  handleBuySmsFlow,
  hasActivePurchaseQuote,
  isPurchasePaymentConfirmation,
  PURCHASE_FLOW_STEP,
  tryActivePurchaseFlowFirst,
} from "./agentPurchaseFlow.js";
import { shouldSkipKnowledgeForSendFlow } from "./agentSendSmsFlowUi.js";
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
import {
  handlePureGreetingReset,
  isPureGreeting,
} from "./agentGreetingReset.js";
import {
  buildRouterDecision,
  canUseKnowledgeSearch,
  logRouterDecision,
  resolveAgentMode,
  shouldShowFeedbackButtons,
  shouldTreatUserTextAsSmsMessage,
} from "./agentOperationalState.js";
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
  const trimmed = message.trim();
  const isCancel =
    /^(cancelar|cancelo|no confirmo|anular|detener|salir|cerrar|terminar)\b/i.test(
      trimmed,
    ) ||
    (pending != null && /^(no|nop)\b/i.test(trimmed.toLowerCase()));

  if (isCancel) {
    const memory = await getConversationMemory(sessionId, ctx.channel);
    const flowActive =
      Boolean(pending) ||
      memory.sendSmsFlowActive === true ||
      Boolean(memory.sendSmsFlowStep) ||
      Boolean(memory.pendingSmsMessage) ||
      Boolean(memory.pendingCsvUploadId);

    if (pending) {
      await clearPendingActionDb(pending.id, "cancelled");
    }
    await clearSendSmsFlowMemory(sessionId, ctx.channel, ctx.companyId);

    const rawReply = flowActive
      ? "Listo, cancelé este flujo. Puedes pedirme enviar un SMS, crear una campaña o revisar tu saldo cuando quieras."
      : "Listo. Si necesitas algo más, aquí estaré.";

    return {
      reply: composeAgentResponse({
        persona,
        channel: ctx.channel,
        intent: "cancel",
        rawReply,
        memory: await getConversationMemory(sessionId, ctx.channel),
        confidence: 0.99,
      }),
      intent: "cancel",
      confidence: 0.99,
      sessionId,
      suggestedActions: CLIENT_QUICK,
      clearCsvUpload: true,
      closeWidget: !flowActive,
      showAttachButton: false,
    };
  }

  if (!pending) {
    const mem = await getConversationMemory(sessionId, ctx.channel);
    const recentlyConfirmed =
      typeof mem.lastPendingConfirmAt === "number" &&
      Date.now() - mem.lastPendingConfirmAt < 15 * 60 * 1000;

    if (recentlyConfirmed) {
      await clearSendSmsFlowMemory(sessionId, ctx.channel, ctx.companyId);
      return {
        reply: composeAgentResponse({
          persona,
          channel: ctx.channel,
          intent: "confirm",
          rawReply:
            "Esta acción ya fue procesada. Puedes revisar el estado en Bandeja o iniciar una nueva campaña.",
          memory: await getConversationMemory(sessionId, ctx.channel),
          confidence: 0.95,
        }),
        intent: "confirm",
        confidence: 0.95,
        sessionId,
        suggestedActions: postAgentSendQuickActions("send_campaign_csv"),
        clearCsvUpload: true,
        showAttachButton: false,
      };
    }

    await clearSendSmsFlowMemory(sessionId, ctx.channel, ctx.companyId);
    return {
      reply: composeAgentResponse({
        persona,
        channel: ctx.channel,
        intent: "confirm",
        rawReply:
          "No encontré una acción pendiente para confirmar. Prepararé el envío nuevamente para que puedas revisarlo antes de enviarlo.",
        memory: await getConversationMemory(sessionId, ctx.channel),
        confidence: 0.7,
      }),
      intent: "confirm",
      confidence: 0.7,
      sessionId,
      suggestedActions: CLIENT_QUICK,
      clearCsvUpload: true,
      showAttachButton: false,
    };
  }

  if (pending.context.companyId && pending.context.companyId !== ctx.companyId) {
    throw new AppError("Acción no autorizada para esta empresa.", 403);
  }

  const pendingType = pending.type;
  const rawReply = await executePendingAction(pending);
  await clearPendingActionDb(pending.id, "confirmed");
  await clearSendSmsFlowMemory(sessionId, ctx.channel, ctx.companyId);
  await updateConversationMemory(
    sessionId,
    ctx.channel,
    { lastPendingConfirmAt: Date.now() },
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
    suggestedActions: postAgentSendQuickActions(pendingType),
    clearCsvUpload: true,
    showAttachButton: false,
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

  const memoryPatch: Parameters<typeof updateConversationMemory>[2] = {
    lastIntent: String(response.intent),
    lastQuantity: qty ?? memory.lastQuantity,
    lastQuote: response.quote ?? memory.lastQuote,
    lastTopic: String(response.intent),
    userDisplayName: userName ?? memory.userDisplayName,
  };
  if (response.intent === "quote_purchase" && response.quote) {
    memoryPatch.purchaseFlowStep =
      memory.purchaseFlowStep ?? PURCHASE_FLOW_STEP.REVIEW_QUOTE;
    memoryPatch.pendingPurchaseQuote =
      memory.pendingPurchaseQuote ?? response.quote;
    memoryPatch.pendingPurchaseQuantity =
      memory.pendingPurchaseQuantity ?? response.quote.quoted_quantity;
  }
  memory = await updateConversationMemory(sessionId, channel, memoryPatch, companyId);

  if (channel === "landing") {
    response = await applyLandingLeadFlow(message, sessionId, response, memory);
  }

  return response;
}

function enrichPanelMeta(
  response: AgentCoreResponse,
  memory: Awaited<ReturnType<typeof getConversationMemory>>,
): AgentCoreResponse {
  const agentMode = resolveAgentMode(memory);
  const showFeedback =
    response.showFeedback ??
    shouldShowFeedbackButtons(
      memory,
      String(response.intent),
      response.sendSmsFlowStep ?? memory.sendSmsFlowStep,
    );
  return {
    ...response,
    agentMode,
    showFeedback,
  };
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
    metadata,
  };

  if (channel === "web_client" && companyId && isPureGreeting(message)) {
    const greetingOut = await handlePureGreetingReset({
      sessionId,
      channel,
      companyId,
      metadata,
    });
    const enriched = enrichPanelMeta(greetingOut, await getConversationMemory(sessionId, channel));
    logRouterDecision(
      buildRouterDecision({
        user_text: message,
        current_flow_step: null,
        detected_intent: "greeting",
        selected_handler: "handlePureGreetingReset",
        knowledge_allowed: false,
        reason: "pure_greeting_reset",
        response_type: "greeting",
        agent_mode: "idle",
      }),
    );
    sessionId = await persistTurn(
      channel,
      companyId,
      request.userId,
      sessionId,
      message,
      enriched,
    );
    return { ...enriched, sessionId };
  }

  if (
    channel === "web_client" &&
    companyId &&
    shouldTreatUserTextAsSmsMessage(memory, message)
  ) {
    execCtx.companyId = companyId;
    const smsCapture = await tryActiveSendSmsFlowFirst(
      message,
      execCtx,
      sessionId,
      memory,
      metadata,
    );
    if (smsCapture) {
      let flowOut = await finalizeResponse(
        request,
        sessionId,
        companyId,
        smsCapture,
        message,
      );
      flowOut = enrichPanelMeta(flowOut, await getConversationMemory(sessionId, channel));
      logRouterDecision(
        buildRouterDecision({
          user_text: message,
          current_flow_step: memory.sendSmsFlowStep ?? "need_message",
          detected_intent: "send_sms_flow",
          selected_handler: "tryActiveSendSmsFlowFirst",
          knowledge_allowed: false,
          reason: "waiting_for_message_treat_as_sms_body",
          response_type: "operational",
          agent_mode: "operational",
        }),
      );
      sessionId = await persistTurn(
        channel,
        companyId,
        request.userId,
        sessionId,
        message,
        flowOut,
      );
      return { ...flowOut, sessionId };
    }
  }

  const route = routeAgentIntent(message, channel, {
    command,
    authorized,
    memory,
  });

  const isConfirmOrCancel =
    route.intent === "confirm" ||
    route.intent === "cancel" ||
    matchesConfirmIntent(message) ||
    matchesCancelIntent(message);

  const purchasePaymentConfirm =
    channel === "web_client" &&
    companyId &&
    hasActivePurchaseQuote(memory) &&
    isPurchasePaymentConfirmation(message);

  if (isConfirmOrCancel && !purchasePaymentConfirm) {
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

  if (channel === "web_client" && companyId) {
    if (purchasePaymentConfirm) {
      const payFirst = await tryActivePurchaseFlowFirst(
        message,
        execCtx,
        sessionId,
        memory,
      );
      if (payFirst) {
        const payOut = await finalizeResponse(
          request,
          sessionId,
          companyId,
          payFirst,
          message,
        );
        sessionId = await persistTurn(
          channel,
          companyId,
          request.userId,
          sessionId,
          message,
          payOut,
        );
        return { ...payOut, sessionId };
      }
    }

    const flowFirst = await tryActiveSendSmsFlowFirst(
      message,
      execCtx,
      sessionId,
      memory,
      metadata,
    );
    if (flowFirst) {
      let flowOut = await finalizeResponse(
        request,
        sessionId,
        companyId,
        flowFirst,
        message,
      );
      flowOut = enrichPanelMeta(
        flowOut,
        await getConversationMemory(sessionId, channel),
      );
      sessionId = await persistTurn(
        channel,
        companyId,
        request.userId,
        sessionId,
        message,
        flowOut,
      );
      return { ...flowOut, sessionId };
    }

    memory = await getConversationMemory(sessionId, channel);

    const purchaseFirst = await tryActivePurchaseFlowFirst(
      message,
      execCtx,
      sessionId,
      memory,
    );
    if (purchaseFirst) {
      const purchaseOut = await finalizeResponse(
        request,
        sessionId,
        companyId,
        purchaseFirst,
        message,
      );
      sessionId = await persistTurn(
        channel,
        companyId,
        request.userId,
        sessionId,
        message,
        purchaseOut,
      );
      return { ...purchaseOut, sessionId };
    }

    if (detectPurchaseIntent(message, memory)) {
      memory = await getConversationMemory(sessionId, channel);
      const buyFlow = await handleBuySmsFlow({
        message,
        ctx: execCtx,
        sessionId,
        memory,
        route,
      });
      if (buyFlow) {
        const buyOut = await finalizeResponse(
          request,
          sessionId,
          companyId,
          buyFlow,
          message,
        );
        sessionId = await persistTurn(
          channel,
          companyId,
          request.userId,
          sessionId,
          message,
          buyOut,
        );
        return { ...buyOut, sessionId };
      }
    }
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
    response.intent !== "inbound_sms_knowledge" &&
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

  const memoryBeforeKnowledge = await getConversationMemory(sessionId, channel);
  const knowledgeAllowed = canUseKnowledgeSearch(
    channel,
    memoryBeforeKnowledge,
    String(response.intent),
  );

  if (
    knowledgeAllowed &&
    !shouldSkipKnowledgeForSendFlow(memoryBeforeKnowledge, String(response.intent)) &&
    response.confidence < 0.45 &&
    response.intent !== "commercial" &&
    response.intent !== "knowledge" &&
    response.intent !== "inbound_sms_knowledge" &&
    response.intent !== "send_sms" &&
    response.intent !== "send_sms_flow" &&
    response.intent !== "campaign_draft" &&
    response.intent !== "technical_doubt" &&
    !matchesSendSmsFlowIntent(message) &&
    !/\b(ayudame a crear|ayúdame a crear|crear\s+(?:una\s+)?campana|preparar\s+(?:una\s+)?campana)\b/i.test(message)
  ) {
    const k = await searchKnowledgeForChannel(message, channel, {
      operationalMode: false,
      flowActive: false,
    });
    if (k.matched && k.confidence > response.confidence) {
      response = {
        ...response,
        reply: k.reply,
        intent: "knowledge",
        confidence: k.confidence,
        showFeedback: true,
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
  } else if (!knowledgeAllowed && response.intent === "unknown") {
    response = {
      ...response,
      reply:
        "Sigamos con el paso actual. Si quieres cancelar, escribe Cancelar.",
      confidence: 0.5,
      intent: "send_sms_flow",
    };
  }

  logRouterDecision(
    buildRouterDecision({
      user_text: message,
      current_flow_step:
        memoryBeforeKnowledge.sendSmsFlowStep ??
        memoryBeforeKnowledge.purchaseFlowStep ??
        null,
      detected_intent: String(route.intent),
      selected_handler: String(response.intent),
      knowledge_allowed: knowledgeAllowed,
      reason: knowledgeAllowed ? "knowledge_gate_open" : "operational_flow_lock",
      response_type: String(response.intent),
      agent_mode: resolveAgentMode(memoryBeforeKnowledge),
    }),
  );

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

  response = enrichPanelMeta(
    response,
    await getConversationMemory(sessionId, channel),
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
