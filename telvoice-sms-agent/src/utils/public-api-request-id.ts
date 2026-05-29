import crypto from "node:crypto";

export function generatePublicApiRequestId(now = Date.now()): string {
  const random = crypto.randomBytes(4).toString("hex");
  return `req_${now}_${random}`;
}

export function truncateUserAgent(raw: string | undefined, max = 200): string | null {
  if (!raw || typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function extractClientIp(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): string | null {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  if (typeof req.ip === "string" && req.ip.trim()) {
    return req.ip.trim();
  }
  return null;
}
