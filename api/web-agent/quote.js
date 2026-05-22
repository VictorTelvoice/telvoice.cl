import { handleWebAgentQuoteOnly } from "../../lib/web-agent/conversation.js";
import { applyCors, json, parseBody } from "./_shared.js";

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
    const result = await handleWebAgentQuoteOnly(body);
    return json(req, res, 200, result);
  } catch (err) {
    console.error("[web-agent/quote]", err.message);
    return json(req, res, 400, { ok: false, error: err.message });
  }
}
