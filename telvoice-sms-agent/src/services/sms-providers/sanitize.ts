const SENSITIVE_KEYS = new Set([
  "api_id",
  "api_password",
  "API_ID",
  "API_PASSWORD",
  "password",
  "token",
  "authorization",
]);

export function sanitizeProviderResponse(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEYS.has(key)) {
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeProviderResponse(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}
