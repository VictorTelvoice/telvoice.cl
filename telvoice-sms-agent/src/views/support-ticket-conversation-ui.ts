import type { SupportTicketReply, SupportTicketStatus } from "../types/support-tickets.js";
import { escapeHtml } from "../utils/html.js";

export type TicketConversationAudience = "client" | "admin";

export function formatTicketStatusForAudience(
  status: SupportTicketStatus,
  replies: SupportTicketReply[],
  audience: TicketConversationAudience,
): string {
  const publicReplies = replies.filter((r) => !r.internal);
  const lastPublic = publicReplies.length ? publicReplies[publicReplies.length - 1] : null;

  if (status === "resolved") return "Resuelto";
  if (status === "open") return "Abierto";
  if (status === "in_review") {
    return audience === "admin" ? "En revisión" : "En revisión por Telvoice";
  }

  if (status === "waiting") {
    if (audience === "client") {
      if (!lastPublic || lastPublic.author === "client") {
        return "Esperando respuesta de Telvoice";
      }
      return "Esperando tu respuesta";
    }
    if (!lastPublic || lastPublic.author === "client") {
      return "Pendiente equipo";
    }
    return "Esperando cliente";
  }

  return status;
}

export function statusBadgeClass(status: SupportTicketStatus): string {
  const cls: Record<SupportTicketStatus, string> = {
    open: "badge-warn",
    in_review: "badge-muted",
    waiting: "badge-warn",
    resolved: "badge-ok",
  };
  return cls[status] ?? "badge-muted";
}

export function formatTicketMessageRole(
  reply: Pick<SupportTicketReply, "author" | "internal" | "authorName">,
  audience: TicketConversationAudience,
): string {
  if (reply.internal) return "Nota interna";
  if (reply.author === "support") {
    return reply.authorName?.trim() || "Equipo Telvoice";
  }
  return audience === "client" ? "Tú" : "Cliente";
}

export type TicketConversationMessage = {
  id: string;
  author: "client" | "support";
  message: string;
  createdAt: string;
  internal?: boolean;
  authorName?: string;
  isOriginal?: boolean;
};

export function buildTicketConversationMessages(input: {
  originalMessage: string;
  createdAt: string;
  replies: SupportTicketReply[];
  includeInternal: boolean;
}): TicketConversationMessage[] {
  const items: TicketConversationMessage[] = [
    {
      id: "original",
      author: "client",
      message: input.originalMessage,
      createdAt: input.createdAt,
      isOriginal: true,
    },
  ];

  for (const reply of input.replies) {
    if (reply.internal && !input.includeInternal) continue;
    items.push({
      id: reply.id,
      author: reply.internal ? "support" : reply.author,
      message: reply.message,
      createdAt: reply.createdAt,
      internal: reply.internal,
      authorName: reply.authorName,
    });
  }

  return items;
}

function messageBubbleClass(msg: TicketConversationMessage): string {
  if (msg.isOriginal) return "tv-ticket-message tv-ticket-message--original tv-ticket-message--client";
  if (msg.internal) return "tv-ticket-message tv-ticket-message--internal tv-ticket-message--support";
  if (msg.author === "client") return "tv-ticket-message tv-ticket-message--client";
  return "tv-ticket-message tv-ticket-message--support";
}

function messageAlignClass(msg: TicketConversationMessage): string {
  if (msg.internal || msg.author === "support") return "tv-ticket-message--align-start";
  return "tv-ticket-message--align-end";
}

function fmtCompactDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtDayLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function dayKey(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso.slice(0, 10);
  }
}

export function renderTicketMessageBubble(
  msg: TicketConversationMessage,
  audience: TicketConversationAudience,
  formatDateFn: (iso: string) => string = fmtCompactDate,
): string {
  const role = msg.isOriginal
    ? audience === "client"
      ? "Tú"
      : "Cliente"
    : formatTicketMessageRole(msg, audience);
  const badge = msg.isOriginal
    ? '<span class="tv-ticket-message__badge">Mensaje original</span>'
    : msg.internal
      ? '<span class="tv-ticket-message__badge tv-ticket-message__badge--internal">Nota interna</span>'
      : "";
  const avatar =
    msg.author === "support" && !msg.internal
      ? '<span class="tv-ticket-message__avatar" aria-hidden="true"><img src="/assets/telvoice-isotipo.png" alt="" width="20" height="20" /></span>'
      : msg.internal
        ? '<span class="tv-ticket-message__avatar tv-ticket-message__avatar--internal" aria-hidden="true">🔒</span>'
        : "";

  return `<article class="${messageBubbleClass(msg)} ${messageAlignClass(msg)}">
    <div class="tv-ticket-message__meta">
      ${avatar}
      <span class="tv-ticket-message__role">${escapeHtml(role)}</span>
      ${badge}
      <time class="tv-ticket-message__time" datetime="${escapeHtml(msg.createdAt)}">${escapeHtml(formatDateFn(msg.createdAt))}</time>
    </div>
    <div class="tv-ticket-message__bubble">${escapeHtml(msg.message)}</div>
  </article>`;
}

export function renderTicketConversation(
  messages: TicketConversationMessage[],
  audience: TicketConversationAudience,
  formatDateFn?: (iso: string) => string,
): string {
  if (!messages.length) {
    return '<p class="field-hint tv-ticket-chat__empty">Sin mensajes en la conversación.</p>';
  }

  let lastDay = "";
  const parts: string[] = [];

  for (const msg of messages) {
    const dk = dayKey(msg.createdAt);
    if (dk !== lastDay) {
      parts.push(
        `<div class="tv-ticket-chat__day"><span>${escapeHtml(fmtDayLabel(msg.createdAt))}</span></div>`,
      );
      lastDay = dk;
    }
    parts.push(renderTicketMessageBubble(msg, audience, formatDateFn));
  }

  return `<div class="tv-ticket-chat" role="log" aria-live="polite">${parts.join("")}</div>`;
}

export function renderTicketComposerClient(): string {
  return `<div class="tv-ticket-composer tv-ticket-composer--client">
    <label class="tv-ticket-composer__label" for="tv-support-reply-input">Tu respuesta</label>
    <textarea id="tv-support-reply-input" class="tv-input-full tv-ticket-composer__input" rows="3" placeholder="Escribe tu respuesta…"></textarea>
    <div class="tv-ticket-composer__actions">
      <button type="button" class="btn btn-primary btn-sm" id="tv-support-send-reply">Enviar respuesta</button>
      <button type="button" class="btn btn-secondary btn-sm" id="tv-support-resolve-btn">Marcar como resuelto</button>
    </div>
  </div>`;
}

export function supportTicketConversationStyles(): string {
  return `<style>
    .tv-support-drawer__panel,
    .tv-support-admin-drawer__panel {
      width: min(520px, 100%);
    }
    .tv-support-drawer__body,
    .tv-support-admin-drawer__chat {
      padding: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }
    .tv-support-drawer__meta,
    .tv-support-admin-drawer__meta {
      padding: 0.65rem 1.25rem;
      border-bottom: 1px solid var(--tv-border);
      font-size: 0.78rem;
      color: var(--tv-muted);
      background: var(--tv-bg);
    }
    .tv-ticket-chat {
      flex: 1;
      overflow-y: auto;
      padding: 1rem 1.25rem 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      background:
        radial-gradient(circle at 100% 0%, rgba(0, 82, 204, 0.04), transparent 42%),
        radial-gradient(circle at 0% 100%, rgba(14, 165, 233, 0.05), transparent 38%),
        var(--tv-surface);
    }
    .tv-ticket-chat__empty { margin: 1rem 0; text-align: center; }
    .tv-ticket-chat__day {
      display: flex;
      justify-content: center;
      margin: 0.15rem 0 0.35rem;
    }
    .tv-ticket-chat__day span {
      font-size: 0.72rem;
      color: var(--tv-muted);
      background: var(--tv-bg);
      border: 1px solid var(--tv-border);
      border-radius: 999px;
      padding: 0.2rem 0.65rem;
    }
    .tv-ticket-message {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      max-width: 88%;
    }
    .tv-ticket-message--align-start { align-self: flex-start; }
    .tv-ticket-message--align-end { align-self: flex-end; }
    .tv-ticket-message__meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.72rem;
      color: var(--tv-muted);
    }
    .tv-ticket-message--align-end .tv-ticket-message__meta { justify-content: flex-end; }
    .tv-ticket-message__role { font-weight: 700; color: var(--tv-text); }
    .tv-ticket-message__time { opacity: 0.85; }
    .tv-ticket-message__avatar {
      width: 22px;
      height: 22px;
      border-radius: 999px;
      background: #fff;
      border: 1px solid var(--tv-border);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
    }
    .tv-ticket-message__avatar img { display: block; width: 16px; height: 16px; object-fit: contain; }
    .tv-ticket-message__avatar--internal { font-size: 0.65rem; background: #fef9c3; border-color: #fde047; }
    .tv-ticket-message__badge {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      padding: 0.1rem 0.45rem;
      border-radius: 999px;
      background: rgba(0, 82, 204, 0.1);
      color: #0052cc;
    }
    .tv-ticket-message__badge--internal {
      background: #fef9c3;
      color: #854d0e;
    }
    .tv-ticket-message__bubble {
      padding: 0.75rem 0.9rem;
      border-radius: 14px;
      line-height: 1.5;
      font-size: 0.9rem;
      white-space: pre-wrap;
      word-break: break-word;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
    }
    .tv-ticket-message--client .tv-ticket-message__bubble {
      background: linear-gradient(135deg, rgba(0, 82, 204, 0.12), rgba(14, 165, 233, 0.14));
      border: 1px solid rgba(0, 82, 204, 0.18);
      color: #0f172a;
      border-bottom-right-radius: 4px;
    }
    .tv-ticket-message--support .tv-ticket-message__bubble {
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid var(--tv-border);
      color: #0f172a;
      border-bottom-left-radius: 4px;
    }
    .tv-ticket-message--internal .tv-ticket-message__bubble {
      background: #fffbeb;
      border: 1px dashed #fbbf24;
      color: #78350f;
      border-bottom-left-radius: 4px;
    }
    .tv-ticket-message--original .tv-ticket-message__bubble {
      border-style: solid;
    }
    .tv-ticket-composer {
      border-top: 1px solid var(--tv-border);
      padding: 0.85rem 1.25rem 1rem;
      background: var(--tv-surface);
      flex-shrink: 0;
    }
    .tv-ticket-composer__label {
      display: block;
      font-size: 0.78rem;
      font-weight: 600;
      margin-bottom: 0.35rem;
      color: var(--tv-text);
    }
    .tv-ticket-composer__input { min-height: 72px; resize: vertical; }
    .tv-ticket-composer__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.65rem;
    }
    .tv-ticket-composer--admin { display: flex; flex-direction: column; gap: 0.85rem; }
    .tv-ticket-composer--admin .tv-ticket-composer__block {
      padding-top: 0.65rem;
      border-top: 1px dashed var(--tv-border);
    }
    .tv-ticket-composer--admin .tv-ticket-composer__block:first-child {
      border-top: none;
      padding-top: 0;
    }
    .tv-support-admin-drawer__tools {
      padding: 0.85rem 1.25rem 1rem;
      border-top: 1px solid var(--tv-border);
      background: var(--tv-bg);
      overflow-y: auto;
      max-height: 42vh;
    }
    .tv-support-admin-drawer__tools summary {
      cursor: pointer;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--tv-text);
      margin-bottom: 0.5rem;
    }
  </style>`;
}

/** Generador JS inline para el panel cliente (sin bundler). */
export function clientTicketConversationScriptFragment(): string {
  return `
  function formatClientStatusLabel(status, replies) {
    var publicReplies = (replies || []).filter(function (r) { return !r.internal; });
    var last = publicReplies.length ? publicReplies[publicReplies.length - 1] : null;
    if (status === "resolved") return "Resuelto";
    if (status === "open") return "Abierto";
    if (status === "in_review") return "En revisión por Telvoice";
    if (status === "waiting") {
      if (!last || last.author === "client") return "Esperando respuesta de Telvoice";
      return "Esperando tu respuesta";
    }
    return STATUS_LABELS[status] || status;
  }

  function statusBadgeClient(s, replies) {
    var cls = { open: "badge-warn", in_review: "badge-muted", waiting: "badge-warn", resolved: "badge-ok" }[s] || "badge-muted";
    return '<span class="badge ' + cls + '">' + escapeHtml(formatClientStatusLabel(s, replies)) + "</span>";
  }

  function dayKey(iso) {
    try { return new Date(iso).toISOString().slice(0, 10); } catch (e) { return String(iso).slice(0, 10); }
  }

  function dayLabel(iso) {
    try {
      return new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
    } catch (e) { return iso; }
  }

  function renderMessageBubble(msg) {
    var isClient = msg.author === "client" && !msg.internal;
    var align = isClient ? "tv-ticket-message--align-end" : "tv-ticket-message--align-start";
    var kind = msg.isOriginal ? "tv-ticket-message--original tv-ticket-message--client" :
      msg.internal ? "tv-ticket-message--internal tv-ticket-message--support" :
      isClient ? "tv-ticket-message--client" : "tv-ticket-message--support";
    var role = msg.isOriginal ? "Tú" : (msg.internal ? "Nota interna" : (msg.author === "support" ? (msg.authorName || "Equipo Telvoice") : "Tú"));
    var badge = msg.isOriginal ? '<span class="tv-ticket-message__badge">Mensaje original</span>' : "";
    var avatar = (!isClient && !msg.internal)
      ? '<span class="tv-ticket-message__avatar" aria-hidden="true"><img src="/assets/telvoice-isotipo.png" alt="" width="20" height="20" /></span>'
      : "";
    return '<article class="tv-ticket-message ' + kind + ' ' + align + '">' +
      '<div class="tv-ticket-message__meta">' + avatar +
      '<span class="tv-ticket-message__role">' + escapeHtml(role) + '</span>' + badge +
      '<time class="tv-ticket-message__time">' + escapeHtml(fmtDate(msg.createdAt)) + '</time></div>' +
      '<div class="tv-ticket-message__bubble">' + escapeHtml(msg.message) + '</div></article>';
  }

  function renderTicketConversation(t) {
    var messages = [{ id: "original", author: "client", message: t.message, createdAt: t.createdAt, isOriginal: true }];
    (t.replies || []).filter(function (r) { return !r.internal; }).forEach(function (r) {
      messages.push({ id: r.id, author: r.author, message: r.message, createdAt: r.createdAt, authorName: r.authorName });
    });
    if (!messages.length) return '<p class="field-hint tv-ticket-chat__empty">Sin mensajes.</p>';
    var html = "";
    var lastDay = "";
    messages.forEach(function (msg) {
      var dk = dayKey(msg.createdAt);
      if (dk !== lastDay) {
        html += '<div class="tv-ticket-chat__day"><span>' + escapeHtml(dayLabel(msg.createdAt)) + '</span></div>';
        lastDay = dk;
      }
      html += renderMessageBubble(msg);
    });
    return '<div class="tv-ticket-chat" role="log">' + html + '</div>';
  }
  `;
}
