import { answerFaq, isLandingFaqQuestion } from "./faq.js";
import { formatAllUseCasesForChat } from "../landing-use-cases-data.js";
import { WEB_AGENT_CAPABILITIES_MESSAGE } from "./capabilities.js";
import { HIGH_VOLUME_AGENT_MESSAGE } from "./highVolume.js";
import { classifyWebAgentIntent } from "./webAgentIntentService.js";
import {
  calculateQuote,
  extractQuantityFromText,
  formatPricesCatalogMessage,
  formatQuoteForChat,
  parseBareQuantity,
} from "./telvoiceQuoteService.js";
import {
  appendMessage,
  getLeadStepPrompt,
  getOrCreateSession,
  isLeadComplete,
  nextLeadStep,
  parseLeadStepInput,
  saveLeadRecord,
  saveQuoteRecord,
  updateSession,
} from "./session.js";

export const WELCOME =
  "Hola, soy el agente comercial de Telvoice.cl. Te ayudo a cotizar bolsas SMS para Chile, explicar casos de uso de mensajería (OTP, notificaciones, recordatorios, alertas), resolver dudas y avanzar al pago. ¿Qué necesitas hoy?";

export const QUICK_ACTIONS = [
  { id: "quote", label: "Cotizar SMS" },
  { id: "prices", label: "Ver precios" },
  { id: "use_cases", label: "Casos de uso" },
  { id: "purchase", label: "Comprar SMS" },
  { id: "register", label: "Registrarme" },
  { id: "advisor", label: "Hablar con un asesor" },
  { id: "how", label: "Cómo funciona" },
];

const REGISTER_URL = "https://portal.telvoice.net/";

export function buildCtas(quote, leadComplete) {
  const ctas = [];
  if (quote) {
    ctas.push({
      type: "pay",
      label: "Ir a pagar",
      calc_sms: quote.quoted_quantity,
      plan_id: "calc",
    });
  }
  ctas.push({
    type: "register",
    label: "Registrarme",
    url: REGISTER_URL,
  });
  ctas.push({ type: "advisor", label: "Contactar asesor" });
  return ctas;
}

function mapQuickAction(actionId) {
  const map = {
    quote: "Indica cuántos SMS quieres cotizar (ej. 30000 o cotizar 15000 sms).",
    prices: formatPricesCatalogMessage(),
    purchase:
      "Perfecto, puedo ayudarte a comprar una bolsa SMS para Chile. Las bolsas se calculan en múltiplos de 1.000 SMS y el precio baja según volumen. ¿Cuántos SMS necesitas comprar?",
    register:
      "Para operar SMS necesitas una bolsa activa. Puedes comprar aquí con MercadoPago o ingresar al portal si ya tienes cuenta activa.",
    advisor:
      "Un asesor comercial Telvoice puede ayudarte con volúmenes, API o casos especiales. Escríbenos a ventas@telvoice.net indicando tu empresa y cantidad de SMS.",
    how: answerFaq("como funciona"),
    use_cases: formatAllUseCasesForChat(),
  };
  return map[actionId] || null;
}

async function persistQuote(session, quote) {
  await updateSession(session.id, { last_quote: quote });
  session.last_quote = quote;
  await saveQuoteRecord(session.id, quote);
}

export async function handleWebAgentTurn({
  sessionId,
  visitorKey,
  message,
  pageUrl,
  landingPage,
  quickAction,
}) {
  const session = await getOrCreateSession({
    sessionId,
    visitorKey,
    pageUrl: pageUrl || landingPage,
  });

  const userText = String(message || "").trim();
  const isFirstOpen = !userText && !quickAction;

  if (userText) {
    await appendMessage(session.id, "user", userText, {
      page_url: pageUrl || landingPage,
    });
  }

  let reply = "";
  let intent = "welcome";
  let quote = null;
  let lead_required = false;
  let lead_capture_step = session.lead_capture_step || null;
  const leadData = { ...(session.lead_data || {}) };

  if (isFirstOpen) {
    reply = WELCOME;
    intent = "greeting";
    await appendMessage(session.id, "assistant", reply, { kind: "welcome" });
    return packResponse(session.id, reply, intent, null, lead_capture_step, false);
  }

  if (quickAction) {
    const mapped = mapQuickAction(quickAction);
    if (mapped) {
      intent = quickAction;
      reply = mapped;
      if (quickAction === "register") {
        return packResponse(
          session.id,
          reply + `\n\nPortal: ${REGISTER_URL}`,
          intent,
          session.last_quote,
          null,
          false,
          [{ type: "register", label: "Ir al portal", url: REGISTER_URL }],
        );
      }
      if (quickAction === "purchase" || quickAction === "quote") {
        const nextLead = {
          ...(session.lead_data || {}),
          pending_action:
            quickAction === "quote" ? "quote_quantity" : "purchase_quantity",
        };
        await updateSession(session.id, { lead_data: nextLead });
        session.lead_data = nextLead;
      }
      await appendMessage(session.id, "assistant", reply, { quick_action: quickAction });
      return packResponse(
        session.id,
        reply,
        intent,
        session.last_quote,
        lead_capture_step,
        quickAction === "purchase" && !session.last_quote,
      );
    }
  }

  const pendingAction = session.lead_data?.pending_action;
  if (userText && pendingAction) {
    const qty =
      extractQuantityFromText(userText) ?? parseBareQuantity(userText);
    if (qty) {
      quote = calculateQuote(qty);
      await persistQuote(session, quote);
      const clearedLead = { ...(session.lead_data || {}) };
      delete clearedLead.pending_action;
      clearedLead.requested_quantity = quote.quoted_quantity;
      await updateSession(session.id, { lead_data: clearedLead });
      session.lead_data = clearedLead;
      session.last_quote = quote;
      reply = formatQuoteForChat(quote);
      intent = "quote";
      await appendMessage(session.id, "assistant", reply, { intent, quote: true });
      return packResponse(session.id, reply, intent, quote, null, false);
    }
  }

  if (lead_capture_step) {
    const parsed = parseLeadStepInput(lead_capture_step, userText, leadData);
    if (!parsed.ok) {
      reply = parsed.error + "\n\n" + getLeadStepPrompt(lead_capture_step);
      await appendMessage(session.id, "assistant", reply, { lead_step: lead_capture_step });
      return packResponse(session.id, reply, "lead", null, lead_capture_step, true);
    }

    const updatedLead = parsed.leadData;
    let step = nextLeadStep(lead_capture_step);
    if (step === "quantity" && updatedLead.requested_quantity) {
      step = "use_case";
    }
    if (step === "use_case" && updatedLead.use_case) {
      step = null;
    }

    if (step) {
      await updateSession(session.id, {
        lead_data: updatedLead,
        lead_capture_step: step,
      });
      reply = `Gracias.\n\n${getLeadStepPrompt(step)}`;
      await appendMessage(session.id, "assistant", reply, { lead_step: step });
      return packResponse(session.id, reply, "lead", null, step, true);
    }

    await updateSession(session.id, {
      lead_data: updatedLead,
      lead_capture_step: null,
    });

    try {
      await saveLeadRecord(session.id, {
        ...updatedLead,
        message: updatedLead.use_case || "Lead chat web Telvoice.cl",
      });
    } catch (err) {
      console.error("[web-agent] saveLead:", err.message);
    }

    const qty = updatedLead.requested_quantity || session.last_quote?.quoted_quantity;
    if (qty && !session.last_quote) {
      quote = calculateQuote(qty);
      await persistQuote(session, quote);
      session.last_quote = quote;
    } else {
      quote = session.last_quote;
    }

    reply =
      "¡Listo! Registré tus datos. Puedes pagar online con MercadoPago o esperar contacto de Telvoice.";
    if (quote) {
      reply += "\n\n" + formatQuoteForChat(quote);
    }
    await appendMessage(session.id, "assistant", reply, { lead_complete: true });
    return packResponse(session.id, reply, "lead", quote, null, false);
  }

  if (isLandingFaqQuestion(userText)) {
    reply = answerFaq(userText);
    intent = "faq";
    await appendMessage(session.id, "assistant", reply, { intent: "faq" });
    return packResponse(
      session.id,
      reply,
      intent,
      session.last_quote,
      lead_capture_step,
      false,
    );
  }

  const classified = classifyWebAgentIntent(userText);
  intent = classified.intent;
  const qtyDetected = classified.quantity;

  if (intent === "greeting") {
    reply = WELCOME;
  } else if (intent === "capabilities") {
    reply = WEB_AGENT_CAPABILITIES_MESSAGE;
  } else if (intent === "high_volume") {
    reply = HIGH_VOLUME_AGENT_MESSAGE;
    const nextLead = {
      ...leadData,
      pending_action: "purchase_quantity",
      high_volume: true,
    };
    await updateSession(session.id, { lead_data: nextLead });
    session.lead_data = nextLead;
    intent = "purchase";
  } else if (intent === "prices") {
    reply = formatPricesCatalogMessage();
  } else if (intent === "faq") {
    reply = answerFaq(userText);
  } else if (intent === "register") {
    reply =
      `Puedes registrarte o ingresar al portal cliente en ${REGISTER_URL} si ya tienes bolsa activa. Para comprar una nueva bolsa, cotiza aquí y paga con MercadoPago.`;
  } else if (intent === "advisor") {
    reply =
      "Para hablar con un asesor, escríbenos a ventas@telvoice.net con tu empresa, cantidad de SMS y caso de uso (OTP, campañas, API, etc.).";
  } else if (intent === "quote" || intent === "purchase") {
    const qty =
      qtyDetected ??
      extractQuantityFromText(userText) ??
      parseBareQuantity(userText);
    if (!qty) {
      reply =
        "Perfecto, puedo ayudarte a comprar una bolsa SMS para Chile. Las bolsas se calculan en múltiplos de 1.000 SMS y el precio baja según volumen. ¿Cuántos SMS necesitas comprar?";
      intent = "purchase";
      const nextLead = {
        ...leadData,
        pending_action: "purchase_quantity",
      };
      await updateSession(session.id, { lead_data: nextLead });
      session.lead_data = nextLead;
    } else {
      const clearedLead = { ...leadData };
      delete clearedLead.pending_action;
      if (Object.keys(clearedLead).length) {
        await updateSession(session.id, { lead_data: clearedLead });
      }
      session.lead_data = clearedLead;
      quote = calculateQuote(qty);
      await persistQuote(session, quote);
      leadData.requested_quantity = quote.quoted_quantity;
      reply = formatQuoteForChat(quote);
      intent = "quote";
    }
  } else if (intent === "payment") {
    quote = session.last_quote;
    if (!quote) {
      reply =
        "Primero indica cuántos SMS necesitas (ej. 30000). Luego te guío al pago con MercadoPago.";
    } else if (!isLeadComplete(leadData)) {
      lead_required = true;
      lead_capture_step = "name";
      await updateSession(session.id, {
        lead_capture_step: "name",
        lead_data: leadData,
      });
      reply =
        "El pago se realiza online mediante MercadoPago en pesos chilenos.\n\nPara avanzar, necesito unos datos breves.\n\n" +
        getLeadStepPrompt("name");
    } else {
      reply =
        "Usa el botón «Ir a pagar» para abrir el checkout con MercadoPago según tu cotización.";
    }
  } else {
    const bareQty = parseBareQuantity(userText);
    if (bareQty) {
      quote = calculateQuote(bareQty);
      await persistQuote(session, quote);
      session.last_quote = quote;
      reply = formatQuoteForChat(quote);
      intent = "quote";
    } else {
      reply =
        "Puedo cotizar bolsas SMS, mostrar precios o explicar Telvoice.cl. Prueba «Cotizar SMS» o escribe: quiero comprar 30000 SMS.";
      intent = "fallback";
    }
  }

  await appendMessage(session.id, "assistant", reply, { intent });

  return packResponse(
    session.id,
    reply,
    intent,
    quote || session.last_quote,
    lead_capture_step,
    lead_required,
  );
}

function packResponse(
  sessionId,
  reply,
  intent,
  quote,
  lead_capture_step,
  lead_required,
  ctasOverride,
) {
  return {
    session_id: sessionId,
    session_token: sessionId,
    reply,
    intent,
    quick_actions: QUICK_ACTIONS,
    quote: quote || null,
    lead_required: Boolean(lead_required),
    lead_capture_step: lead_capture_step || null,
    ctas: ctasOverride || buildCtas(quote, false),
  };
}

export async function handleWebAgentLead(body) {
  const visitorKey = String(body.session_token || body.visitor_key || "").trim();
  const session = await getOrCreateSession({
    sessionId: body.session_id || null,
    visitorKey,
    pageUrl: body.current_url || null,
  });

  const lead = {
    name: body.name?.trim() || null,
    company: body.company?.trim() || null,
    email: body.email?.trim()?.toLowerCase() || null,
    phone: body.phone?.trim() || null,
    requested_quantity: body.requested_quantity
      ? Number(body.requested_quantity)
      : null,
    use_case: body.use_case?.trim() || body.message?.trim() || null,
    message: body.message?.trim() || body.use_case?.trim() || null,
  };

  if (!lead.email && !lead.phone) {
    throw new Error("Se requiere email o teléfono.");
  }

  await saveLeadRecord(session.id, lead);

  let quoteText = "";
  if (lead.requested_quantity) {
    const quote = calculateQuote(lead.requested_quantity);
    await persistQuote(session, quote);
    quoteText = "\n\n" + formatQuoteForChat(quote);
  }

  return {
    ok: true,
    message: "Lead registrado correctamente." + quoteText,
    session_id: session.id,
  };
}

export async function handleWebAgentQuoteOnly(body) {
  const qty = Number(body.quantity);
  if (!Number.isFinite(qty) || qty < 1) {
    throw new Error("quantity inválida.");
  }
  const quote = calculateQuote(qty);
  const visitorKey = String(body.session_token || body.visitor_key || "anon").trim();
  const session = await getOrCreateSession({
    sessionId: body.session_id || null,
    visitorKey,
  });
  await persistQuote(session, quote);
  return {
    ok: true,
    quote,
    reply: formatQuoteForChat(quote),
    session_id: session.id,
  };
}
