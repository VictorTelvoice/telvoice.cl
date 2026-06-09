/** Rutas del módulo numeraciones / SMS entrantes / agente (panel cliente). */

const AGENT_LINE_PATH_PREFIXES = [
  "/app/numeraciones",
  "/app/sms-inbox",
  "/app/agente",
  "/app/planes-agente",
] as const;

export function isClientPanelAgentLinePath(path: string): boolean {
  const base = path.split("?")[0]?.trim() ?? "";
  if (!base.startsWith("/app/")) return false;
  return AGENT_LINE_PATH_PREFIXES.some(
    (prefix) => base === prefix || base.startsWith(`${prefix}/`),
  );
}
