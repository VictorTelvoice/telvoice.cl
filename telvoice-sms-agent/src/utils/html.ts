export function escapeHtml(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** JSON embebido en `<script type="application/json">` sin romper parse ni HTML. */
export function embedJsonInScriptTag(id: string, data: unknown): string {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `<script type="application/json" id="${escapeHtml(id)}">${json}</script>`;
}

export function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }
  return date.toLocaleString("es-CL", { timeZone: "America/Santiago" });
}

/** Fecha+hora compacta en una línea (tablas densas, p. ej. mensajería). */
export function formatDateCompact(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }
  const parts = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("day")}-${pick("month")}-${pick("year")} ${pick("hour")}:${pick("minute")}`;
}

/** Tiempo relativo en español (p. ej. «hace 4 min»); cae a fecha si es antiguo. */
export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) {
    return formatDateShort(value);
  }
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "hace un momento";
  if (diffMins < 60) return `hace ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `hace ${diffDays} día${diffDays > 1 ? "s" : ""}`;
  return formatDateShort(value);
}

/** E.164 legible para panel (Chile móvil: +569 XXXX XXXX). */
export function formatPhoneDisplay(e164: string | null | undefined): string {
  const raw = (e164 ?? "").trim();
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("569") && digits.length >= 11) {
    const local = digits.slice(3);
    return `+569 ${local.slice(0, 4)} ${local.slice(4, 8)}`;
  }
  if (digits.startsWith("56") && digits.length >= 11) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 3)} ${digits.slice(3, 7)} ${digits.slice(7, 11)}`;
  }
  if (raw.startsWith("+")) return raw;
  return raw;
}

/** Fecha corta para KPIs y tablas (sin hora). */
export function formatDateShort(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }
  return date.toLocaleDateString("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
