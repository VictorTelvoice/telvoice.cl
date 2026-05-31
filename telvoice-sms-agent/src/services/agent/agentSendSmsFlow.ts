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
import { getAgentCsvUpload } from "./agentCsvUploadStore.js";
import { displayPhoneChile } from "./agentPanelCsvService.js";
import {
  extractPhoneFromText,
  isMessageRequestedByAgent,
  isSendSmsIntentOnly,
  matchesCsvDestChoice,
  matchesSendSmsFlowIntent,
  parseFollowUpSmsBody,
  parseSendSmsDraft,
  sanitizePendingSmsMessage,
} from "./agentSendSmsIntent.js";
import {
  getConversationMemory,
  updateConversationMemory,
} from "./agentConversationMemory.js";
import type { AgentCoreResponse, AgentExecutionContext, AgentSuggestedAction } from "./types.js";
import type { RoutedIntent } from "./agentIntentRouter.js";
import type { ConversationMemory } from "./agentConversationMemory.js";

const FLOW_INTENT = "send_sms_flow";

function baseResponse(
  partial: Partial<AgentCoreResponse> & { sessionId: string; reply: string },
): AgentCoreResponse {
  return {
    suggestedActions: [],
    quote: null,
    requiresConfirmation: false,
    leadRequired: false,
    safeToExecute: true,
    confidence: 0.9,
    intent: FLOW_INTENT,
    ...partial,
  };
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

function destChoiceActions(): AgentSuggestedAction[] {
  return [
    { label: "Enviar a un número", message: "Enviar a un número" },
    { label: "Adjuntar CSV", message: "Adjuntar CSV" },
    { label: "Cancelar", message: "Cancelar" },
  ];
}

const ASK_MESSAGE_REPLY =
  "Claro que sí, puedo ayudarte a preparar el envío desde tu cuenta Telvoice.\n\n" +
  "Primero dime qué mensaje quieres enviar.";

function cancelOnlyActions(): AgentSuggestedAction[] {
  return [{ label: "Cancelar", message: "Cancelar" }];
}

async function replyAskMessageFirst(input: {
  sessionId: string;
  channel: AgentExecutionContext["channel"];
  companyId: string;
  confidence: number;
}): Promise<AgentCoreResponse> {
  await setFlowMemory(input.sessionId, input.channel, input.companyId, {
    sendSmsFlowStep: "need_message",
    waitingForMessage: true,
    waitingForRecipient: false,
    waitingForCsv: false,
    pendingSmsMessage: undefined,
    pendingSmsPhone: undefined,
    pendingCsvUploadId: undefined,
    sendSmsDestMode: undefined,
  });
  return baseResponse({
    reply: ASK_MESSAGE_REPLY,
    confidence: input.confidence,
    sessionId: input.sessionId,
    safeToExecute: false,
    suggestedActions: cancelOnlyActions(),
  });
}

function insufficientBalanceActions(): AgentSuggestedAction[] {
  return [
    { label: "Comprar más SMS", href: "/app/buy-sms" },
    { label: "Adjuntar otra lista", message: "Adjuntar CSV" },
    { label: "Cancelar", message: "Cancelar" },
  ];
}

async function setFlowMemory(
  sessionId: string,
  channel: AgentExecutionContext["channel"],
  companyId: string,
  patch: Partial<ConversationMemory>,
): Promise<ConversationMemory> {
  return updateConversationMemory(
    sessionId,
    channel,
    { sendSmsFlowActive: true, ...patch },
    companyId,
  );
}

export async function clearSendSmsFlowMemory(
  sessionId: string,
  channel: AgentExecutionContext["channel"],
  companyId: string,
): Promise<void> {
  await updateConversationMemory(
    sessionId,
    channel,
    {
      sendSmsFlowActive: undefined,
      sendSmsFlowStep: undefined,
      sendSmsDestMode: undefined,
      waitingForMessage: undefined,
      waitingForRecipient: undefined,
      waitingForCsv: undefined,
      pendingSmsPhone: undefined,
      pendingSmsMessage: undefined,
      pendingCsvUploadId: undefined,
    },
    companyId,
  );
}

async function buildSingleSummaryResponse(input: {
  ctx: AgentExecutionContext;
  sessionId: string;
  phone: string;
  message: string;
  companyLabel: string;
  senderId: string;
  route: RoutedIntent;
}): Promise<AgentCoreResponse> {
  const validated = validateRecipientNumber(input.phone);
  if (!validated.ok || !validated.normalized) {
    return baseResponse({
      reply: validated.error ?? "Número inválido. Usa formato 569XXXXXXXX.",
      confidence: 0.7,
      sessionId: input.sessionId,
      safeToExecute: false,
      suggestedActions: destChoiceActions(),
    });
  }

  const segmentInfo = calculateSmsSegments(input.message);
  const balance = await getCompanyBalance(input.ctx.companyId);
  const displayPhone = displayPhoneChile(validated.normalized.replace(/\D/g, ""));

  if (balance.availableSms < segmentInfo.costSms) {
    await clearSendSmsFlowMemory(input.sessionId, input.ctx.channel, input.ctx.companyId);
    const missing = segmentInfo.costSms - balance.availableSms;
    return baseResponse({
      reply:
        `No tienes saldo suficiente para este envío.\n\n` +
        `Crédito requerido: ${segmentInfo.costSms} SMS\n` +
        `Crédito disponible: ${balance.availableSms.toLocaleString("es-CL")} SMS\n` +
        `Faltan: ${missing.toLocaleString("es-CL")} SMS\n\n` +
        `Puedo ayudarte a comprar más SMS o reducir destinatarios.`,
      confidence: input.route.confidence,
      sessionId: input.sessionId,
      safeToExecute: false,
      suggestedActions: insufficientBalanceActions(),
    });
  }

  const payload = buildSendSmsPendingPayload({
    to: validated.normalized,
    message: input.message,
    senderId: input.senderId,
    segments: segmentInfo.segments,
    estimatedCost: segmentInfo.costSms,
    companyId: input.ctx.companyId,
    companyLabel: input.companyLabel,
  });
  (payload as Record<string, unknown>).balance_before = balance.availableSms;

  const pending = await createPendingActionDb({
    type: "send_single_sms",
    summary: `SMS individual a ${displayPhone}`,
    payload,
    context: input.ctx,
  });

  await clearSendSmsFlowMemory(input.sessionId, input.ctx.channel, input.ctx.companyId);

  return baseResponse({
    reply:
      `Preparé este envío:\n\n` +
      `Tipo: SMS individual\n` +
      `Destino: ${displayPhone}\n` +
      `Remitente: ${input.companyLabel} (${input.senderId})\n` +
      `Mensaje: ${input.message}\n` +
      `Segmentos estimados: ${segmentInfo.segments}\n` +
      `Crédito requerido: ${segmentInfo.costSms} SMS\n` +
      `Crédito disponible: ${balance.availableSms.toLocaleString("es-CL")} SMS\n\n` +
      `Para enviarlo, responde: Confirmo.`,
    confidence: input.route.confidence,
    requiresConfirmation: true,
    pendingActionId: pending.id,
    safeToExecute: false,
    sessionId: input.sessionId,
    suggestedActions: [
      { label: "Confirmo", message: "Confirmo" },
      { label: "Cancelar", message: "Cancelar" },
      { label: "Ver bandeja", href: "/app/inbox" },
    ],
  });
}

async function buildCsvSummaryResponse(input: {
  ctx: AgentExecutionContext;
  sessionId: string;
  message: string;
  uploadId: string;
  companyLabel: string;
  senderId: string;
  route: RoutedIntent;
}): Promise<AgentCoreResponse> {
  const upload = getAgentCsvUpload(input.uploadId, input.ctx.companyId);
  if (!upload) {
    return baseResponse({
      reply:
        "No encontré la planilla adjunta (puede haber expirado). Adjunta el CSV de nuevo.",
      confidence: 0.7,
      sessionId: input.sessionId,
      safeToExecute: false,
      suggestedActions: [
        { label: "Adjuntar CSV", message: "Adjuntar CSV" },
        { label: "Cancelar", message: "Cancelar" },
      ],
    });
  }

  const parsed = upload.parsed;
  const count = parsed.validRecipients.length;
  if (!count) {
    return baseResponse({
      reply:
        `No hay contactos válidos en la planilla.\n\n` +
        (parsed.mainErrors.length
          ? parsed.mainErrors.join("\n")
          : `Inválidos: ${parsed.invalidCount} · Duplicados omitidos: ${parsed.duplicateCount}`) +
        `\n\nSube otra lista o envía a un solo número.`,
      confidence: 0.75,
      sessionId: input.sessionId,
      safeToExecute: false,
      suggestedActions: destChoiceActions(),
    });
  }

  const segmentInfo = calculateSmsSegments(input.message);
  const totalSms = count * segmentInfo.costSms;
  const balance = await getCompanyBalance(input.ctx.companyId);
  const after = balance.availableSms - totalSms;

  if (balance.availableSms < totalSms) {
    await clearSendSmsFlowMemory(input.sessionId, input.ctx.channel, input.ctx.companyId);
    const missing = totalSms - balance.availableSms;
    return baseResponse({
      reply:
        `No tienes saldo suficiente para este envío.\n\n` +
        `Crédito requerido: ${totalSms.toLocaleString("es-CL")} SMS\n` +
        `Crédito disponible: ${balance.availableSms.toLocaleString("es-CL")} SMS\n` +
        `Faltan: ${missing.toLocaleString("es-CL")} SMS\n\n` +
        `Puedo ayudarte a comprar más SMS o reducir la lista de contactos.`,
      confidence: input.route.confidence,
      sessionId: input.sessionId,
      safeToExecute: false,
      suggestedActions: insufficientBalanceActions(),
    });
  }

  const campaignName = `Agente ${new Date().toISOString().slice(0, 10)}`;
  const payload = {
    channel: "web_client",
    company_id: input.ctx.companyId,
    user_id: input.ctx.userId,
    campaign_name: campaignName,
    message: input.message,
    sender_id: input.senderId,
    valid_recipients: parsed.validRecipients,
    invalid_count: parsed.invalidCount,
    duplicate_count: parsed.duplicateCount,
    contacts_count: count,
    segments_per_contact: segmentInfo.segments,
    estimated_total_sms: totalSms,
    balance_before: balance.availableSms,
    balance_after_estimated: after,
    csv_upload_id: input.uploadId,
    company_label: input.companyLabel,
  };

  const pending = await createPendingActionDb({
    type: "send_campaign_csv",
    summary: `Campaña CSV ${count} contactos (${totalSms} SMS)`,
    payload,
    context: input.ctx,
  });

  await clearSendSmsFlowMemory(input.sessionId, input.ctx.channel, input.ctx.companyId);

  const preview =
    parsed.previewValid.length > 0
      ? `\nVista previa: ${parsed.previewValid.join(", ")}${count > 5 ? "…" : ""}`
      : "";

  return baseResponse({
    reply:
      `Revisé tu planilla.\n\n` +
      `Contactos válidos: ${count.toLocaleString("es-CL")}\n` +
      `Contactos inválidos: ${parsed.invalidCount.toLocaleString("es-CL")}\n` +
      `Duplicados omitidos: ${parsed.duplicateCount.toLocaleString("es-CL")}\n` +
      `Mensaje: ${input.message}\n` +
      `Segmentos por contacto: ${segmentInfo.segments}\n` +
      `Crédito requerido: ${totalSms.toLocaleString("es-CL")} SMS\n` +
      `Crédito disponible: ${balance.availableSms.toLocaleString("es-CL")} SMS\n` +
      `Saldo estimado después del envío: ${after.toLocaleString("es-CL")} SMS` +
      preview +
      `\n\n¿Confirmas el envío de esta campaña?\n\nResponde: Confirmo\no escribe: Cancelar.`,
    confidence: input.route.confidence,
    requiresConfirmation: true,
    pendingActionId: pending.id,
    safeToExecute: false,
    sessionId: input.sessionId,
    suggestedActions: [
      { label: "Confirmo", message: "Confirmo" },
      { label: "Cancelar", message: "Cancelar" },
      { label: "Ver campañas", href: "/app/campaigns" },
      { label: "Comprar más SMS", href: "/app/buy-sms" },
    ],
  });
}

export async function handleSendSmsFlow(
  route: RoutedIntent,
  message: string,
  ctx: AgentExecutionContext,
  sessionId: string,
  metadata?: Record<string, unknown>,
): Promise<AgentCoreResponse> {
  if (ctx.channel === "landing") {
    return baseResponse({
      reply:
        "Para enviar SMS necesitas una cuenta Telvoice activa. Regístrate o inicia sesión en el portal cliente; desde /app el agente te guía con mensaje, destino o CSV y confirmación.",
      intent: "register",
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
        "Desde administración no envío SMS reales. Usa el panel cliente (/app) con tu cuenta de empresa.",
      confidence: route.confidence,
      sessionId,
    });
  }

  if (!ctx.companyId) {
    throw new AppError("Sesión de empresa requerida para enviar SMS.", 403);
  }

  const company = await findCompanyById(ctx.companyId);
  const companyLabel = company?.name?.trim() || "tu cuenta";
  const senderId = await resolveCompanySenderId(ctx.companyId);
  let memory = await getConversationMemory(sessionId, ctx.channel);

  if (ctx.channel === "telegram") {
    const tgDraft = parseSendSmsDraft(message);
    let tgMsg =
      tgDraft.message ?? sanitizePendingSmsMessage(memory.pendingSmsMessage) ?? null;
    const tgPhone =
      tgDraft.phone ?? memory.pendingSmsPhone ?? extractPhoneFromText(message);
    if (!tgMsg && tgPhone) {
      const rest = message
        .replace(new RegExp(tgPhone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "")
        .replace(/\b(enviar|envía|envia|mandar|manda)\b/gi, "")
        .trim();
      if (rest.length >= 2 && !isSendSmsIntentOnly(rest)) {
        tgMsg = rest;
      }
    }
    if (!tgMsg || !tgPhone) {
      return baseResponse({
        reply:
          "Para enviar por Telegram usa: enviar 569XXXXXXXX tu mensaje. Luego responde Confirmo.",
        confidence: route.confidence,
        sessionId,
        safeToExecute: false,
      });
    }
    return buildSingleSummaryResponse({
      ctx,
      sessionId,
      phone: tgPhone,
      message: tgMsg,
      companyLabel,
      senderId,
      route,
    });
  }

  memory = {
    ...memory,
    pendingSmsMessage:
      sanitizePendingSmsMessage(memory.pendingSmsMessage) ?? undefined,
  };

  if (isSendSmsIntentOnly(message)) {
    return replyAskMessageFirst({
      sessionId,
      channel: ctx.channel,
      companyId: ctx.companyId,
      confidence: route.confidence,
    });
  }

  const draft = parseSendSmsDraft(message);
  let msgBody =
    draft.message ?? sanitizePendingSmsMessage(memory.pendingSmsMessage) ?? null;
  let phone = draft.phone ?? memory.pendingSmsPhone ?? null;
  const csvUploadId =
    (typeof metadata?.csvUploadId === "string" ? metadata.csvUploadId : null) ??
    memory.pendingCsvUploadId ??
    null;

  if (!msgBody && isMessageRequestedByAgent(memory)) {
    const followUp = parseFollowUpSmsBody(message, { waitingForMessage: true });
    if (followUp) {
      msgBody = followUp;
    }
  }

  if (!phone) {
    const onlyPhone = extractPhoneFromText(message);
    if (onlyPhone) {
      phone = onlyPhone;
    }
  }

  if (csvUploadId && msgBody) {
    memory = await setFlowMemory(sessionId, ctx.channel, ctx.companyId, {
      pendingSmsMessage: msgBody,
      pendingCsvUploadId: csvUploadId,
      sendSmsDestMode: "csv",
      sendSmsFlowStep: "confirm_ready",
      waitingForMessage: false,
      waitingForRecipient: false,
      waitingForCsv: false,
    });
    return buildCsvSummaryResponse({
      ctx,
      sessionId,
      message: msgBody,
      uploadId: csvUploadId,
      companyLabel,
      senderId,
      route,
    });
  }

  if (!msgBody && !phone && !csvUploadId && matchesSendSmsFlowIntent(message)) {
    return replyAskMessageFirst({
      sessionId,
      channel: ctx.channel,
      companyId: ctx.companyId,
      confidence: route.confidence,
    });
  }

  if (msgBody && !phone && !csvUploadId) {
    if (matchesCsvDestChoice(message)) {
      await setFlowMemory(sessionId, ctx.channel, ctx.companyId, {
        pendingSmsMessage: msgBody,
        sendSmsFlowStep: "need_csv_file",
        sendSmsDestMode: "csv",
        waitingForMessage: false,
        waitingForRecipient: false,
        waitingForCsv: true,
      });
      return baseResponse({
        reply:
          "Perfecto. Adjunta una planilla CSV con una columna de números de teléfono.\n\n" +
          "Puedes usar una columna llamada:\n" +
          "telefono, phone, numero, número, destinatario o mobile.\n\n" +
          "Cuando la subas, revisaré los contactos válidos, calcularé el consumo y te mostraré el resumen antes de enviar.",
        confidence: route.confidence,
        sessionId,
        safeToExecute: false,
        suggestedActions: [
          { label: "Adjuntar CSV", message: "__attach_csv__" },
          { label: "Enviar a un número", message: "Enviar a un número" },
          { label: "Cancelar", message: "Cancelar" },
        ],
      });
    }

    await setFlowMemory(sessionId, ctx.channel, ctx.companyId, {
      pendingSmsMessage: msgBody,
      sendSmsFlowStep: "need_dest",
      waitingForMessage: false,
      waitingForRecipient: true,
      waitingForCsv: false,
    });
    return baseResponse({
      reply:
        "Perfecto, ya tengo el mensaje.\n\n" +
        "Ahora dime a quién quieres enviarlo.\n\n" +
        "Puedes:\n\n" +
        "1. Escribir un número en formato internacional, por ejemplo 569XXXXXXXX.\n" +
        "2. Adjuntar una planilla CSV con los números de teléfono.",
      confidence: route.confidence,
      sessionId,
      safeToExecute: false,
      suggestedActions: destChoiceActions(),
    });
  }

  if (msgBody && phone) {
    return buildSingleSummaryResponse({
      ctx,
      sessionId,
      phone,
      message: msgBody,
      companyLabel,
      senderId,
      route,
    });
  }

  if (msgBody && csvUploadId) {
    return buildCsvSummaryResponse({
      ctx,
      sessionId,
      message: msgBody,
      uploadId: csvUploadId,
      companyLabel,
      senderId,
      route,
    });
  }

  if (!msgBody && phone) {
    await setFlowMemory(sessionId, ctx.channel, ctx.companyId, {
      pendingSmsPhone: phone,
      sendSmsFlowStep: "need_message",
      waitingForMessage: true,
      waitingForRecipient: false,
    });
    return baseResponse({
      reply: `Tengo el número ${displayPhoneChile(phone)}. Primero dime qué mensaje quieres enviar.`,
      confidence: route.confidence,
      sessionId,
      safeToExecute: false,
      suggestedActions: cancelOnlyActions(),
    });
  }

  return replyAskMessageFirst({
    sessionId,
    channel: ctx.channel,
    companyId: ctx.companyId,
    confidence: route.confidence,
  });
}
