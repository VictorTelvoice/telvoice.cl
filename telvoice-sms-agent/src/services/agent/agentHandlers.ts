import {
  toolContactListStats,
  toolCreateCampaignDraft,
  toolDlrHelp,
  toolEstimateCampaignCost,
} from "./clientAgentTools.js";
import { buildSendSmsPendingPayload } from "./executePendingAction.js";
import {
  createPendingActionDb,
} from "./agentPendingActionsService.js";
import {
  getCampaignSummaryTool,
  getClientBalanceTool,
  getRecentMessagesTool,
  optimizeSmsCopyTool,
  quoteSmsBundleTool,
  analyzeSmsTextTool,
  searchKnowledgeForChannel,
} from "./tools/index.js";
import type {
  AgentCoreResponse,
  AgentExecutionContext,
  AgentSuggestedAction,
} from "./types.js";
import type { AgentToolContext } from "./tools/types.js";
import type { RoutedIntent } from "./agentIntentRouter.js";

function toolCtx(ctx: AgentExecutionContext): AgentToolContext {
  return {
    channel: ctx.channel,
    companyId: ctx.companyId,
    userId: ctx.userId,
    sessionId: ctx.sessionId,
  };
}

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

function extractMessageBody(text: string): string {
  const optimiza = text.match(
    /optimiza(?:r)?\s+(?:este\s+)?(?:mensaje|texto)?[:\s]+(.+)/i,
  );
  if (optimiza?.[1]) {
    return optimiza[1].trim();
  }
  const m = text.match(/mensaje[:\s]+(.+)/i);
  return m?.[1]?.trim() ?? text;
}

function extractPhone(text: string): string | null {
  const m = text.match(/(\+?56\s?9[\d\s]{8,}|9\d{8})/);
  if (!m?.[1]) {
    return null;
  }
  const raw = m[1].replace(/\s/g, "");
  if (raw.startsWith("+")) {
    return raw;
  }
  if (raw.startsWith("569")) {
    return `+${raw}`;
  }
  return `+56${raw}`;
}

export async function dispatchRoutedIntent(
  route: RoutedIntent,
  message: string,
  ctx: AgentExecutionContext,
  sessionId: string,
): Promise<AgentCoreResponse> {
  const intent = route.intent;

  switch (intent) {
    case "commercial":
    case "quote_purchase": {
      const q = await quoteSmsBundleTool.run(toolCtx(ctx), {
        quantity: route.commercialQuantity ?? undefined,
        text: message,
      });
      const actions: AgentSuggestedAction[] =
        ctx.channel === "landing"
          ? [{ label: "Ver calculadora", href: "https://www.telvoice.cl/#calculadora" }]
          : [{ label: "Comprar SMS", href: "/app/buy-sms" }];
      return baseResponse({
        reply: q.summary,
        intent: "commercial",
        confidence: route.confidence,
        suggestedActions: actions,
        quote: q.data ?? null,
        sessionId,
      });
    }

    case "balance": {
      const r = await getClientBalanceTool.run(toolCtx(ctx));
      return baseResponse({
        reply: r.summary,
        intent,
        confidence: route.confidence,
        sessionId,
        suggestedActions: [{ label: "Comprar SMS", href: "/app/buy-sms" }],
      });
    }

    case "recent_messages": {
      const r = await getRecentMessagesTool.run(toolCtx(ctx), { limit: 5 });
      return baseResponse({
        reply: r.summary,
        intent,
        confidence: route.confidence,
        sessionId,
        suggestedActions: [{ label: "Bandeja", href: "/app/inbox" }],
      });
    }

    case "recent_campaigns": {
      const r = await getCampaignSummaryTool.run(toolCtx(ctx), { limit: 5 });
      return baseResponse({
        reply: r.summary,
        intent,
        confidence: route.confidence,
        sessionId,
        suggestedActions: [{ label: "Campañas", href: "/app/campaigns" }],
      });
    }

    case "dlr_help":
      return baseResponse({
        reply: toolDlrHelp(),
        intent,
        confidence: route.confidence,
        sessionId,
      });

    case "segments": {
      const r = await analyzeSmsTextTool.run(toolCtx(ctx), {
        text: extractMessageBody(message),
      });
      return baseResponse({
        reply: r.summary,
        intent,
        confidence: route.confidence,
        sessionId,
      });
    }

    case "copy_help":
    case "strategy": {
      const body = extractMessageBody(message);
      const r = await optimizeSmsCopyTool.run(toolCtx(ctx), { text: body });
      return baseResponse({
        reply: r.summary,
        intent: "copy_help",
        confidence: route.confidence,
        sessionId,
      });
    }

    case "campaign_cost":
      return baseResponse({
        reply: await toolEstimateCampaignCost(ctx.companyId, message),
        intent,
        confidence: route.confidence,
        sessionId,
      });

    case "contact_list":
      return baseResponse({
        reply: await toolContactListStats(ctx.companyId, message),
        intent,
        confidence: route.confidence,
        sessionId,
      });

    case "campaign_draft": {
      const draftMessage =
        message.replace(/crear campaña|nueva campaña|borrador/gi, "").trim() ||
        "Mensaje de campaña Telvoice";
      const result = await toolCreateCampaignDraft({
        companyId: ctx.companyId,
        userId: ctx.userId,
        name: `Campaña ${new Date().toISOString().slice(0, 10)}`,
        message: draftMessage,
      });
      return baseResponse({
        reply: result.reply,
        intent,
        confidence: route.confidence,
        sessionId,
        suggestedActions: [
          { label: "Abrir borrador", href: `/app/campaigns/${result.campaignId}` },
        ],
      });
    }

    case "send_sms": {
      const phone = extractPhone(message);
      const body = message.replace(/enviar|mandar|sms/gi, "").trim();
      if (!phone || body.length < 2) {
        return baseResponse({
          reply:
            "Indica número (+569…) y mensaje. Ejemplo: envía a +56912345678: Tu código es 1234",
          intent,
          confidence: 0.5,
          sessionId,
          safeToExecute: false,
        });
      }
      const payload = buildSendSmsPendingPayload({ to: phone, message: body });
      const pending = await createPendingActionDb({
        type: "send_single_sms",
        summary: `Enviar 1 SMS a ${payload.to} (${payload.costSms} SMS)`,
        payload,
        context: ctx,
      });
      return baseResponse({
        reply:
          `Resumen:\n• Destino: ${payload.to}\n• Costo: ${payload.costSms} SMS\n\n` +
          `Responde **Confirmo** para continuar o **Cancelar**.`,
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

    case "reports":
      return baseResponse({
        reply: "Revisa métricas y consumo en /app/reports y el dashboard en /app/dashboard.",
        intent,
        confidence: route.confidence,
        sessionId,
        suggestedActions: [{ label: "Reportes", href: "/app/reports" }],
      });

    case "invoices":
      return baseResponse({
        reply: "Tus facturas están en /app/invoices.",
        intent,
        confidence: route.confidence,
        sessionId,
        suggestedActions: [{ label: "Facturas", href: "/app/invoices" }],
      });

    case "wallet":
      return baseResponse({
        reply: "Movimientos de saldo en /app/wallet.",
        intent,
        confidence: route.confidence,
        sessionId,
        suggestedActions: [{ label: "Mi saldo", href: "/app/wallet" }],
      });

    case "register":
      return baseResponse({
        reply:
          "Regístrate en https://portal.telvoice.net/ o déjanos tus datos y un ejecutivo te contactará.",
        intent,
        confidence: route.confidence,
        sessionId,
        suggestedActions: [
          { label: "Portal cliente", href: "https://portal.telvoice.net/" },
        ],
      });

    case "lead_capture":
      return baseResponse({
        reply:
          "Para ayudarte con una bolsa a medida, cuéntame: nombre, empresa, email, WhatsApp y cuántos SMS necesitas.",
        intent,
        confidence: route.confidence,
        leadRequired: true,
        sessionId,
      });

    case "capabilities":
      return baseResponse({
        reply:
          "Puedo ayudarte con cotización de bolsas SMS, saldo, campañas, DLR, segmentos, reportes y uso del panel Telvoice.",
        intent,
        confidence: route.confidence,
        sessionId,
      });

    case "greeting":
      return baseResponse({
        reply:
          "Hola, soy el asistente **telvoice**. ¿Saldo, campañas, cotización, DLR o compra de SMS?",
        intent,
        confidence: route.confidence,
        sessionId,
      });

    case "knowledge": {
      const k = await searchKnowledgeForChannel(message, ctx.channel);
      return baseResponse({
        reply: k.reply,
        intent: "knowledge",
        confidence: k.confidence,
        sessionId,
      });
    }

    default:
      return baseResponse({
        reply: "",
        intent: "unknown",
        confidence: route.confidence,
        sessionId,
        safeToExecute: false,
      });
  }
}
