const ALLOWED_ORIGINS = new Set([
  "https://telvoice.cl",
  "https://www.telvoice.cl",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

export function applyCors(req, res) {
  const origin = req.headers.origin;
  if (
    origin &&
    (ALLOWED_ORIGINS.has(origin) || origin.startsWith("http://localhost"))
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Vary", "Origin");
  }
}

export function json(req, res, status, body) {
  applyCors(req, res);
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export function parseBody(req) {
  const raw = req.body;
  if (raw && typeof raw === "object" && !Buffer.isBuffer(raw)) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

export function resolveVisitorKey(body) {
  return String(
    body.session_token ||
      body.visitor_key ||
      body.visitorKey ||
      "",
  ).trim();
}
