import {
  toolContactListStats,
  toolCreateCampaignDraft,
  toolDlrHelp,
  toolEstimateCampaignCost,
} from "./clientAgentTools.js";
import { handleSendSmsFlow } from "./agentSendSmsFlow.js";
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
import {
  AGENT_COMMERCIAL_ASK_QUANTITY_MESSAGE,
  extractCommercialQuantity,
} from "./agentCommercialText.js";
import type { CommercialQuoteResult } from "../../types/commercial.js";
import { buildTechnicalDoubtReply } from "./agentTechnicalReplies.js";

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

function buildCommercialSuggestedActions(
  channel: AgentExecutionContext["channel"],
  quote: CommercialQuoteResult | null | undefined,
): AgentSuggestedAction[] {
  const actions: AgentSuggestedAction[] = [];
  if (quote?.checkout_url) {
    actions.push({ label: "Pagar ahora", href: quote.checkout_url });
  }
  if (channel === "landing") {
    actions.push({
      label: "Ver calculadora",
      href: "https://www.telvoice.cl/#calculadora",
    });
    if (!quote?.checkout_url) {
      actions.push({
        label: "Dejar mis datos",
        message: "Quiero comprar SMS, soy de mi empresa",
      });
    }
  } else if (channel === "web_client") {
    actions.push({ label: "Comprar SMS", href: "/app/buy-sms" });
  } else if (channel === "telegram") {
    actions.push({ label: "Cotizar 30.000 SMS", message: "cotizar 30000 sms" });
  }
  return actions;
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
      const qty =
        route.commercialQuantity ?? extractCommercialQuantity(message) ?? undefined;
      if (!qty) {
        return baseResponse({
          reply: AGENT_COMMERCIAL_ASK_QUANTITY_MESSAGE,
          intent: "commercial",
          confidence: route.confidence,
          suggestedActions: [
            { label: "5.000 SMS", message: "cotizar 5000 sms" },
            { label: "30.000 SMS", message: "cotizar 30000 sms" },
            { label: "100.000 SMS", message: "cotizar 100000 sms" },
          ],
          leadRequired: ctx.channel === "landing",
          sessionId,
        });
      }
      const q = await quoteSmsBundleTool.run(toolCtx(ctx), {
        quantity: qty,
        text: message,
      });
      if (!q.ok && q.error === "quantity_required") {
        return baseResponse({
          reply: AGENT_COMMERCIAL_ASK_QUANTITY_MESSAGE,
          intent: "commercial",
          confidence: route.confidence,
          leadRequired: ctx.channel === "landing",
          sessionId,
        });
      }
      return baseResponse({
        reply: q.summary,
        intent: "commercial",
        confidence: route.confidence,
        suggestedActions: buildCommercialSuggestedActions(ctx.channel, q.data),
        quote: q.data ?? null,
        sessionId,
        leadRequired: ctx.channel === "landing" && !q.data?.checkout_url,
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

    case "dlr_help": {
      let reply = toolDlrHelp();
      if (ctx.channel === "web_client" && ctx.companyId) {
        const recent = await getRecentMessagesTool.run(toolCtx(ctx), { limit: 3 });
        reply = `${reply}\n\n${recent.summary}`;
      }
      return baseResponse({
        reply,
        intent,
        confidence: route.confidence,
        sessionId,
        suggestedActions: [{ label: "Bandeja", href: "/app/inbox" }],
      });
    }

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

    case "send_sms":
      return handleSendSmsFlow(route, message, ctx, sessionId);

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
        reply: "",
        intent,
        confidence: route.confidence,
        sessionId,
      });

    case "confusion":
    case "frustration":
      return baseResponse({
        reply: "",
        intent,
        confidence: route.confidence,
        sessionId,
      });

    case "human_contact":
      return baseResponse({
        reply:
          "Puedo derivarte al equipo comercial. Déjame nombre, empresa y email o WhatsApp, o escríbenos por el formulario en telvoice.cl.",
        intent,
        confidence: route.confidence,
        leadRequired: ctx.channel === "landing",
        sessionId,
      });

    case "payment":
      return baseResponse({
        reply:
          ctx.channel === "landing"
            ? "Puedes pagar con MercadoPago desde telvoice.cl tras cotizar, o dejar tus datos y te enviamos el link."
            : "Compra más SMS en /app/buy-sms con MercadoPago cuando esté disponible.",
        intent,
        confidence: route.confidence,
        sessionId,
        suggestedActions:
          ctx.channel === "landing"
            ? [{ label: "Calculadora", href: "https://www.telvoice.cl/#calculadora" }]
            : [{ label: "Comprar SMS", href: "/app/buy-sms" }],
      });

    case "follow_up": {
      if (route.commercialQuantity) {
        const q = await quoteSmsBundleTool.run(toolCtx(ctx), {
          quantity: route.commercialQuantity,
        });
        return baseResponse({
          reply: q.summary,
          intent: "commercial",
          confidence: route.confidence,
          quote: q.data ?? null,
          sessionId,
        });
      }
      return baseResponse({
        reply: "¿Sobre qué tema quieres continuar: cotización, saldo, campaña o DLR?",
        intent,
        confidence: route.confidence,
        sessionId,
      });
    }

    case "negative_feedback":
      return baseResponse({
        reply:
          "Gracias por el aviso. ¿Qué faltó en la respuesta? Cuéntame en una frase y lo registramos para mejorar.",
        intent,
        confidence: route.confidence,
        sessionId,
      });

    case "commercial_doubt":
      return baseResponse({
        reply:
          "Sí, Telvoice SMS sirve para OTP, alertas, cobranza y campañas masivas en Chile (Entel, Movistar, Claro, WOM). ¿Cuántos SMS estimas al mes?",
        intent,
        confidence: route.confidence,
        sessionId,
        suggestedActions: [{ label: "Cotizar 5000 SMS", message: "cotizar 5000 sms" }],
      });

    case "technical_doubt": {
      const structured = buildTechnicalDoubtReply(message);
      if (structured) {
        return baseResponse({
          reply: structured,
          intent: "technical_doubt",
          confidence: 0.9,
          sessionId,
        });
      }
      const k = await searchKnowledgeForChannel(message, ctx.channel);
      return baseResponse({
        reply: k.matched
          ? k.reply
          : "Consulta técnica: revisa API y documentación en el panel o pide whitelist IP en soporte.",
        intent: k.matched ? "knowledge" : "technical_doubt",
        confidence: k.confidence || route.confidence,
        sessionId,
      });
    }

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
