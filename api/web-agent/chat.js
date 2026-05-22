import { handleWebAgentTurn } from "../../lib/web-agent/conversation.js";
import { applyCors, json, parseBody, resolveVisitorKey } from "./_shared.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    applyCors(req, res);
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return json(req, res, 405, { ok: false, error: "Método no permitido." });
  }

  try {
    const body = parseBody(req);
    const visitorKey = resolveVisitorKey(body);
    if (!visitorKey || visitorKey.length < 8) {
      return json(req, res, 400, {
        ok: false,
        error: "session_token inválido.",
      });
    }

    const result = await handleWebAgentTurn({
      sessionId: body.session_id || body.sessionId || null,
      visitorKey,
      message: body.message || "",
      pageUrl: body.current_url || body.page_url || body.pageUrl || null,
      landingPage: body.landing_page || body.landingPage || null,
      quickAction: body.quick_action || body.quickAction || null,
    });

    return json(req, res, 200, { ok: true, ...result });
  } catch (err) {
    console.error("[web-agent/chat]", err.message, err.stack);
    return json(req, res, 500, {
      ok: false,
      error:
        err.message ||
        "Error interno del agente comercial. Intenta de nuevo en unos segundos.",
    });
  }
}
