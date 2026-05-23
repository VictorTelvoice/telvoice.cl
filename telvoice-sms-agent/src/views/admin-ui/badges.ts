import { escapeHtml } from "../../utils/html.js";

export function statusBadge(status: string | null | undefined): string {
  const key = (status ?? "unknown").toLowerCase();
  let cls = "badge-muted";
  if (["delivered", "submitted", "active", "ok", "s"].includes(key)) {
    cls = "badge-ok";
  } else if (["failed", "error", "rejected", "f"].includes(key)) {
    cls = "badge-err";
  } else if (["pending", "pending_submit", "unknown", "p"].includes(key)) {
    cls = "badge-warn";
  }
  return `<span class="badge ${cls}">${escapeHtml(status ?? "—")}</span>`;
}
