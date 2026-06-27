import { cancelAllPendingForSessionDb } from "./agentPendingActionsService.js";
import { clearSendSmsFlowMemory } from "./agentSendSmsFlow.js";
import {
  getConversationMemory,
  updateConversationMemory,
  type ConversationMemory,
} from "./agentConversationMemory.js";
import {
  isSupportTicketChangeCategory,
  isSupportTicketConfirm,
  isSupportTicketEditMessage,
  isSupportTicketIntent,
} from "./agentSupportTicketIntent.js";
import { isFlowExitCommand } from "./agentSendSmsFlowUi.js";
import {
  buildSupportTicketReviewReply,
  createSupportTicketForCompany,
  inferSupportTicketCategory,
  inferSupportTicketPriority,
  inferSupportTicketSubject,
  mapQuickActionToCategory,
} from "./supportTicketAgentService.js";
import type { SupportTicketCategory, SupportTicketPriority } from "../../types/support-tickets.js";
import { SUPPORT_CATEGORIES } from "../../types/support-tickets.js";
import type { AgentCoreResponse, AgentExecutionContext, AgentSuggestedAction } from "./types.js";
import type { RoutedIntent } from "./agentIntentRouter.js";

export const SUPPORT_TICKET_FLOW_STEP = {
  NEED_ISSUE: "need_issue",
  NEED_CATEGORY_OPTIONAL: "need_category_optional",
  REVIEW_TICKET: "review_ticket",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

const FLOW_INTENT = "support_ticket";

const INTRO_REPLY =
  "Claro, puedo crear un ticket para soporte Telvoice. ¿Qué necesitas que revisemos?";

function issueQuickActions(): AgentSuggestedAction[] {
  return [
    { label: "Problema con compra o saldo", message: "Problema con compra o saldo" },
    { label: "Problema con envío SMS", message: "Problema con envío SMS" },
    { label: "Problema con DLR / reportes", message: "Problema con DLR / reportes" },
    { label: "Problema con API", message: "Problema con API" },
    { label: "Otro problema", message: "Otro problema" },
    { label: "Cancelar", message: "Cancelar" },
  ];
}

function reviewQuickActions(): AgentSuggestedAction[] {
  return [
    { label: "Crear ticket", message: "Crear ticket", variant: "primary" },
    { label: "Editar mensaje", message: "Editar mensaje" },
    { label: "Cambiar categoría", message: "Cambiar categoría" },
    { label: "Cancelar", message: "Cancelar" },
  ];
}

function categoryQuickActions(): AgentSuggestedAction[] {
  const cats: AgentSuggestedAction[] = SUPPORT_CATEGORIES.map((c) => ({
    label: c,
    message: c,
  }));
  cats.push({ label: "Cancelar", message: "Cancelar" });
  return cats;
}

function completedQuickActions(ticketCode: string): AgentSuggestedAction[] {
  return [
    {
      label: "Ver ticket",
      href: `/app/support?ticket=${encodeURIComponent(ticketCode)}`,
      variant: "primary",
    },
    { label: "Crear otro ticket", message: "ticket" },
    { label: "Volver al inicio", message: "hola" },
  ];
}

function baseResponse(
  partial: Partial<AgentCoreResponse> & { sessionId: string; reply: string },
): AgentCoreResponse {
  return {
    suggestedActions: [],
    quote: null,
    requiresConfirmation: false,
    leadRequired: false,
    safeToExecute: true,
    confidence: 0.92,
    intent: FLOW_INTENT,
    showFeedback: false,
    showAttachButton: false,
    agentMode: "support",
    ...partial,
  };
}

export function isSupportTicketFlowActive(memory: ConversationMemory): boolean {
  const step = memory.supportTicketFlowStep;
  return Boolean(
    step &&
      step !== SUPPORT_TICKET_FLOW_STEP.COMPLETED &&
      step !== SUPPORT_TICKET_FLOW_STEP.CANCELLED,
  );
}

export async function clearSupportTicketFlowMemory(
  sessionId: string,
  channel: AgentExecutionContext["channel"],
  companyId: string,
): Promise<void> {
  await updateConversationMemory(
    sessionId,
    channel,
    {
      supportTicketFlowStep: undefined,
      pendingSupportTicketSubject: undefined,
      pendingSupportTicketCategory: undefined,
      pendingSupportTicketPriority: undefined,
      pendingSupportTicketMessage: undefined,
      pendingSupportTicketSource: undefined,
      pendingSupportTicketContext: undefined,
    },
    companyId,
  );
}

export async function suspendOperationalFlowsForTicket(
  sessionId: string,
  channel: AgentExecutionContext["channel"],
  companyId: string,
): Promise<void> {
  await cancelAllPendingForSessionDb(sessionId, companyId);
  await clearSendSmsFlowMemory(sessionId, channel, companyId);
  await updateConversationMemory(
    sessionId,
    channel,
    {
      purchaseFlowStep: undefined,
      pendingPurchaseQuantity: undefined,
      pendingPurchaseQuote: undefined,
      pendingPurchaseOrderId: undefined,
      pendingPaymentUrl: undefined,
      blockedSendDueToBalance: undefined,
    },
    companyId,
  );
}

function buildTicketContext(
  ctx: AgentExecutionContext,
  memory: ConversationMemory,
): Record<string, unknown> {
  const meta = ctx.metadata ?? {};
  return {
    sessionId: ctx.sessionId,
    companyId: ctx.companyId,
    userId: ctx.userId,
    currentPage: meta.page ?? meta.currentPath ?? null,
    currentUrl: meta.currentUrl ?? null,
    pageTitle: meta.pageTitle ?? null,
    lastAgentIntent: memory.lastIntent ?? null,
    lastFlowStep: memory.sendSmsFlowStep ?? memory.purchaseFlowStep ?? null,
  };
}

function isCategoryOnlyMessage(message: string): boolean {
  return mapQuickActionToCategory(message) != null && message.trim().length < 48;
}

async function prepareReviewFromMessage(input: {
  message: string;
  memory: ConversationMemory;
  sessionId: string;
  channel: AgentExecutionContext["channel"];
  companyId: string;
  ctx: AgentExecutionContext;
}): Promise<AgentCoreResponse> {
  const quickCat = mapQuickActionToCategory(input.message);
  const category =
    (input.memory.pendingSupportTicketCategory as SupportTicketCategory | undefined) ??
    quickCat ??
    inferSupportTicketCategory(input.message);
  const priority = inferSupportTicketPriority(input.message);
  const subject = inferSupportTicketSubject(input.message, category);
  const msgBody = input.message.trim();

  await updateConversationMemory(
    input.sessionId,
    input.channel,
    {
      supportTicketFlowStep: SUPPORT_TICKET_FLOW_STEP.REVIEW_TICKET,
      pendingSupportTicketSubject: subject,
      pendingSupportTicketCategory: category,
      pendingSupportTicketPriority: priority,
      pendingSupportTicketMessage: msgBody,
      pendingSupportTicketSource: "agent_chat",
      pendingSupportTicketContext: buildTicketContext(input.ctx, input.memory),
    },
    input.companyId,
  );

  return baseResponse({
    reply: buildSupportTicketReviewReply({
      subject,
      category,
      priority,
      message: msgBody,
    }),
    sessionId: input.sessionId,
    requiresConfirmation: true,
    suggestedActions: reviewQuickActions(),
    sendSmsFlowStep: undefined,
  });
}

export async function startSupportTicketFlow(input: {
  ctx: AgentExecutionContext;
  sessionId: string;
  route: RoutedIntent;
}): Promise<AgentCoreResponse> {
  await suspendOperationalFlowsForTicket(
    input.sessionId,
    input.ctx.channel,
    input.ctx.companyId,
  );
  await updateConversationMemory(
    input.sessionId,
    input.ctx.channel,
    {
      supportTicketFlowStep: SUPPORT_TICKET_FLOW_STEP.NEED_ISSUE,
      pendingSupportTicketSource: "agent_chat",
      pendingSupportTicketContext: buildTicketContext(
        input.ctx,
        await getConversationMemory(input.sessionId, input.ctx.channel),
      ),
    },
    input.ctx.companyId,
  );

  return baseResponse({
    reply: INTRO_REPLY,
    confidence: input.route.confidence,
    sessionId: input.sessionId,
    suggestedActions: issueQuickActions(),
  });
}

async function createTicketFromPending(input: {
  ctx: AgentExecutionContext;
  sessionId: string;
  memory: ConversationMemory;
}): Promise<AgentCoreResponse> {
  const subject = input.memory.pendingSupportTicketSubject?.trim();
  const message = input.memory.pendingSupportTicketMessage?.trim();
  const category = input.memory.pendingSupportTicketCategory as
    | SupportTicketCategory
    | undefined;
  const priority = (input.memory.pendingSupportTicketPriority ??
    "medium") as SupportTicketPriority;

  if (!subject || !message || !category) {
    return baseResponse({
      reply: "Falta información del ticket. Cuéntame qué necesitas revisar.",
      sessionId: input.sessionId,
      suggestedActions: issueQuickActions(),
    });
  }

  const now = Date.now();
  if (
    input.memory.lastCreatedSupportTicketCode &&
    input.memory.lastCreatedSupportTicketMessage === message &&
    typeof input.memory.lastCreatedSupportTicketAt === "number" &&
    now - input.memory.lastCreatedSupportTicketAt < 60_000
  ) {
    const code = input.memory.lastCreatedSupportTicketCode;
    return baseResponse({
      reply:
        `Listo. Creé tu ticket ${code}. El equipo Telvoice lo revisará desde soporte.\n\n` +
        "Puedes verlo en Mis tickets.",
      sessionId: input.sessionId,
      suggestedActions: completedQuickActions(code),
    });
  }

  const created = await createSupportTicketForCompany({
    companyId: input.ctx.companyId,
    userId: input.ctx.userId,
    subject,
    category,
    priority,
    message,
    metadata: {
      ...(input.memory.pendingSupportTicketContext ?? {}),
      agent_session_id: input.sessionId,
    },
  });

  if (!created.ok) {
    return baseResponse({
      reply: `No pude crear el ticket: ${created.error}. Intenta de nuevo o usa /app/support.`,
      sessionId: input.sessionId,
      safeToExecute: false,
      suggestedActions: [{ label: "Ir a soporte", href: "/app/support" }],
    });
  }

  const code = created.ticket.code;
  await updateConversationMemory(
    input.sessionId,
    input.ctx.channel,
    {
      supportTicketFlowStep: SUPPORT_TICKET_FLOW_STEP.COMPLETED,
      lastCreatedSupportTicketCode: code,
      lastCreatedSupportTicketMessage: message,
      lastCreatedSupportTicketAt: now,
      pendingSupportTicketSubject: undefined,
      pendingSupportTicketCategory: undefined,
      pendingSupportTicketPriority: undefined,
      pendingSupportTicketMessage: undefined,
    },
    input.ctx.companyId,
  );

  return baseResponse({
    reply:
      `Listo. Creé tu ticket ${code}. El equipo Telvoice lo revisará desde soporte.\n\n` +
      "Puedes verlo en Mis tickets.",
    sessionId: input.sessionId,
    suggestedActions: completedQuickActions(code),
  });
}

export async function handleSupportTicketFlow(
  _route: RoutedIntent,
  message: string,
  ctx: AgentExecutionContext,
  sessionId: string,
): Promise<AgentCoreResponse> {
  if (ctx.channel !== "web_client" || !ctx.companyId) {
    return baseResponse({
      reply: "Para crear tickets de soporte ingresa al panel cliente en /app/support.",
      sessionId,
      suggestedActions: [{ label: "Soporte", href: "/app/support" }],
    });
  }

  let memory = await getConversationMemory(sessionId, ctx.channel);
  const trimmed = message.trim();

  if (isFlowExitCommand(trimmed) || trimmed.toLowerCase() === "cancelar") {
    await clearSupportTicketFlowMemory(sessionId, ctx.channel, ctx.companyId);
    return baseResponse({
      reply: "Listo, cancelé la creación del ticket.",
      sessionId,
      intent: "cancel",
      suggestedActions: [],
      closeWidget: false,
    });
  }

  const step = memory.supportTicketFlowStep;

  if (step === SUPPORT_TICKET_FLOW_STEP.REVIEW_TICKET) {
    if (isSupportTicketConfirm(trimmed)) {
      return createTicketFromPending({ ctx, sessionId, memory });
    }
    if (isSupportTicketEditMessage(trimmed)) {
      await updateConversationMemory(
        sessionId,
        ctx.channel,
        {
          supportTicketFlowStep: SUPPORT_TICKET_FLOW_STEP.NEED_ISSUE,
          pendingSupportTicketMessage: undefined,
          pendingSupportTicketSubject: undefined,
        },
        ctx.companyId,
      );
      return baseResponse({
        reply: "Perfecto. Escribe el mensaje corregido para el ticket.",
        sessionId,
        suggestedActions: [{ label: "Cancelar", message: "Cancelar" }],
      });
    }
    if (isSupportTicketChangeCategory(trimmed)) {
      await updateConversationMemory(
        sessionId,
        ctx.channel,
        { supportTicketFlowStep: SUPPORT_TICKET_FLOW_STEP.NEED_CATEGORY_OPTIONAL },
        ctx.companyId,
      );
      return baseResponse({
        reply: "Elige la categoría del ticket:",
        sessionId,
        suggestedActions: categoryQuickActions(),
      });
    }
    const subject = memory.pendingSupportTicketSubject?.trim();
    const msgBody = memory.pendingSupportTicketMessage?.trim();
    const category = memory.pendingSupportTicketCategory as SupportTicketCategory | undefined;
    const priority = (memory.pendingSupportTicketPriority ?? "medium") as SupportTicketPriority;
    if (subject && msgBody && category) {
      return baseResponse({
        reply: buildSupportTicketReviewReply({ subject, category, priority, message: msgBody }),
        sessionId,
        requiresConfirmation: true,
        suggestedActions: reviewQuickActions(),
      });
    }
  }

  if (step === SUPPORT_TICKET_FLOW_STEP.NEED_CATEGORY_OPTIONAL) {
    const cat = SUPPORT_CATEGORIES.find(
      (c) => c.toLowerCase() === trimmed.toLowerCase(),
    ) as SupportTicketCategory | undefined;
    if (cat) {
      memory = await updateConversationMemory(
        sessionId,
        ctx.channel,
        { pendingSupportTicketCategory: cat },
        ctx.companyId,
      );
      if (memory.pendingSupportTicketMessage) {
        return prepareReviewFromMessage({
          message: memory.pendingSupportTicketMessage,
          memory: { ...memory, pendingSupportTicketCategory: cat },
          sessionId,
          channel: ctx.channel,
          companyId: ctx.companyId,
          ctx,
        });
      }
      return baseResponse({
        reply: "Perfecto. Ahora cuéntame qué ocurre con más detalle.",
        sessionId,
        suggestedActions: [{ label: "Cancelar", message: "Cancelar" }],
      });
    }
  }

  if (
    step === SUPPORT_TICKET_FLOW_STEP.NEED_ISSUE ||
    step === SUPPORT_TICKET_FLOW_STEP.NEED_CATEGORY_OPTIONAL ||
    !step
  ) {
    const quickCat = mapQuickActionToCategory(trimmed);
    if (quickCat && isCategoryOnlyMessage(trimmed)) {
      await updateConversationMemory(
        sessionId,
        ctx.channel,
        {
          supportTicketFlowStep: SUPPORT_TICKET_FLOW_STEP.NEED_ISSUE,
          pendingSupportTicketCategory: quickCat,
        },
        ctx.companyId,
      );
      return baseResponse({
        reply: "Perfecto. Cuéntame con más detalle qué ocurre.",
        sessionId,
        suggestedActions: [{ label: "Cancelar", message: "Cancelar" }],
      });
    }

    if (trimmed.length >= 4) {
      return prepareReviewFromMessage({
        message: trimmed,
        memory,
        sessionId,
        channel: ctx.channel,
        companyId: ctx.companyId,
        ctx,
      });
    }

    return baseResponse({
      reply: INTRO_REPLY,
      sessionId,
      suggestedActions: issueQuickActions(),
    });
  }

  return baseResponse({
    reply: INTRO_REPLY,
    sessionId,
    suggestedActions: issueQuickActions(),
  });
}

export async function tryActiveSupportTicketFlowFirst(
  message: string,
  ctx: AgentExecutionContext,
  sessionId: string,
  memory: ConversationMemory,
): Promise<AgentCoreResponse | null> {
  if (ctx.channel !== "web_client" || !ctx.companyId) {
    return null;
  }

  const route: RoutedIntent = {
    intent: "support_ticket",
    confidence: 0.95,
    commercialQuantity: null,
    requiresAuth: true,
    operationalCommand: null,
  };

  if (isSupportTicketFlowActive(memory)) {
    return handleSupportTicketFlow(route, message, ctx, sessionId);
  }

  if (isSupportTicketIntent(message)) {
    return startSupportTicketFlow({ ctx, sessionId, route });
  }

  return null;
}
