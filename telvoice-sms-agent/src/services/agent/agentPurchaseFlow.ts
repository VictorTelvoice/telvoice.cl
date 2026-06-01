import { AppError } from "../../utils/errors.js";
import { formatClp } from "../../utils/clp-format.js";
import type { CommercialQuoteResult } from "../../types/commercial.js";
import {
  calculateTelvoiceQuote,
  isManualQuoteRequired,
  recommendBagQuantityForShortfall,
} from "../telvoicePricingService.js";
import {
  extractCommercialQuantity,
  matchesCommercialBuyIntentNormalized,
} from "./agentCommercialText.js";
import { extractSmsQuantityFromText } from "../commercialQuoteService.js";
import {
  createSmsPurchaseOrderForCompany,
  formatPaymentLinkLine,
} from "./agentSmsPurchaseService.js";
import { saveLandingLead } from "./agentLeadCapture.js";
import { getCompanyBalance } from "../smsWalletService.js";
import {
  updateConversationMemory,
  type ConversationMemory,
} from "./agentConversationMemory.js";
import { clearSendSmsFlowMemory } from "./agentSendSmsFlow.js";
import type { AgentCoreResponse, AgentExecutionContext, AgentSuggestedAction } from "./types.js";
import type { RoutedIntent } from "./agentIntentRouter.js";
import { findCompanyById } from "../companyService.js";
import { routeAgentIntent } from "./agentIntentRouter.js";
import { matchesSendSmsFlowIntent } from "./agentSendSmsIntent.js";

export const PURCHASE_FLOW_STEP = {
  NEED_QUANTITY: "need_quantity",
  REVIEW_QUOTE: "review_quote",
  PAYMENT_READY: "payment_ready",
  MANUAL_QUOTE_REQUIRED: "manual_quote_required",
  INSUFFICIENT_SEND: "insufficient_send",
} as const;

export type BlockedSendDueToBalance = {
  kind: "single" | "csv";
  requiredSms: number;
  availableSms: number;
  shortfall: number;
  suggestedPurchaseQty: number;
  message: string;
  phone?: string;
  csvUploadId?: string;
  senderId?: string;
};

const PAYMENT_LINK_RE =
  /\b(generar link de pago|generar enlace|link de pago|enlace de pago|pagar ahora|abrir pago|pagar con mercadopago|mercadopago)\b/i;

const MANUAL_QUOTE_RE =
  /\b(solicitar cotizacion|solicitar cotización|cotizacion comercial|cotización comercial|hablar con ejecutivo|ejecutivo|registrar solicitud)\b/i;

const CANCEL_PURCHASE_RE =
  /\b(cancelar compra|cancelar campaña|cancelar campana|no comprar|cancelar)\b/i;

const REVIEW_CAMPAIGN_RE =
  /\b(revisar campaña|revisar campana|continuar campaña|continuar campana|revisar envio|revisar envío)\b/i;

const CHOOSE_BAG_RE =
  /\b(elegir otra bolsa|cambiar cantidad|otra bolsa|otra cantidad)\b/i;

function basePurchaseResponse(
  partial: Partial<AgentCoreResponse> & { sessionId: string; reply: string },
): AgentCoreResponse {
  return {
    suggestedActions: [],
    quote: null,
    requiresConfirmation: false,
    leadRequired: false,
    safeToExecute: true,
    confidence: 0.92,
    intent: "quote_purchase",
    showAttachButton: false,
    ...partial,
  };
}

export function detectPurchaseIntent(
  message: string,
  memory: ConversationMemory,
): boolean {
  if (memory.purchaseFlowStep) {
    return true;
  }
  if (memory.blockedSendDueToBalance) {
    return true;
  }
  if (PAYMENT_LINK_RE.test(message) && memory.pendingPurchaseQuote) {
    return true;
  }
  if (matchesCommercialBuyIntentNormalized(message)) {
    if (matchesSendSmsFlowIntent(message) && !/\b(comprar|recargar|saldo|bolsa)\b/i.test(message)) {
      return false;
    }
    return true;
  }
  return false;
}

function catalogExamplesLine(): string {
  return (
    `Ejemplos:\n\n` +
    `• 1.000 SMS desde $11.900 total con IVA\n` +
    `• 30.000 SMS: $249.900 total con IVA\n` +
    `• 70.000 SMS: $499.800 total con IVA\n` +
    `• 100.000 SMS: $595.000 total con IVA`
  );
}

function formatQuoteBlock(quote: CommercialQuoteResult): string {
  const roundedNote =
    quote.was_rounded && quote.requested_quantity !== quote.quoted_quantity
      ? `\n(Cantidad solicitada: ${quote.requested_quantity.toLocaleString("es-CL")} SMS → cotizada ${quote.quoted_quantity.toLocaleString("es-CL")} SMS)\n`
      : "";

  return (
    `Cotización:\n` +
    `${quote.quoted_quantity.toLocaleString("es-CL")} SMS${roundedNote}\n` +
    `Precio unitario neto: $${quote.unit_price}\n` +
    `Valor neto: ${formatClp(quote.subtotal)}\n` +
    `IVA: ${formatClp(quote.iva)}\n` +
    `Total: ${formatClp(quote.total_with_iva)} CLP`
  );
}

function quoteReviewActions(): AgentSuggestedAction[] {
  return [
    { label: "Generar link de pago", message: "Generar link de pago", variant: "primary" },
    { label: "Cambiar cantidad", message: "Cambiar cantidad" },
    { label: "Cancelar", message: "Cancelar compra" },
  ];
}

function paymentReadyActions(checkoutUrl: string): AgentSuggestedAction[] {
  return [
    { label: "Pagar con MercadoPago", href: checkoutUrl, variant: "primary" },
    { label: "Ver mis órdenes", href: "/app/orders" },
    { label: "Cambiar cantidad", message: "Cambiar cantidad" },
  ];
}

function insufficientSendActions(): AgentSuggestedAction[] {
  return [
    { label: "Generar link de pago", message: "Generar link de pago", variant: "primary" },
    { label: "Elegir otra bolsa", message: "Elegir otra bolsa" },
    { label: "Cancelar campaña", message: "Cancelar campaña" },
  ];
}

function needQuantityActions(): AgentSuggestedAction[] {
  return [
    { label: "1.000 SMS", message: "Quiero comprar 1000 SMS" },
    { label: "30.000 SMS", message: "Quiero comprar 30000 SMS" },
    { label: "70.000 SMS", message: "Quiero comprar 70000 SMS" },
    { label: "100.000 SMS", message: "Quiero comprar 100000 SMS" },
  ];
}

export async function buildManualQuoteResponse(input: {
  quantity: number;
  sessionId: string;
  ctx: AgentExecutionContext;
}): Promise<AgentCoreResponse> {
  const quote = await calculateTelvoiceQuote(input.quantity);
  await updateConversationMemory(
    input.sessionId,
    input.ctx.channel,
    {
      purchaseFlowStep: PURCHASE_FLOW_STEP.MANUAL_QUOTE_REQUIRED,
      pendingPurchaseQuantity: input.quantity,
      pendingPurchaseQuote: quote,
      lastQuote: quote,
      lastQuantity: quote.quoted_quantity,
    },
    input.ctx.companyId,
  );

  return basePurchaseResponse({
    sessionId: input.sessionId,
    reply:
      `Para ${quote.requested_quantity.toLocaleString("es-CL")} SMS aplicamos cotización comercial sobre $5 + IVA por SMS.\n\n` +
      `Estimación:\n` +
      `${quote.quoted_quantity.toLocaleString("es-CL")} SMS\n` +
      `Precio unitario neto: $5\n` +
      `Valor neto: ${formatClp(quote.subtotal)}\n` +
      `IVA: ${formatClp(quote.iva)}\n` +
      `Total estimado: ${formatClp(quote.total_with_iva)} CLP\n\n` +
      `Para compras sobre 120.000 SMS, un ejecutivo Telvoice debe confirmar disponibilidad y condiciones de ruta.\n\n` +
      `¿Quieres que deje esta solicitud registrada?`,
    quote,
    suggestedActions: [
      { label: "Solicitar cotización", message: "Solicitar cotización comercial", variant: "primary" },
      { label: "Hablar con ejecutivo", href: "/app/support" },
      { label: "Cambiar cantidad", message: "Cambiar cantidad" },
    ],
  });
}

export async function buildPurchaseQuoteResponse(input: {
  quantity: number;
  sessionId: string;
  ctx: AgentExecutionContext;
  intro?: string;
  afterBalanceHint?: string;
}): Promise<AgentCoreResponse> {
  if (isManualQuoteRequired(input.quantity)) {
    return buildManualQuoteResponse({
      quantity: input.quantity,
      sessionId: input.sessionId,
      ctx: input.ctx,
    });
  }

  const quote = await calculateTelvoiceQuote(input.quantity);
  const balance = await getCompanyBalance(input.ctx.companyId);
  const afterPurchase = balance.availableSms + quote.quoted_quantity;

  await updateConversationMemory(
    input.sessionId,
    input.ctx.channel,
    {
      purchaseFlowStep: PURCHASE_FLOW_STEP.REVIEW_QUOTE,
      pendingPurchaseQuantity: quote.quoted_quantity,
      pendingPurchaseQuote: quote,
      pendingPurchaseOrderId: undefined,
      pendingPaymentUrl: undefined,
      lastQuote: quote,
      lastQuantity: quote.quoted_quantity,
    },
    input.ctx.companyId,
  );

  const intro =
    input.intro ??
    `Perfecto. Te cotizo ${quote.quoted_quantity.toLocaleString("es-CL")} SMS para Chile.\n\n`;

  const afterHint =
    input.afterBalanceHint ??
    `\n\nDespués de la compra quedarías con aproximadamente ${afterPurchase.toLocaleString("es-CL")} SMS disponibles.\n\n¿Quieres que genere el link de pago por MercadoPago?`;

  return basePurchaseResponse({
    sessionId: input.sessionId,
    reply:
      intro +
      `Precio unitario neto: $${quote.unit_price}\n` +
      `Valor neto: ${formatClp(quote.subtotal)}\n` +
      `IVA: ${formatClp(quote.iva)}\n` +
      `Total a pagar: ${formatClp(quote.total_with_iva)} CLP` +
      afterHint,
    quote,
    suggestedActions: quoteReviewActions(),
  });
}

export async function handleInsufficientBalanceOffer(input: {
  ctx: AgentExecutionContext;
  sessionId: string;
  route: RoutedIntent;
  kind: "single" | "csv";
  requiredSms: number;
  availableSms: number;
  message: string;
  phone?: string;
  csvUploadId?: string;
  senderId?: string;
  campaignLabel?: string;
}): Promise<AgentCoreResponse> {
  const shortfall = Math.max(0, input.requiredSms - input.availableSms);
  const suggestedQty = recommendBagQuantityForShortfall(shortfall);
  const quote = await calculateTelvoiceQuote(suggestedQty);
  const afterPurchase = input.availableSms + quote.quoted_quantity;

  const blocked: BlockedSendDueToBalance = {
    kind: input.kind,
    requiredSms: input.requiredSms,
    availableSms: input.availableSms,
    shortfall,
    suggestedPurchaseQty: quote.quoted_quantity,
    message: input.message,
    phone: input.phone,
    csvUploadId: input.csvUploadId,
    senderId: input.senderId,
  };

  await updateConversationMemory(
    input.sessionId,
    input.ctx.channel,
    {
      purchaseFlowStep: PURCHASE_FLOW_STEP.INSUFFICIENT_SEND,
      blockedSendDueToBalance: blocked,
      pendingPurchaseQuantity: quote.quoted_quantity,
      pendingPurchaseQuote: quote,
      lastQuote: quote,
      sendSmsFlowActive: undefined,
      sendSmsFlowStep: undefined,
      pendingCsvUploadId: input.csvUploadId,
      pendingSmsMessage: input.message,
    },
    input.ctx.companyId,
  );

  const sendLabel =
    input.kind === "csv"
      ? `Tu campaña necesita ${input.requiredSms.toLocaleString("es-CL")} SMS y actualmente tienes ${input.availableSms.toLocaleString("es-CL")} SMS disponibles.`
      : `Este envío necesita ${input.requiredSms.toLocaleString("es-CL")} SMS y actualmente tienes ${input.availableSms.toLocaleString("es-CL")} SMS disponibles.`;

  return basePurchaseResponse({
    sessionId: input.sessionId,
    reply:
      `${sendLabel}\n\n` +
      `Te faltan ${shortfall.toLocaleString("es-CL")} SMS para completar el envío. Como las bolsas se compran en múltiplos de 1.000, te recomiendo comprar una bolsa de ${quote.quoted_quantity.toLocaleString("es-CL")} SMS.\n\n` +
      `${formatQuoteBlock(quote)}\n\n` +
      `Después de la compra quedarías con aproximadamente ${afterPurchase.toLocaleString("es-CL")} SMS disponibles.\n\n` +
      `Te faltan ${shortfall.toLocaleString("es-CL")} SMS. La bolsa mínima recomendada es ${quote.quoted_quantity.toLocaleString("es-CL")} SMS, pero puedes elegir una mayor.\n\n` +
      `¿Quieres que genere el link de pago?`,
    quote,
    safeToExecute: false,
    requiresConfirmation: false,
    suggestedActions: insufficientSendActions(),
    showAttachButton: false,
  });
}

async function buildPaymentLinkResponse(
  ctx: AgentExecutionContext,
  sessionId: string,
  memory: ConversationMemory,
): Promise<AgentCoreResponse> {
  const qty =
    memory.pendingPurchaseQuantity ??
    memory.pendingPurchaseQuote?.quoted_quantity ??
    memory.lastQuantity;
  if (!qty) {
    return basePurchaseResponse({
      sessionId,
      reply: "Primero indica cuántos SMS quieres comprar (múltiplos de 1.000).",
      suggestedActions: needQuantityActions(),
    });
  }

  if (isManualQuoteRequired(qty)) {
    return buildManualQuoteResponse({ quantity: qty, sessionId, ctx });
  }

  try {
    const purchase = await createSmsPurchaseOrderForCompany({
      ctx,
      quantity: qty,
      existingOrderId: memory.pendingPurchaseOrderId,
      blockedSend: memory.blockedSendDueToBalance as Record<string, unknown> | undefined,
    });

    await updateConversationMemory(
      sessionId,
      ctx.channel,
      {
        purchaseFlowStep: PURCHASE_FLOW_STEP.PAYMENT_READY,
        pendingPurchaseOrderId: purchase.orderId,
        pendingPaymentUrl: purchase.checkoutUrl,
        pendingPurchaseQuote: purchase.quote,
        lastQuote: purchase.quote,
      },
      ctx.companyId,
    );

    const reuseNote = purchase.reusedExistingOrder
      ? "\n(Reutilicé el link de pago pendiente de esta cotización.)\n"
      : "";

    return basePurchaseResponse({
      sessionId,
      reply:
        `Listo. Preparé tu compra de ${purchase.quote.quoted_quantity.toLocaleString("es-CL")} SMS.\n\n` +
        `Total: ${formatClp(purchase.quote.total_with_iva)} CLP con IVA incluido.\n` +
        `${reuseNote}\n` +
        `${formatPaymentLinkLine(purchase.checkoutUrl)}\n\n` +
        `Cuando el pago sea aprobado, tus SMS se cargarán automáticamente en tu saldo.`,
      quote: purchase.quote,
      orderId: purchase.orderId,
      paymentUrl: purchase.checkoutUrl,
      showPaymentButton: true,
      suggestedActions: paymentReadyActions(purchase.checkoutUrl),
    });
  } catch (err) {
    const msg =
      err instanceof AppError
        ? err.message
        : "No pude preparar el pago en este momento. Intenta desde Comprar SMS en el panel.";
    return basePurchaseResponse({
      sessionId,
      reply: msg,
      safeToExecute: false,
    });
  }
}

async function tryResumeBlockedSend(
  ctx: AgentExecutionContext,
  sessionId: string,
  memory: ConversationMemory,
  route: RoutedIntent,
): Promise<AgentCoreResponse | null> {
  const blocked = memory.blockedSendDueToBalance;
  if (!blocked) {
    return null;
  }

  const balance = await getCompanyBalance(ctx.companyId);
  if (balance.availableSms < blocked.requiredSms) {
    return null;
  }

  const company = await findCompanyById(ctx.companyId);
  const companyLabel = company?.name ?? "tu empresa";
  const senderId = blocked.senderId ?? "TELVOICE";

  await updateConversationMemory(
    sessionId,
    ctx.channel,
    {
      blockedSendDueToBalance: undefined,
      purchaseFlowStep: undefined,
    },
    ctx.companyId,
  );

  if (blocked.kind === "csv" && blocked.csvUploadId) {
    const { buildCsvSummaryResponse } = await import("./agentSendSmsFlow.js");
    return buildCsvSummaryResponse({
      ctx,
      sessionId,
      message: blocked.message,
      uploadId: blocked.csvUploadId,
      companyLabel,
      senderId,
      route,
    });
  }

  if (blocked.kind === "single" && blocked.phone) {
    const { buildSingleSummaryResponse } = await import("./agentSendSmsFlow.js");
    return buildSingleSummaryResponse({
      ctx,
      sessionId,
      phone: blocked.phone,
      message: blocked.message,
      companyLabel,
      senderId,
      route,
    });
  }

  return basePurchaseResponse({
    sessionId,
    reply:
      "Ya tienes saldo suficiente para continuar. ¿Quieres revisar nuevamente la campaña antes de enviarla?",
    suggestedActions: [
      { label: "Crear nueva campaña", message: "Quiero enviar una campaña" },
      { label: "Ver saldo", message: "¿Cuánto saldo tengo?" },
      { label: "Comprar más SMS", message: "Quiero comprar SMS" },
    ],
  });
}

export async function handleBuySmsFlow(input: {
  message: string;
  ctx: AgentExecutionContext;
  sessionId: string;
  memory: ConversationMemory;
  route: RoutedIntent;
}): Promise<AgentCoreResponse | null> {
  const { message, ctx, sessionId, memory, route } = input;
  const trimmed = message.trim();

  if (CANCEL_PURCHASE_RE.test(trimmed) && memory.purchaseFlowStep) {
    await updateConversationMemory(
      sessionId,
      ctx.channel,
      {
        purchaseFlowStep: undefined,
        pendingPurchaseQuantity: undefined,
        pendingPurchaseQuote: undefined,
        pendingPurchaseOrderId: undefined,
        pendingPaymentUrl: undefined,
        blockedSendDueToBalance: undefined,
        pendingSmsMessage: undefined,
        pendingCsvUploadId: undefined,
      },
      ctx.companyId,
    );
    await clearSendSmsFlowMemory(sessionId, ctx.channel, ctx.companyId);
    return basePurchaseResponse({
      sessionId,
      reply: "Listo, cancelé la compra. Si quieres enviar SMS o cotizar otra bolsa, dime.",
      suggestedActions: [
        { label: "Enviar SMS", message: "Quiero enviar un SMS" },
        { label: "Ver saldo", message: "¿Cuánto saldo tengo?" },
      ],
    });
  }

  if (REVIEW_CAMPAIGN_RE.test(trimmed)) {
    const resumed = await tryResumeBlockedSend(ctx, sessionId, memory, route);
    if (resumed) {
      return resumed;
    }
  }

  if (CHOOSE_BAG_RE.test(trimmed)) {
    await updateConversationMemory(
      sessionId,
      ctx.channel,
      {
        purchaseFlowStep: PURCHASE_FLOW_STEP.NEED_QUANTITY,
        pendingPurchaseOrderId: undefined,
        pendingPaymentUrl: undefined,
      },
      ctx.companyId,
    );
    return basePurchaseResponse({
      sessionId,
      reply:
        `Claro, te ayudo a comprar saldo SMS.\n\n` +
        `Las bolsas se venden en múltiplos de 1.000 SMS. Puedes comprar desde 1.000 hasta 120.000 SMS online.\n\n` +
        `${catalogExamplesLine()}\n\n` +
        `¿Cuántos SMS quieres comprar?`,
      suggestedActions: needQuantityActions(),
    });
  }

  if (
    PAYMENT_LINK_RE.test(trimmed) &&
    (memory.purchaseFlowStep === PURCHASE_FLOW_STEP.REVIEW_QUOTE ||
      memory.purchaseFlowStep === PURCHASE_FLOW_STEP.INSUFFICIENT_SEND ||
      memory.pendingPurchaseQuote)
  ) {
    return buildPaymentLinkResponse(ctx, sessionId, memory);
  }

  if (
    memory.purchaseFlowStep === PURCHASE_FLOW_STEP.PAYMENT_READY &&
    memory.pendingPaymentUrl
  ) {
    return basePurchaseResponse({
      sessionId,
      reply:
        `Tu link de pago sigue activo.\n\n${formatPaymentLinkLine(memory.pendingPaymentUrl)}\n\nCuando se apruebe el pago, el saldo se acreditará automáticamente.`,
      quote: memory.pendingPurchaseQuote ?? null,
      orderId: memory.pendingPurchaseOrderId,
      paymentUrl: memory.pendingPaymentUrl,
      showPaymentButton: true,
      suggestedActions: paymentReadyActions(memory.pendingPaymentUrl),
    });
  }

  if (
    MANUAL_QUOTE_RE.test(trimmed) &&
    memory.purchaseFlowStep === PURCHASE_FLOW_STEP.MANUAL_QUOTE_REQUIRED
  ) {
    const qty = memory.pendingPurchaseQuantity ?? memory.lastQuantity ?? 150_000;
    const quote = memory.pendingPurchaseQuote ?? (await calculateTelvoiceQuote(qty));
    await saveLandingLead({
      fields: { requested_quantity: qty, use_case: "Cotización agente panel >120k SMS" },
      sessionId,
      quote,
      lastMessage: trimmed,
    });
    await updateConversationMemory(
      sessionId,
      ctx.channel,
      { purchaseFlowStep: undefined },
      ctx.companyId,
    );
    return basePurchaseResponse({
      sessionId,
      reply:
        `Registré tu solicitud de cotización por ${qty.toLocaleString("es-CL")} SMS. Un ejecutivo Telvoice te contactará para confirmar condiciones.\n\n` +
        `Mientras tanto puedes escribirnos por Soporte en el panel.`,
      suggestedActions: [
        { label: "Ir a Soporte", href: "/app/support", variant: "primary" },
        { label: "Cambiar cantidad", message: "Cambiar cantidad" },
      ],
    });
  }

  const qtyFromText =
    extractCommercialQuantity(trimmed) ??
    extractSmsQuantityFromText(trimmed) ??
    (/^(\d[\d\s.]*)$/.test(trimmed)
      ? parseInt(trimmed.replace(/[\s.]/g, ""), 10)
      : null);

  if (qtyFromText && Number.isFinite(qtyFromText) && qtyFromText > 0) {
    return buildPurchaseQuoteResponse({
      quantity: qtyFromText,
      sessionId,
      ctx,
    });
  }

  if (
    memory.purchaseFlowStep === PURCHASE_FLOW_STEP.NEED_QUANTITY ||
    (detectPurchaseIntent(trimmed, memory) && !qtyFromText)
  ) {
    await updateConversationMemory(
      sessionId,
      ctx.channel,
      { purchaseFlowStep: PURCHASE_FLOW_STEP.NEED_QUANTITY },
      ctx.companyId,
    );
    return basePurchaseResponse({
      sessionId,
      reply:
        `Claro, te ayudo a comprar saldo SMS.\n\n` +
        `Las bolsas se venden en múltiplos de 1.000 SMS. Puedes comprar desde 1.000 hasta 120.000 SMS online.\n\n` +
        `${catalogExamplesLine()}\n\n` +
        `¿Cuántos SMS quieres comprar?`,
      suggestedActions: needQuantityActions(),
    });
  }

  return null;
}

/** Flujo activo de compra (prioridad sobre knowledge; no sobre envío activo). */
export async function tryActivePurchaseFlowFirst(
  message: string,
  ctx: AgentExecutionContext,
  sessionId: string,
  memory: ConversationMemory,
): Promise<AgentCoreResponse | null> {
  if (ctx.channel !== "web_client" || !ctx.companyId) {
    return null;
  }

  const route = routeAgentIntent(message, ctx.channel, { memory });

  if (!memory.purchaseFlowStep && !memory.blockedSendDueToBalance && !detectPurchaseIntent(message, memory)) {
    return null;
  }

  return handleBuySmsFlow({
    message,
    ctx,
    sessionId,
    memory,
    route,
  });
}
