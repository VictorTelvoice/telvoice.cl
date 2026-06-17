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
  audience: SupportTicketConversationAudience,
  ticket: SupportTicketConversationSource,
): string {
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
    return resolveSupportReplyDisplayName(item.authorName);
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

function buildConversationItems(
  ticket: SupportTicketConversationSource,
  audience: SupportTicketConversationAudience,
): ConversationItem[] {
  const items: ConversationItem[] = [
    {
      id: "original",
      author: "client",
      message: ticket.message,
      createdAt: ticket.createdAt,
      isOriginal: true,
    },
  ];
  for (const reply of ticket.replies ?? []) {
    if (audience === "client" && reply.internal) continue;
    items.push({
      id: reply.id,
      author: reply.author,
      internal: reply.internal,
      authorName: reply.authorName,
      message: reply.message,
      createdAt: reply.createdAt,
    });
  }
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function bubbleModifier(item: ConversationItem): string {
  if (item.internal) return "tv-ticket-message--internal";
  if (item.isOriginal) return "tv-ticket-message--original tv-ticket-message--client";
  if (item.author === "support") return "tv-ticket-message--support";
  return "tv-ticket-message--client";
}

export function renderTicketMessageBubble(
  item: ConversationItem,
  audience: SupportTicketConversationAudience,
): string {
  const role = formatTicketMessageRole(item, audience);
  const mod = bubbleModifier(item);
  const badge = item.isOriginal
    ? '<span class="tv-ticket-message__badge">Mensaje original</span>'
    : item.internal
      ? '<span class="tv-ticket-message__badge tv-ticket-message__badge--internal">Nota interna</span>'
      : "";
  const avatar =
    item.author === "support" && !item.internal
      ? `<div class="tv-ticket-message__avatar" aria-hidden="true"><img src="/assets/telvoice-agent-isotipo.png" alt="" width="24" height="24" decoding="async" /></div>`
      : "";

  return `<article class="tv-ticket-message ${mod}" data-message-id="${escapeHtml(item.id)}">
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
  ticket: SupportTicketConversationSource,
  audience: SupportTicketConversationAudience,
): string {
  const items = buildConversationItems(ticket, audience);
  if (!items.length) {
    return `<div class="tv-ticket-chat tv-ticket-chat--empty"><p class="field-hint">Sin mensajes en la conversación.</p></div>`;
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

  return `<div class="tv-ticket-chat" role="log" aria-live="polite" aria-relevant="additions">${chunks.join("")}</div>`;
}

export function getSupportTicketConversationStyles(): string {
  return `
.tv-ticket-chat {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 0.25rem 0 0.5rem;
  min-height: 0;
}
.tv-ticket-chat--empty {
  justify-content: center;
  padding: 1.5rem 0;
  text-align: center;
}
.tv-ticket-chat__day {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.35rem 0;
  color: var(--tv-muted, #64748b);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.tv-ticket-chat__day::before,
.tv-ticket-chat__day::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--tv-border, #e2e8f0);
}
.tv-ticket-chat__day span {
  padding: 0 0.35rem;
  white-space: nowrap;
}
.tv-ticket-message {
  display: flex;
  gap: 0.55rem;
  max-width: 100%;
}
.tv-ticket-message--client {
  flex-direction: row-reverse;
  align-self: flex-end;
  max-width: min(92%, 360px);
}
.tv-ticket-message--support,
.tv-ticket-message--internal,
.tv-ticket-message--original.tv-ticket-message--client {
  align-self: flex-start;
  max-width: min(92%, 380px);
}
.tv-ticket-message__avatar {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  margin-top: 1.35rem;
  border-radius: 999px;
  overflow: hidden;
  background: #e0f2fe;
}
.tv-ticket-message__avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tv-ticket-message__content {
  min-width: 0;
  flex: 1;
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
.tv-ticket-message--client .tv-ticket-message__meta {
  justify-content: flex-end;
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
  padding: 0.75rem 0.9rem;
  border-radius: 14px;
  font-size: 0.88rem;
  line-height: 1.55;
  word-break: break-word;
  white-space: pre-wrap;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.tv-ticket-message--client .tv-ticket-message__bubble {
  background: linear-gradient(145deg, #dbeafe 0%, #e0f2fe 55%, #ecfeff 100%);
  border: 1px solid rgba(14, 165, 233, 0.22);
  color: #0f172a;
  border-bottom-right-radius: 4px;
}
.tv-ticket-message--support .tv-ticket-message__bubble {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.35);
  color: #0f172a;
  border-bottom-left-radius: 4px;
}
.tv-ticket-message--original .tv-ticket-message__bubble {
  border-bottom-right-radius: 4px;
}
.tv-ticket-message--internal {
  max-width: 100%;
  align-self: stretch;
}
.tv-ticket-message--internal .tv-ticket-message__bubble {
  background: #fffbeb;
  border: 1px dashed #fbbf24;
  color: #78350f;
  border-radius: 10px;
}
.tv-support-drawer__panel--chat,
.tv-support-admin-drawer__panel--chat {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tv-support-drawer__conversation,
.tv-support-admin-drawer__conversation {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.75rem 1.25rem 1rem;
  background: linear-gradient(180deg, rgba(241, 245, 249, 0.55) 0%, rgba(248, 250, 252, 0.35) 100%);
}
.tv-support-drawer__meta,
.tv-support-admin-drawer__meta {
  padding: 0.65rem 1.25rem;
  border-bottom: 1px solid var(--tv-border, #e2e8f0);
  font-size: 0.78rem;
  color: var(--tv-muted, #64748b);
  background: var(--tv-surface, #fff);
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
.tv-ticket-composer--admin-public {
  padding-top: 0.85rem;
  border-top: 1px solid var(--tv-border, #e2e8f0);
}
.tv-ticket-composer--admin-internal {
  padding-top: 0;
  border-top: none;
}
.tv-ticket-composer--admin-internal .tv-ticket-composer__label {
  color: #a16207;
}
.tv-support-admin-drawer__manage {
  padding: 1rem 1.25rem 0.25rem;
  border-top: 1px solid var(--tv-border, #e2e8f0);
  background: var(--tv-surface, #fff);
}
`;
}
