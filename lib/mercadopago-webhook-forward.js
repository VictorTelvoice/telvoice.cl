/**
 * Reenvío defensivo de webhooks de suscripción MP (www → agent).
 * Usado por api/mercadopago/webhook.js (landing legacy).
 */

export const SUBSCRIPTION_WEBHOOK_TOPICS = new Set([
  "subscription_preapproval",
  "subscription_authorized_payment",
]);

const DEFAULT_AGENT_WEBHOOK_URL =
  "https://agent.telvoice.cl/api/mercadopago/webhook";

function readId(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

/**
 * @param {{ query?: Record<string, string | string[] | undefined>, body?: Record<string, unknown> }} req
 * @returns {{ topic: string, resourceId: string } | null}
 */
export function extractMercadoPagoSubscriptionWebhookEvent(req) {
  const q = req.query || {};
  const body = req.body || {};

  const topicCandidates = [
    q.topic,
    q.type,
    typeof body.topic === "string" ? body.topic : null,
    typeof body.type === "string" ? body.type : null,
  ]
    .map((v) => (v != null ? String(v).trim() : ""))
    .filter(Boolean);

  for (const topic of topicCandidates) {
    if (!SUBSCRIPTION_WEBHOOK_TOPICS.has(topic)) continue;

    if (q.topic === topic && q.id) {
      return { topic, resourceId: readId(q.id) };
    }
    if (q.type === topic && q.id) {
      return { topic, resourceId: readId(q.id) };
    }
    if (body.type === topic && body.data && typeof body.data === "object") {
      const id = readId(body.data.id);
      if (id) return { topic, resourceId: id };
    }
    if (body.topic === topic && body.id) {
      return { topic, resourceId: readId(body.id) };
    }
  }

  return null;
}

/**
 * @param {string} agentWebhookUrl
 * @param {{ query?: Record<string, string | string[] | undefined> }} req
 */
export function buildAgentWebhookForwardUrl(agentWebhookUrl, req) {
  const base = (agentWebhookUrl || DEFAULT_AGENT_WEBHOOK_URL).replace(/\/$/, "");
  const target = new URL(base);

  for (const [key, value] of Object.entries(req.query || {})) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) target.searchParams.append(key, String(item));
    } else {
      target.searchParams.set(key, String(value));
    }
  }
  return target.toString();
}

/**
 * @param {{ method?: string, query?: Record<string, unknown>, body?: Record<string, unknown>, headers?: Record<string, string | string[] | undefined> }} req
 * @param {{ agentWebhookUrl?: string, fetchImpl?: typeof fetch }} [options]
 */
export async function forwardSubscriptionWebhookToAgent(req, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("fetch unavailable for webhook forward");
  }

  const target = buildAgentWebhookForwardUrl(
    options.agentWebhookUrl || process.env.TELVOICE_AGENT_WEBHOOK_URL,
    req,
  );

  const method = (req.method || "GET").toUpperCase();
  const headers = {
    "Content-Type": "application/json",
    "X-Telvoice-Webhook-Forward": "www-legacy",
  };

  /** @type {RequestInit} */
  const init = { method, headers };

  if (method !== "GET" && req.body && Object.keys(req.body).length > 0) {
    init.body = JSON.stringify(req.body);
  }

  const response = await fetchImpl(target, init);
  const text = await response.text();
  /** @type {Record<string, unknown>} */
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 500) };
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
    target,
  };
}
