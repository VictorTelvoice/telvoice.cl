import type { SupportTicketReply, SupportTicketStatus } from "../../types/support-tickets.js";
import { escapeHtml } from "../../utils/html.js";
import { resolveSupportReplyDisplayName } from "../../utils/supportDisplayName.js";

export type SupportTicketConversationAudience = "client" | "admin";

export type SupportTicketConversationSource = {
  message: string;
  createdAt: string;
  replies?: SupportTicketReply[];
  status: SupportTicketStatus;
};

const BASE_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: "Abierto",
  in_review: "En revisión",
  waiting: "Esperando respuesta",
  resolved: "Resuelto",
};

function publicReplies(replies: SupportTicketReply[] | undefined): SupportTicketReply[] {
  return (replies ?? []).filter((r) => !r.internal);
}

export function getLastPublicReplyAuthor(
  ticket: SupportTicketConversationSource,
): SupportTicketReply["author"] | null {
  const visible = publicReplies(ticket.replies);
  if (!visible.length) return null;
  return visible[visible.length - 1]!.author;
}

export function formatTicketStatusForAudience(
  status: SupportTicketStatus,
  audienceOrReplies: SupportTicketConversationAudience | SupportTicketReply[],
  ticketOrAudience?: SupportTicketConversationSource | SupportTicketConversationAudience,
): string {
  let audience: SupportTicketConversationAudience;
  let ticket: SupportTicketConversationSource;

  if (Array.isArray(audienceOrReplies)) {
    audience = (ticketOrAudience as SupportTicketConversationAudience) ?? "admin";
    ticket = {
      message: "",
      createdAt: "",
      status,
      replies: audienceOrReplies,
    };
  } else {
    audience = audienceOrReplies;
    ticket = ticketOrAudience as SupportTicketConversationSource;
  }

  if (status === "resolved") return "Resuelto";
  if (status === "open") return "Abierto";
  if (status === "in_review") {
    return audience === "client" ? "En revisión por Telvoice" : "En revisión";
  }
  if (status === "waiting") {
    const lastAuthor = getLastPublicReplyAuthor(ticket);
    if (audience === "client") {
      if (lastAuthor === "client") return "Esperando respuesta de Telvoice";
      if (lastAuthor === "support") return "Esperando tu respuesta";
      return "Esperando respuesta";
    }
    if (lastAuthor === "client") return "Pendiente equipo";
    if (lastAuthor === "support") return "Esperando cliente";
    return "Esperando respuesta";
  }
  return BASE_STATUS_LABELS[status] ?? status;
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
  item: {
    author: SupportTicketReply["author"];
    internal?: boolean;
    authorName?: string;
    isOriginal?: boolean;
  },
  audience: SupportTicketConversationAudience,
): string {
  if (item.internal) return "Nota interna";
  if (item.isOriginal) return audience === "client" ? "Tú" : "Cliente";
  if (item.author === "support") {
    return audience === "admin" ? "Tú" : resolveSupportReplyDisplayName(item.authorName);
  }
  return audience === "client" ? "Tú" : "Cliente";
}

function fmtCompactTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtDayLabel(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    if (sameDay) return "Hoy";
    return new Intl.DateTimeFormat("es-CL", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return iso;
  }
}

type ConversationItem = {
  id: string;
  author: SupportTicketReply["author"];
  internal?: boolean;
  authorName?: string;
  message: string;
  createdAt: string;
  isOriginal?: boolean;
};

export function buildTicketConversationMessages(input: {
  originalMessage: string;
  createdAt: string;
  replies: SupportTicketReply[];
  includeInternal: boolean;
}): ConversationItem[] {
  const items: ConversationItem[] = [
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
      internal: reply.internal,
      authorName: reply.authorName,
      message: reply.message,
      createdAt: reply.createdAt,
    });
  }
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function buildConversationItems(
  ticket: SupportTicketConversationSource,
  audience: SupportTicketConversationAudience,
): ConversationItem[] {
  return buildTicketConversationMessages({
    originalMessage: ticket.message,
    createdAt: ticket.createdAt,
    replies: ticket.replies ?? [],
    includeInternal: audience === "admin",
  });
}

function messageClasses(
  item: ConversationItem,
  audience: SupportTicketConversationAudience,
): string {
  const parts = ["tv-ticket-message"];
  if (item.internal) {
    parts.push("tv-ticket-message--internal");
    return parts.join(" ");
  }
  if (item.isOriginal) {
    parts.push("tv-ticket-message--original", "tv-ticket-message--client");
    if (audience === "client") parts.push("tv-ticket-message--self");
    return parts.join(" ");
  }
  if (item.author === "support") {
    parts.push("tv-ticket-message--support");
    if (audience === "admin") parts.push("tv-ticket-message--self");
    return parts.join(" ");
  }
  parts.push("tv-ticket-message--client");
  if (audience === "client") parts.push("tv-ticket-message--self");
  return parts.join(" ");
}

export function renderTicketMessageBubble(
  item: ConversationItem,
  audience: SupportTicketConversationAudience,
): string {
  const role = formatTicketMessageRole(item, audience);
  const mod = messageClasses(item, audience);
  const badge = item.isOriginal
    ? '<span class="tv-ticket-message__badge">Mensaje original</span>'
    : item.internal
      ? '<span class="tv-ticket-message__badge tv-ticket-message__badge--internal">Nota interna</span>'
      : "";
  const showAvatar =
    item.author === "support" && !item.internal && audience === "client";
  const avatar = showAvatar
    ? `<div class="tv-ticket-message__avatar" aria-hidden="true"><img src="/assets/telvoice-isotipo.png" alt="" width="24" height="24" decoding="async" /></div>`
    : item.internal
      ? `<div class="tv-ticket-message__avatar tv-ticket-message__avatar--internal" aria-hidden="true">🔒</div>`
      : "";

  return `<article class="${mod}" data-message-id="${escapeHtml(item.id)}">
    ${avatar}
    <div class="tv-ticket-message__content">
      <div class="tv-ticket-message__meta">
        <span class="tv-ticket-message__role">${escapeHtml(role)}</span>
        ${badge}
        <time class="tv-ticket-message__time" datetime="${escapeHtml(item.createdAt)}">${escapeHtml(fmtCompactTime(item.createdAt))}</time>
      </div>
      <div class="tv-ticket-message__bubble">${escapeHtml(item.message).replace(/\n/g, "<br />")}</div>
    </div>
  </article>`;
}

export function renderTicketConversation(
  ticketOrMessages: SupportTicketConversationSource | ConversationItem[],
  audience: SupportTicketConversationAudience,
): string {
  const items = Array.isArray(ticketOrMessages)
    ? ticketOrMessages
    : buildConversationItems(ticketOrMessages, audience);

  if (!items.length) {
    return `<div class="tv-ticket-chat tv-ticket-chat--empty"><p class="field-hint tv-ticket-chat__empty">Sin mensajes en la conversación.</p></div>`;
  }

  let lastDay = "";
  const chunks: string[] = [];
  for (const item of items) {
    const day = fmtDayLabel(item.createdAt);
    if (day !== lastDay) {
      chunks.push(`<div class="tv-ticket-chat__day"><span>${escapeHtml(day)}</span></div>`);
      lastDay = day;
    }
    chunks.push(renderTicketMessageBubble(item, audience));
  }

  chunks.push('<div class="tv-ticket-chat__bottom" data-ticket-chat-bottom aria-hidden="true"></div>');

  return `<div class="tv-ticket-chat" role="log" aria-live="polite" aria-relevant="additions">${chunks.join("")}</div>`;
}

export function renderTicketDrawerCloseButton(opts?: {
  tag?: "button" | "a";
  href?: string;
  extraClass?: string;
  label?: string;
  /** Atributo data-* para handlers de cierre (default: data-ticket-drawer-close) */
  closeDataAttr?: string;
}): string {
  const tag = opts?.tag ?? "button";
  const label = opts?.label ?? "Cerrar";
  const cls = `tv-ticket-drawer__close ticket-drawer-close${opts?.extraClass ? ` ${opts.extraClass}` : ""}`;
  const glyph = '<span class="ticket-drawer-close__glyph" aria-hidden="true">×</span>';
  const closeAttr = opts?.closeDataAttr ?? "data-ticket-drawer-close";
  if (tag === "a") {
    return `<a href="${escapeHtml(opts?.href ?? "#")}" class="${cls}" ${closeAttr} aria-label="${escapeHtml(label)}">${glyph}</a>`;
  }
  return `<button type="button" class="${cls}" ${closeAttr} aria-label="${escapeHtml(label)}">${glyph}</button>`;
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

export function getTicketChatScrollScript(): string {
  return `
function scrollTicketChatToBottom(root) {
  var scope = root && root.querySelector ? root : document;
  var bottom = scope.querySelector("[data-ticket-chat-bottom]");
  if (!bottom) return;
  requestAnimationFrame(function () {
    bottom.scrollIntoView({ block: "end", behavior: "smooth" });
  });
}
function bindTicketChatAutoScroll(container) {
  if (!container) return;
  scrollTicketChatToBottom(container);
  setTimeout(function () { scrollTicketChatToBottom(container); }, 120);
}
document.querySelectorAll("[data-ticket-chat-root]").forEach(function (root) {
  bindTicketChatAutoScroll(root);
});
`;
}

export function getSupportTicketConversationDrawerStyles(): string {
  return `
.tv-ticket-drawer,
.tv-support-drawer__panel,
.tv-support-admin-drawer__panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: 100vh;
}
.tv-support-drawer__panel,
.tv-support-admin-drawer__panel {
  width: min(520px, 100%);
}
.tv-ticket-drawer__header,
.tv-support-drawer__head,
.tv-support-admin-drawer__head {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--tv-border, #e2e8f0);
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  flex-shrink: 0;
  background: var(--tv-surface, #fff);
  align-items: flex-start;
}
.tv-ticket-drawer__body,
.tv-support-drawer__body,
.tv-support-admin-drawer__chat {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0;
}
.tv-support-drawer__foot,
.tv-ticket-composer {
  flex-shrink: 0;
}
.tv-ticket-drawer__close,
.ticket-drawer-close {
  width: 44px;
  height: 44px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #0f172a;
  cursor: pointer;
  line-height: 1;
  flex-shrink: 0;
  text-decoration: none;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.tv-ticket-drawer__close:hover,
.ticket-drawer-close:hover {
  transform: translateY(-1px);
  border-color: rgba(37, 99, 235, 0.35);
  box-shadow: 0 16px 32px rgba(37, 99, 235, 0.16);
}
.ticket-drawer-close__glyph {
  font-size: 1.35rem;
  font-weight: 400;
  line-height: 1;
  margin-top: -2px;
}
.tv-support-admin-drawer__tools {
  flex-shrink: 0;
  padding: 0.85rem 1.25rem 1rem;
  border-top: 1px solid var(--tv-border, #e2e8f0);
  background: var(--tv-bg, #f8fafc);
  overflow-y: auto;
  max-height: 38vh;
}
.tv-support-admin-drawer__tools summary {
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--tv-text, #0f172a);
  margin-bottom: 0.5rem;
}
.tv-ticket-composer--admin {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.tv-ticket-composer--admin .tv-ticket-composer__block {
  padding-top: 0.65rem;
  border-top: 1px dashed var(--tv-border, #e2e8f0);
}
.tv-ticket-composer--admin .tv-ticket-composer__block:first-child {
  border-top: none;
  padding-top: 0;
}
.tv-ticket-composer__input { min-height: 72px; resize: vertical; }
[data-ticket-chat-root] {
  flex: 1;
  min-height: 0;
}
[data-ticket-chat-root] > * {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
`;
}

export function getSupportTicketConversationStyles(): string {
  return `${getSupportTicketConversationDrawerStyles()}
.tv-ticket-chat {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background:
    radial-gradient(circle at 20% 0%, rgba(59, 130, 246, 0.08), transparent 30%),
    linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%);
}
.tv-ticket-chat--empty,
.tv-ticket-chat__empty {
  justify-content: center;
  text-align: center;
  padding: 1.5rem 0;
}
.tv-ticket-chat__day {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.15rem 0 0.35rem;
  color: var(--tv-muted, #64748b);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.tv-ticket-chat__day::before,
.tv-ticket-chat__day::after {
  content: "";
  flex: 1;
  height: 1px;
  background: rgba(148, 163, 184, 0.35);
}
.tv-ticket-chat__day span {
  padding: 0 0.35rem;
  white-space: nowrap;
}
.tv-ticket-chat__bottom {
  height: 1px;
  flex-shrink: 0;
  scroll-margin-bottom: 12px;
}
.tv-ticket-message {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  max-width: 100%;
}
.tv-ticket-message--self {
  align-self: flex-end;
  flex-direction: row-reverse;
}
.tv-ticket-message--client:not(.tv-ticket-message--self),
.tv-ticket-message--support:not(.tv-ticket-message--self) {
  align-self: flex-start;
}
.tv-ticket-message--internal {
  align-self: center;
  flex-direction: column;
  align-items: center;
  max-width: min(92%, 520px);
}
.tv-ticket-message__content {
  min-width: 0;
  max-width: min(76%, 520px);
}
.tv-ticket-message--self .tv-ticket-message__content {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.tv-ticket-message--internal .tv-ticket-message__content {
  max-width: min(88%, 560px);
  align-items: center;
}
.tv-ticket-message__avatar {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  overflow: hidden;
  background: #e0f2fe;
  border: 1px solid rgba(148, 163, 184, 0.25);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.tv-ticket-message__avatar img {
  display: block;
  width: 18px;
  height: 18px;
  object-fit: contain;
}
.tv-ticket-message__avatar--internal {
  font-size: 0.72rem;
  background: #fef9c3;
  border-color: #fde047;
}
.tv-ticket-message__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.5rem;
  margin-bottom: 0.3rem;
  font-size: 0.72rem;
  color: var(--tv-muted, #64748b);
}
.tv-ticket-message--self .tv-ticket-message__meta {
  justify-content: flex-end;
}
.tv-ticket-message--internal .tv-ticket-message__meta {
  justify-content: center;
}
.tv-ticket-message__role {
  font-weight: 700;
  color: var(--tv-text, #0f172a);
}
.tv-ticket-message__badge {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: rgba(0, 82, 204, 0.1);
  color: #0052cc;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.tv-ticket-message__badge--internal {
  background: rgba(234, 179, 8, 0.18);
  color: #a16207;
}
.tv-ticket-message__time {
  font-variant-numeric: tabular-nums;
}
.tv-ticket-message__bubble {
  padding: 12px 14px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.45;
  word-break: break-word;
  white-space: pre-wrap;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
}
.tv-ticket-message--support:not(.tv-ticket-message--self) .tv-ticket-message__bubble {
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-bottom-left-radius: 6px;
}
.tv-ticket-message--self .tv-ticket-message__bubble,
.tv-ticket-message--client.tv-ticket-message--self .tv-ticket-message__bubble {
  background: linear-gradient(135deg, #dbeafe 0%, #e0f2fe 100%);
  border: 1px solid rgba(59, 130, 246, 0.22);
  border-bottom-right-radius: 6px;
  color: #0f172a;
}
.tv-ticket-message--client:not(.tv-ticket-message--self) .tv-ticket-message__bubble {
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-bottom-left-radius: 6px;
}
.tv-ticket-message--internal .tv-ticket-message__bubble {
  background: #fff7ed;
  border: 1px solid rgba(251, 146, 60, 0.3);
  color: #7c2d12;
  border-radius: 14px;
  box-shadow: none;
}
.tv-ticket-message--original .tv-ticket-message__bubble {
  border-style: solid;
}
.tv-support-drawer__meta,
.tv-support-admin-drawer__meta {
  padding: 0.65rem 1.25rem;
  border-bottom: 1px solid var(--tv-border, #e2e8f0);
  font-size: 0.78rem;
  color: var(--tv-muted, #64748b);
  background: var(--tv-surface, #fff);
  flex-shrink: 0;
}
.tv-ticket-composer {
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--tv-border, #e2e8f0);
  background: var(--tv-surface, #fff);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.tv-ticket-composer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.tv-ticket-composer__label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--tv-text, #0f172a);
  margin-bottom: 0.35rem;
}
.tv-ticket-composer--admin-internal .tv-ticket-composer__label {
  color: #a16207;
}
`;
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
      var d = new Date(iso);
      var today = new Date();
      if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()) return "Hoy";
      return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric" }).format(d);
    } catch (e) { return iso; }
  }

  function fmtCompactTime(iso) {
    try {
      return new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
    } catch (e) { return iso; }
  }

  function scrollTicketChatToBottom(root) {
    var scope = root && root.querySelector ? root : document;
    var bottom = scope.querySelector("[data-ticket-chat-bottom]");
    if (!bottom) return;
    requestAnimationFrame(function () {
      bottom.scrollIntoView({ block: "end", behavior: "smooth" });
    });
  }

  function messageClassesClient(msg) {
    var parts = ["tv-ticket-message"];
    if (msg.internal) return parts.join(" ") + " tv-ticket-message--internal";
    if (msg.isOriginal) return parts.join(" ") + " tv-ticket-message--original tv-ticket-message--client tv-ticket-message--self";
    if (msg.author === "support") return parts.join(" ") + " tv-ticket-message--support";
    return parts.join(" ") + " tv-ticket-message--client tv-ticket-message--self";
  }

  function renderMessageBubble(msg) {
    var isSelf = msg.author === "client" && !msg.internal;
    var role = msg.isOriginal ? "Tú" : (msg.internal ? "Nota interna" : (msg.author === "support" ? (msg.authorName || "Equipo Telvoice") : "Tú"));
    var badge = msg.isOriginal ? '<span class="tv-ticket-message__badge">Mensaje original</span>' : "";
    var avatar = (msg.author === "support" && !msg.internal)
      ? '<div class="tv-ticket-message__avatar" aria-hidden="true"><img src="/assets/telvoice-isotipo.png" alt="" width="24" height="24" /></div>'
      : "";
    return '<article class="' + messageClassesClient(msg) + '">' + avatar +
      '<div class="tv-ticket-message__content"><div class="tv-ticket-message__meta">' +
      '<span class="tv-ticket-message__role">' + escapeHtml(role) + '</span>' + badge +
      '<time class="tv-ticket-message__time">' + escapeHtml(fmtCompactTime(msg.createdAt)) + '</time></div>' +
      '<div class="tv-ticket-message__bubble">' + escapeHtml(msg.message) + '</div></div></article>';
  }

  function renderTicketConversation(t) {
    var messages = [{ id: "original", author: "client", message: t.message, createdAt: t.createdAt, isOriginal: true }];
    (t.replies || []).filter(function (r) { return !r.internal; }).forEach(function (r) {
      messages.push({ id: r.id, author: r.author, message: r.message, createdAt: r.createdAt, authorName: r.authorName });
    });
    if (!messages.length) return '<div class="tv-ticket-chat tv-ticket-chat--empty"><p class="field-hint">Sin mensajes.</p></div>';
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
    html += '<div class="tv-ticket-chat__bottom" data-ticket-chat-bottom aria-hidden="true"></div>';
    return '<div class="tv-ticket-chat" role="log">' + html + '</div>';
  }
  `;
}
