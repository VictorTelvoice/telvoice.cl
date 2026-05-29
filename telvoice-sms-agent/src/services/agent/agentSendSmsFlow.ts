import { AppError } from "../../utils/errors.js";
import { findCompanyById } from "../companyService.js";
import {
  calculateSmsSegments,
  validateRecipientNumber,
} from "../smsSegmentService.js";
import { getCompanyBalance } from "../smsWalletService.js";
import { resolveRouteForMessage } from "../smsRoutingService.js";
import {
  buildSendSmsPendingPayload,
} from "./executePendingAction.js";
import { createPendingActionDb } from "./agentPendingActionsService.js";
import {
  extractPhoneFromText,
  parseFollowUpSmsBody,
  parseSendSmsDraft,
} from "./agentSendSmsIntent.js";
import {
  getConversationMemory,
  updateConversationMemory,
} from "./agentConversationMemory.js";
import type { AgentCoreResponse, AgentExecutionContext } from "./types.js";
import type { RoutedIntent } from "./agentIntentRouter.js";
import type { ConversationMemory } from "./agentConversationMemory.js";

function baseResponse(
  partial: Omit<AgentCoreResponse, "sessionId"> & { sessionId: string },
): AgentCoreResponse {
  return {
    suggestedActions: [],
    quote: null,
    requiresConfirmation: false,
    leadRequired: false,
    safeToExecute: true,
    ...partial,
  };
}

function formatPhoneDisplay(normalized: string): string {
  const d = normalized.replace(/\D/g, "");
  if (d.startsWith("56")) {
    return d;
  }
  return d;
}

async function resolveCompanySenderId(companyId: string): Promise<string> {
  const resolved = await resolveRouteForMessage({
    companyId,
    country: "CL",
    phone: "+56900000000",
    trafficType: "transactional",
  });
  return resolved.provider.default_sender_id || "TELVOICE";
}

async function mergeDraftFromMemory(
  message: string,
  sessionId: string,
  channel: AgentExecutionContext["channel"],
  companyId: string,
  memory: ConversationMemory,
): Promise<{ phone: string | null; message: string | null; memory: ConversationMemory }> {
  const draft = parseSendSmsDraft(message);
  let phone = draft.phone ?? memory.pendingSmsPhone ?? null;
  let msgBody = draft.message ?? memory.pendingSmsMessage ?? null;

  if (!phone) {
    const onlyPhone = extractPhoneFromText(message);
    if (onlyPhone) {
      phone = onlyPhone;
    }
  }

  if (!msgBody) {
    const followUp = parseFollowUpSmsBody(message);
    if (followUp) {
      msgBody = followUp;
    }
  }

  const nextMemory = await updateConversationMemory(
    sessionId,
    channel,
    {
      pendingSmsPhone: phone ?? memory.pendingSmsPhone,
      pendingSmsMessage: msgBody ?? memory.pendingSmsMessage,
    },
    companyId,
  );

  return { phone: phone ?? nextMemory.pendingSmsPhone ?? null, message: msgBody ?? nextMemory.pendingSmsMessage ?? null, memory: nextMemory };
}

async function clearSmsDraftMemory(
  sessionId: string,
  channel: AgentExecutionContext["channel"],
  companyId: string,
): Promise<void> {
  await updateConversationMemory(
    sessionId,
    channel,
    { pendingSmsPhone: undefined, pendingSmsMessage: undefined },
    companyId,
  );
}

export async function handleSendSmsFlow(
  route: RoutedIntent,
  message: string,
  ctx: AgentExecutionContext,
  sessionId: string,
): Promise<AgentCoreResponse> {
  const intent = route.intent;

  if (ctx.channel === "landing") {
    return baseResponse({
      reply:
        "Para enviar SMS necesitas una cuenta Telvoice activa. Regístrate o inicia sesión en el portal cliente; desde /app puedes enviar mensajes con confirmación usando el agente del panel.",
      intent,
      confidence: 0.92,
      sessionId,
      suggestedActions: [
        { label: "Iniciar sesión", href: "https://agent.telvoice.cl/app/login" },
        { label: "Calculadora", href: "https://www.telvoice.cl/#calculadora" },
      ],
    });
  }

  if (ctx.channel === "admin") {
    return baseResponse({
      reply:
        "Desde el panel de administración no envío SMS reales. Usa el panel cliente (/app) con tu cuenta de empresa.",
      intent,
      confidence: route.confidence,
      sessionId,
    });
  }

  if (!ctx.companyId) {
    throw new AppError("Sesión de empresa requerida para enviar SMS.", 403);
  }

  const memory = await getConversationMemory(sessionId, ctx.channel);
  const { phone, message: msgBody } = await mergeDraftFromMemory(
    message,
    sessionId,
    ctx.channel,
    ctx.companyId,
    memory,
  );

  const company = await findCompanyById(ctx.companyId);
  const companyLabel = company?.name?.trim() || "tu cuenta";

  if (!phone && !msgBody) {
    return baseResponse({
      reply:
        "Perfecto, puedo ayudarte a enviar un SMS desde tu cuenta Telvoice.\n\n" +
        "Necesito dos datos:\n\n" +
        "1. Número de destino en formato internacional, por ejemplo 569XXXXXXXX.\n" +
        "2. Mensaje que quieres enviar.",
      intent,
      confidence: route.confidence,
      sessionId,
      safeToExecute: false,
    });
  }

  if (phone && !msgBody) {
    return baseResponse({
      reply: `Perfecto. Tengo el número ${formatPhoneDisplay(phone)}. ¿Qué mensaje quieres enviar?`,
      intent,
      confidence: route.confidence,
      sessionId,
      safeToExecute: false,
    });
  }

  if (!phone && msgBody) {
    return baseResponse({
      reply:
        "Perfecto. ¿A qué número quieres enviarlo? Usa formato internacional, por ejemplo 569XXXXXXXX.",
      intent,
      confidence: route.confidence,
      sessionId,
      safeToExecute: false,
    });
  }

  const validated = validateRecipientNumber(phone!);
  if (!validated.ok || !validated.normalized) {
    return baseResponse({
      reply: validated.error ?? "Número inválido. Usa formato 569XXXXXXXX.",
      intent,
      confidence: 0.7,
      sessionId,
      safeToExecute: false,
    });
  }

  const segmentInfo = calculateSmsSegments(msgBody!);
  const balance = await getCompanyBalance(ctx.companyId);
  if (balance.availableSms < segmentInfo.costSms) {
    await clearSmsDraftMemory(sessionId, ctx.channel, ctx.companyId);
    return baseResponse({
      reply:
        "No tienes saldo suficiente para este envío. Puedo ayudarte a comprar más SMS.",
      intent,
      confidence: route.confidence,
      sessionId,
      suggestedActions: [{ label: "Comprar SMS", href: "/app/buy-sms" }],
      safeToExecute: false,
    });
  }

  const senderId = await resolveCompanySenderId(ctx.companyId);
  const displayPhone = formatPhoneDisplay(validated.normalized);
  const payload = buildSendSmsPendingPayload({
    to: validated.normalized,
    message: msgBody!,
    senderId,
    segments: segmentInfo.segments,
    estimatedCost: segmentInfo.costSms,
    companyId: ctx.companyId,
    companyLabel,
  });

  const pending = await createPendingActionDb({
    type: "send_single_sms",
    summary: `SMS a ${displayPhone} (${segmentInfo.costSms} SMS)`,
    payload,
    context: ctx,
  });

  await clearSmsDraftMemory(sessionId, ctx.channel, ctx.companyId);

  return baseResponse({
    reply:
      `Preparé este SMS:\n\n` +
      `Destino: ${displayPhone}\n` +
      `Remitente: ${companyLabel} (${senderId})\n` +
      `Mensaje: ${msgBody}\n` +
      `Segmentos estimados: ${segmentInfo.segments}\n` +
      `Costo estimado: ${segmentInfo.costSms} SMS\n\n` +
      `Para enviarlo, responde: Confirmo.`,
    intent,
    confidence: route.confidence,
    requiresConfirmation: true,
    pendingActionId: pending.id,
    safeToExecute: false,
    sessionId,
    suggestedActions: [
      { label: "Confirmo", message: "Confirmo" },
      { label: "Cancelar", message: "Cancelar" },
    ],
  });
}
