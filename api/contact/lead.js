import { handleLandingContactLead } from "../../lib/landing-contact-lead.js";
import { applyCors, json, parseBody } from "../web-agent/_shared.js";

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
    const result = await handleLandingContactLead({
      ...body,
      page_url: body.page_url || req.headers.referer || null,
    });
    return json(req, res, 200, result);
  } catch (err) {
    console.error("[contact/lead]", err.message);
    return json(req, res, 400, { ok: false, error: err.message });
  }
}
