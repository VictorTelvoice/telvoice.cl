/** Enmascara URLs y secretos para vistas de solo lectura. */
export function maskConnectionUrl(value: string | undefined): string {
  if (!value || value.trim() === "") {
    return "(no configurada)";
  }
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    const user = url.username ? `${url.username}:***@` : "";
    const host = url.hostname;
    const port = url.port ? `:${url.port}` : "";
    const path = url.pathname && url.pathname !== "/" ? url.pathname : "";
    return `${url.protocol}//${user}${host}${port}${path}…`;
  } catch {
    if (trimmed.length <= 12) {
      return "••••••••";
    }
    return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
  }
}

export function maskSupabaseUrl(value: string | undefined): string {
  if (!value || value.trim() === "") {
    return "(no configurada)";
  }
  return value.replace(/\/rest\/v1\/?$/, "");
}

/** Enmascara lista de IDs de Telegram (ej. 123456789 → 123***789). */
export function maskTelegramAllowedUserIds(value: string | undefined): string {
  if (!value || value.trim() === "") {
    return "(ninguno configurado)";
  }

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((id) => {
      if (id.length <= 6) {
        return "••••";
      }
      return `${id.slice(0, 3)}***${id.slice(-3)}`;
    })
    .join(", ");
}
