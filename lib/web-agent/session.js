import {
  isSupabaseConfigured,
  supabaseInsert,
  supabaseSelectOne,
  supabaseUpdate,
} from "./supabase-rest.js";

const LEAD_STEPS = ["name", "company", "email", "phone", "quantity", "use_case"];

export function getLeadStepPrompt(step) {
  switch (step) {
    case "name":
      return "Para continuar, ¿cuál es tu nombre?";
    case "company":
      return "¿Nombre de tu empresa? (si eres persona natural, repite tu nombre)";
    case "email":
      return "¿Tu email de contacto?";
    case "phone":
      return "¿Tu teléfono o WhatsApp? (ej. +56 9 1234 5678)";
    case "quantity":
      return "¿Cuántos SMS necesitas comprar? (solo el número, ej. 15000)";
    case "use_case":
      return "¿Uso principal? (campañas, OTP, ecommerce, retail, validaciones, etc.)";
    default:
      return null;
  }
}

export function nextLeadStep(current) {
  if (!current) {
    return "name";
  }
  const idx = LEAD_STEPS.indexOf(current);
  if (idx < 0 || idx >= LEAD_STEPS.length - 1) {
    return null;
  }
  return LEAD_STEPS[idx + 1];
}

function localSession(sessionId, visitorKey, pageUrl) {
  return {
    id: sessionId || `local-${visitorKey}`,
    visitor_key: visitorKey,
    lead_capture_step: null,
    lead_data: {},
    last_quote: null,
    page_url: pageUrl || null,
    _local: true,
  };
}

export async function getSessionMessages(sessionId) {
  if (!sessionId || sessionId.startsWith("local-") || !isSupabaseConfigured()) {
    return [];
  }

  const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/web_agent_messages?session_id=eq.${encodeURIComponent(sessionId)}&order=created_at.asc&select=role,content`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Accept: "application/json",
        },
      },
    );
    const data = await res.json().catch(() => []);
    if (!res.ok || !Array.isArray(data)) {
      return [];
    }
    return data
      .filter((row) => row.role === "user" || row.role === "assistant")
      .map((row) => ({
        role: row.role === "user" ? "user" : "bot",
        text: row.content,
      }));
  } catch {
    return [];
  }
}

export async function getOrCreateSession({
  sessionId,
  visitorKey,
  pageUrl,
}) {
  if (!isSupabaseConfigured()) {
    return localSession(sessionId, visitorKey, pageUrl);
  }

  try {
    if (sessionId) {
      const existing = await supabaseSelectOne(
        "web_agent_sessions",
        `id=eq.${encodeURIComponent(sessionId)}&select=*`,
      );
      if (existing) {
        return existing;
      }
    }

    const created = await supabaseInsert("web_agent_sessions", {
      visitor_key: visitorKey,
      lead_capture_step: null,
      lead_data: {},
      page_url: pageUrl || null,
    });

    return created;
  } catch (error) {
    console.warn(
      "[web-agent] Supabase session fallback:",
      error instanceof Error ? error.message : error,
    );
    return localSession(sessionId, visitorKey, pageUrl);
  }
}

export async function updateSession(sessionId, patch) {
  if (!sessionId || sessionId.startsWith("local-")) {
    return null;
  }
  if (!isSupabaseConfigured()) {
    return null;
  }
  return supabaseUpdate("web_agent_sessions", sessionId, {
    ...patch,
    updated_at: new Date().toISOString(),
  });
}

export async function appendMessage(sessionId, role, content, metadata) {
  if (!sessionId || sessionId.startsWith("local-") || !isSupabaseConfigured()) {
    return null;
  }
  return supabaseInsert("web_agent_messages", {
    session_id: sessionId,
    role,
    content,
    metadata: metadata || null,
  });
}

export async function saveQuoteRecord(sessionId, quote) {
  if (!sessionId || sessionId.startsWith("local-") || !isSupabaseConfigured()) {
    return null;
  }
  return supabaseInsert("web_agent_quotes", {
    session_id: sessionId,
    requested_quantity: quote.requested_quantity,
    quoted_quantity: quote.quoted_quantity,
    unit_price: quote.unit_price,
    subtotal: quote.subtotal,
    iva: quote.iva,
    total_with_iva: quote.total_with_iva,
    tier_label: quote.tier_applied || quote.tier_label,
    currency: quote.currency || "CLP",
  });
}

export async function saveLeadRecord(sessionId, lead, options = {}) {
  if (!isSupabaseConfigured()) {
    return null;
  }
  return supabaseInsert("web_agent_leads", {
    session_id: sessionId?.startsWith("local-") ? null : sessionId,
    name: lead.name || null,
    company: lead.company || null,
    email: lead.email || null,
    phone: lead.phone || null,
    requested_quantity: lead.requested_quantity ?? null,
    message: lead.message || lead.use_case || null,
    source: options.source || "web_agent",
    status: "new",
  });
}

export function isLeadComplete(leadData) {
  return Boolean(
    leadData?.name?.trim() &&
      leadData?.email?.trim() &&
      leadData?.phone?.trim() &&
      (leadData?.use_case?.trim() || leadData?.requested_quantity),
  );
}

export function parseLeadStepInput(step, value, leadData) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return { ok: false, error: "Por favor escribe una respuesta válida." };
  }

  const next = { ...leadData };

  switch (step) {
    case "name":
      next.name = trimmed;
      break;
    case "company":
      next.company = trimmed;
      break;
    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return { ok: false, error: "Email inválido. Ejemplo: nombre@empresa.cl" };
      }
      next.email = trimmed.toLowerCase();
      break;
    case "phone":
      if (trimmed.replace(/\D/g, "").length < 8) {
        return { ok: false, error: "Teléfono inválido. Incluye código de país si puedes." };
      }
      next.phone = trimmed;
      break;
    case "quantity": {
      const qty = parseInt(trimmed.replace(/\D/g, ""), 10);
      if (!Number.isFinite(qty) || qty < 1) {
        return { ok: false, error: "Indica un número válido de SMS, ej. 15000" };
      }
      next.requested_quantity = qty;
      break;
    }
    case "use_case":
      next.use_case = trimmed;
      break;
    default:
      break;
  }

  return { ok: true, leadData: next };
}
