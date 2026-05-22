import { buildCtas, QUICK_ACTIONS } from "../../lib/web-agent/conversation.js";
import { getOrCreateSession, getSessionMessages } from "../../lib/web-agent/session.js";
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

    const session = await getOrCreateSession({
      sessionId: body.session_id || body.sessionId || null,
      visitorKey,
      pageUrl: body.current_url || body.page_url || null,
    });

    const messages = await getSessionMessages(session.id);
    const quote = session.last_quote || null;

    return json(req, res, 200, {
      ok: true,
      session_id: session.id,
      session_token: session.id,
      messages,
      quote,
      quick_actions: QUICK_ACTIONS,
      ctas: buildCtas(quote, false),
      has_history: messages.length > 0,
    });
  } catch (err) {
    console.error("[web-agent/resume]", err.message, err.stack);
    return json(req, res, 500, {
      ok: false,
      error: err.message || "No se pudo reanudar la conversación.",
    });
  }
}
