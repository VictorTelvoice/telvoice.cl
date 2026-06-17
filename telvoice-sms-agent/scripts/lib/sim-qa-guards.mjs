/** Guards compartidos para scripts E2E sandbox SIM (sin secretos en logs). */
export const PROTECTED_INVENTORY_SUFFIXES = new Set(["030", "021", "513"]);

export function mpTokenKind(token) {
  if (!token) return "missing";
  if (token.startsWith("TEST-")) return "sandbox_test";
  return "production_like";
}

export function assertSandboxMpEnv(env = process.env) {
  const errors = [];
  const sandbox = env.MERCADOPAGO_SANDBOX !== "false";
  const token = env.MERCADOPAGO_ACCESS_TOKEN?.trim() ?? "";

  if (!sandbox) errors.push("MERCADOPAGO_SANDBOX debe ser true");
  if (!token) errors.push("MERCADOPAGO_ACCESS_TOKEN vacío");
  else if (!token.startsWith("TEST-")) {
    errors.push("MERCADOPAGO_ACCESS_TOKEN debe empezar con TEST- (sandbox)");
  }

  const appUrl = env.PUBLIC_APP_URL?.trim() ?? "";
  if (!appUrl.includes("agent-qa")) {
    errors.push("PUBLIC_APP_URL debe apuntar a agent-qa (no producción)");
  }

  if ((env.PUBLIC_SITE_URL?.trim() ?? "").includes("www.telvoice.cl")) {
    errors.push("PUBLIC_SITE_URL no debe ser www.telvoice.cl en sim-qa");
  }

  return { ok: errors.length === 0, errors, sandbox, tokenKind: mpTokenKind(token) };
}

export function assertQaInventoryRow(row) {
  const errors = [];
  if (!row) {
    errors.push("inventario QA no encontrado");
    return { ok: false, errors };
  }
  const suffix = String(row.suffix ?? "").slice(-3);
  if (PROTECTED_INVENTORY_SUFFIXES.has(suffix)) {
    errors.push(`sufijo protegido ***${suffix}`);
  }
  const qaOnly = row.qa_only === true || row.qa_only === "true";
  if (!qaOnly) errors.push("metadata.qa_only debe ser true");
  if (row.sales_status !== "connected_available") {
    errors.push(`sales_status=${row.sales_status} (se esperaba connected_available)`);
  }
  return { ok: errors.length === 0, errors, suffix };
}

export function maskSuffix(suffix) {
  const s = String(suffix ?? "").slice(-3);
  return s ? `***${s}` : "???";
}
