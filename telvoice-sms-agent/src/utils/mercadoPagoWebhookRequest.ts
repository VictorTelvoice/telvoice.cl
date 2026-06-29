import type { Request } from "express";

export type MercadoPagoWebhookTopic =
  | "subscription_authorized_payment"
  | "subscription_preapproval"
  | "payment"
  | "unknown";

export type MercadoPagoWebhookDeliverySource = "direct" | "www-forward" | "unknown";

export type ParsedMercadoPagoWebhookRequest = {
  topic: MercadoPagoWebhookTopic;
  resourceId: string | null;
  deliverySource: MercadoPagoWebhookDeliverySource;
  httpMethod: string;
  query: Record<string, string>;
  body: Record<string, unknown>;
};

function readId(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function topicFromQueryOrBody(
  query: Record<string, string | undefined>,
  body: Record<string, unknown>,
): MercadoPagoWebhookTopic {
  const candidates = [
    query.topic,
    query.type,
    typeof body.topic === "string" ? body.topic : null,
    typeof body.type === "string" ? body.type : null,
  ]
    .map((v) => (v != null ? String(v).trim() : ""))
    .filter(Boolean);

  for (const raw of candidates) {
    if (raw === "subscription_authorized_payment") return "subscription_authorized_payment";
    if (raw === "subscription_preapproval") return "subscription_preapproval";
    if (raw === "payment") return "payment";
  }
  return "unknown";
}

function resourceIdForTopic(
  topic: MercadoPagoWebhookTopic,
  query: Record<string, string | undefined>,
  body: Record<string, unknown>,
): string | null {
  if (topic === "subscription_authorized_payment") {
    if (query.topic === "subscription_authorized_payment" && query.id) {
      return readId(query.id);
    }
    if (query.type === "subscription_authorized_payment" && query.id) {
      return readId(query.id);
    }
    if (body.type === "subscription_authorized_payment" && body.data && typeof body.data === "object") {
      return readId((body.data as { id?: string | number }).id);
    }
    if (body.topic === "subscription_authorized_payment" && body.id) {
      return readId(body.id);
    }
    return null;
  }

  if (topic === "subscription_preapproval") {
    if (query.topic === "subscription_preapproval" && query.id) {
      return readId(query.id);
    }
    if (query.type === "subscription_preapproval" && query.id) {
      return readId(query.id);
    }
    if (body.type === "subscription_preapproval" && body.data && typeof body.data === "object") {
      return readId((body.data as { id?: string | number }).id);
    }
    if (body.topic === "subscription_preapproval" && body.id) {
      return readId(body.id);
    }
    return null;
  }

  if (topic === "payment") {
    if (query.topic === "payment" && query.id) {
      return readId(query.id);
    }
    if (body.type === "payment" && body.data && typeof body.data === "object") {
      return readId((body.data as { id?: string | number }).id);
    }
    if (body.topic === "payment" && body.id) {
      return readId(body.id);
    }
    return null;
  }

  return null;
}

export function parseMercadoPagoWebhookFromParts(input: {
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  headers?: Record<string, string | undefined>;
  method?: string;
}): ParsedMercadoPagoWebhookRequest {
  const query = input.query ?? {};
  const body = input.body ?? {};
  const headers = input.headers ?? {};
  const topic = topicFromQueryOrBody(query, body);
  const resourceId = resourceIdForTopic(topic, query, body);
  const forwardHeader = headers["x-telvoice-webhook-forward"]?.trim().toLowerCase();

  return {
    topic,
    resourceId,
    deliverySource:
      forwardHeader === "www-legacy"
        ? "www-forward"
        : forwardHeader
          ? "unknown"
          : "direct",
    httpMethod: (input.method ?? "POST").toUpperCase(),
    query: Object.fromEntries(
      Object.entries(query)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, String(v)]),
    ),
    body,
  };
}

export function parseMercadoPagoWebhookRequest(req: Request): ParsedMercadoPagoWebhookRequest {
  return parseMercadoPagoWebhookFromParts({
    query: req.query as Record<string, string | undefined>,
    body: (req.body ?? {}) as Record<string, unknown>,
    headers: req.headers as Record<string, string | undefined>,
    method: req.method,
  });
}

export function isMercadoPagoSubscriptionWebhookTopic(
  topic: MercadoPagoWebhookTopic,
): boolean {
  return (
    topic === "subscription_preapproval" || topic === "subscription_authorized_payment"
  );
}
