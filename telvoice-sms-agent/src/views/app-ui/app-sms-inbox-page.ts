import { inboundSmsStatusLabel } from "../../services/inboundSmsService.js";
import { clientNumberStatusLabel } from "../../services/clientNumberService.js";
import type {
  ClientNumberListItem,
  InboundSmsMessageRow,
  InboundSmsStatus,
} from "../../types/client-numbers.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import { renderBtn, renderFilterField, renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";

export type SmsInboxFilters = {
  numberId?: string;
  q?: string;
  from?: string;
  startDate?: string;
  endDate?: string;
  status?: InboundSmsStatus | "";
  selectedId?: string;
};

export function parseSmsInboxFilters(
  query: Record<string, string | string[] | undefined>,
): SmsInboxFilters {
  const str = (key: string): string | undefined => {
    const v = query[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    return undefined;
  };
  const status = str("status") as InboundSmsStatus | undefined;
  const allowed: InboundSmsStatus[] = [
    "received",
    "read",
    "archived",
    "forwarded",
    "failed",
  ];
  return {
    numberId: str("number"),
    q: str("q"),
    from: str("from"),
    startDate: str("start_date"),
    endDate: str("end_date"),
    status: status && allowed.includes(status) ? status : "",
    selectedId: str("msg"),
  };
}

function inboxQueryString(filters: SmsInboxFilters, extra?: Record<string, string>): string {
  const p = new URLSearchParams();
  if (filters.numberId) p.set("number", filters.numberId);
  if (filters.q) p.set("q", filters.q);
  if (filters.from) p.set("from", filters.from);
  if (filters.startDate) p.set("start_date", filters.startDate);
  if (filters.endDate) p.set("end_date", filters.endDate);
  if (filters.status) p.set("status", filters.status);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

function renderStatusBadge(status: InboundSmsStatus): string {
  const clsMap: Record<InboundSmsStatus, string> = {
    received: "warn",
    read: "ok",
    archived: "muted",
    forwarded: "ok",
    failed: "err",
  };
  const cls = clsMap[status] ?? "muted";
  return `<span class="badge badge-${cls}">${escapeHtml(inboundSmsStatusLabel(status))}</span>`;
}

function renderNumberSidebar(
  numbers: ClientNumberListItem[],
  filters: SmsInboxFilters,
): string {
  const allActive = !filters.numberId ? " tv-sms-inbox-nav__item--active" : "";
  const allItem = `<a href="/app/sms-inbox${inboxQueryString({ ...filters, numberId: undefined })}" class="tv-sms-inbox-nav__item${allActive}">
    <span class="material-symbols-outlined" aria-hidden="true">inbox</span>
    Todos los números
  </a>`;

  const items = numbers
    .map((n) => {
      const active = filters.numberId === n.id ? " tv-sms-inbox-nav__item--active" : "";
      const statusCls =
        n.status === "active" ? "ok" : n.status === "pending_activation" ? "warn" : "muted";
      return `<a href="/app/sms-inbox${inboxQueryString({ ...filters, numberId: n.id })}" class="tv-sms-inbox-nav__item${active}">
        <span class="tv-sms-inbox-nav__num">${escapeHtml(n.number)}</span>
        <span class="badge badge-${statusCls} badge-sm">${escapeHtml(clientNumberStatusLabel(n.status))}</span>
      </a>`;
    })
    .join("");

  return `<aside class="tv-sms-inbox-sidebar">
    <h3 class="tv-sms-inbox-sidebar__title">Números</h3>
    <nav class="tv-sms-inbox-nav">${allItem}${items}</nav>
  </aside>`;
}

function renderMessageList(
  messages: InboundSmsMessageRow[],
  filters: SmsInboxFilters,
): string {
  if (!messages.length) {
    return `<div class="tv-sms-inbox-empty">
      <span class="material-symbols-outlined" aria-hidden="true">mail</span>
      <h3>Aún no hay SMS recibidos</h3>
      <p>Cuando tus numeraciones Telvoice reciban mensajes, aparecerán aquí con fecha, remitente, contenido y trazabilidad.</p>
    </div>`;
  }

  return messages
    .map((m) => {
      const active = filters.selectedId === m.id ? " tv-sms-inbox-msg--active" : "";
      const unread = m.status === "received" ? " tv-sms-inbox-msg--unread" : "";
      const otp = m.detected_otp
        ? `<span class="tv-sms-inbox-msg__otp">OTP: ${escapeHtml(m.detected_otp)}</span>`
        : "";
      const href = `/app/sms-inbox${inboxQueryString(filters, { msg: m.id })}`;
      return `<a href="${escapeHtml(href)}" class="tv-sms-inbox-msg${active}${unread}">
        <div class="tv-sms-inbox-msg__head">
          <strong>${escapeHtml(m.from_number ?? "Desconocido")}</strong>
          <time>${formatDate(m.received_at)}</time>
        </div>
        <div class="tv-sms-inbox-msg__to">→ ${escapeHtml(m.to_number)}</div>
        <div class="tv-sms-inbox-msg__body">${escapeHtml(m.body.slice(0, 120))}${m.body.length > 120 ? "…" : ""}</div>
        ${otp}
      </a>`;
    })
    .join("");
}

function renderMessageDetail(
  message: InboundSmsMessageRow | null,
  filters: SmsInboxFilters,
): string {
  if (!message) {
    return `<div class="tv-sms-inbox-detail tv-sms-inbox-detail--empty">
      <p>Selecciona un mensaje para ver el detalle.</p>
    </div>`;
  }

  const markReadForm = message.status === "received"
    ? `<form method="post" action="/app/sms-inbox/${encodeURIComponent(message.id)}/read" style="display:inline">
        <input type="hidden" name="redirect" value="/app/sms-inbox${escapeHtml(inboxQueryString({ ...filters, selectedId: message.id }))}" />
        ${renderBtn("Marcar leído", { type: "submit", size: "sm", variant: "secondary" })}
      </form>`
    : "";

  const otpBlock = message.detected_otp
    ? `<div class="tv-sms-inbox-detail__otp">
        <span class="tv-sms-inbox-detail__otp-label">Código detectado</span>
        <code class="tv-sms-inbox-detail__otp-code" id="tv-otp-code">${escapeHtml(message.detected_otp)}</code>
        <button type="button" class="btn btn-ghost btn-sm" data-copy-target="tv-otp-code">Copiar código</button>
      </div>`
    : "";

  return `<aside class="tv-sms-inbox-detail">
    <header class="tv-sms-inbox-detail__head">
      <h3>Detalle del SMS</h3>
      ${renderStatusBadge(message.status)}
    </header>
    <dl class="tv-sms-inbox-detail__meta">
      <dt>ID</dt><dd><code>${escapeHtml(message.id)}</code></dd>
      <dt>Receptor</dt><dd>${escapeHtml(message.to_number)}</dd>
      <dt>Remitente</dt><dd>${escapeHtml(message.from_number ?? "—")}</dd>
      <dt>Fecha</dt><dd>${formatDate(message.received_at)}</dd>
      <dt>Origen</dt><dd>${escapeHtml(message.source ?? "—")}</dd>
    </dl>
    ${otpBlock}
    <div class="tv-sms-inbox-detail__body">
      <p id="tv-sms-body">${escapeHtml(message.body)}</p>
    </div>
    <div class="tv-sms-inbox-detail__actions">
      <button type="button" class="btn btn-secondary btn-sm" data-copy-target="tv-sms-body">Copiar mensaje</button>
      ${markReadForm}
    </div>
  </aside>`;
}

export type AppSmsInboxPageData = {
  numbers: ClientNumberListItem[];
  messages: InboundSmsMessageRow[];
  filters: SmsInboxFilters;
  selectedMessage: InboundSmsMessageRow | null;
};

export function renderAppSmsInboxPage(
  ctx: AppPageContext,
  data: AppSmsInboxPageData,
): string {
  const filters = data.filters;

  const filtersPanel = `
    <form method="get" action="/app/sms-inbox" class="tv-sms-inbox-filters">
      ${filters.numberId ? `<input type="hidden" name="number" value="${escapeHtml(filters.numberId)}" />` : ""}
      ${renderFilterField("Buscar", `<input type="search" name="q" class="tv-filter-input" value="${escapeHtml(filters.q ?? "")}" placeholder="Contenido o remitente" />`)}
      ${renderFilterField("Remitente", `<input type="text" name="from" class="tv-filter-input" value="${escapeHtml(filters.from ?? "")}" placeholder="+56..." />`)}
      ${renderFilterField("Desde", `<input type="date" name="start_date" class="tv-filter-input" value="${escapeHtml(filters.startDate ?? "")}" />`)}
      ${renderFilterField("Hasta", `<input type="date" name="end_date" class="tv-filter-input" value="${escapeHtml(filters.endDate ?? "")}" />`)}
      ${renderBtn("Filtrar", { type: "submit", variant: "secondary", size: "sm" })}
      ${renderBtn("Exportar CSV", { href: `/app/sms-inbox/export.csv${inboxQueryString(filters)}`, variant: "ghost", size: "sm", icon: "download" })}
    </form>`;

  const body = `
    ${renderPageHeader({
      title: "Bandeja SMS entrantes",
      subtitle: "SMS recibidos en tus numeraciones Telvoice contratadas.",
      actions: renderBtn("Mis números", { href: "/app/numeraciones", variant: "secondary", icon: "sim_card" }),
    })}
    ${filtersPanel}
    <div class="tv-sms-inbox-layout">
      ${renderNumberSidebar(data.numbers, filters)}
      <main class="tv-sms-inbox-list">
        ${renderMessageList(data.messages, filters)}
      </main>
      ${renderMessageDetail(data.selectedMessage, filters)}
    </div>
    <script>
      document.querySelectorAll("[data-copy-target]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var id = btn.getAttribute("data-copy-target");
          var el = document.getElementById(id);
          if (!el) return;
          var text = el.textContent || "";
          navigator.clipboard.writeText(text.trim()).then(function() {
            btn.textContent = "Copiado";
            setTimeout(function() { btn.textContent = btn.dataset.copyLabel || "Copiar"; }, 1500);
          });
        });
        btn.dataset.copyLabel = btn.textContent;
      });
    </script>
    <style>
      .tv-sms-inbox-filters { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; margin-bottom: 1rem; }
      .tv-sms-inbox-layout { display: grid; grid-template-columns: 220px 1fr 320px; gap: 1rem; min-height: 28rem; }
      @media (max-width: 1100px) { .tv-sms-inbox-layout { grid-template-columns: 1fr; } .tv-sms-inbox-detail { order: 3; } }
      .tv-sms-inbox-sidebar { background: var(--tv-panel-bg, rgba(255,255,255,0.04)); border-radius: 8px; padding: 1rem; }
      .tv-sms-inbox-sidebar__title { font-size: 0.85rem; margin: 0 0 0.75rem; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em; }
      .tv-sms-inbox-nav { display: flex; flex-direction: column; gap: 0.35rem; }
      .tv-sms-inbox-nav__item { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.5rem 0.65rem; border-radius: 6px; text-decoration: none; color: inherit; font-size: 0.9rem; }
      .tv-sms-inbox-nav__item:hover, .tv-sms-inbox-nav__item--active { background: rgba(255,255,255,0.06); }
      .tv-sms-inbox-list { background: var(--tv-panel-bg, rgba(255,255,255,0.04)); border-radius: 8px; overflow-y: auto; max-height: 32rem; }
      .tv-sms-inbox-msg { display: block; padding: 0.85rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.06); text-decoration: none; color: inherit; }
      .tv-sms-inbox-msg--active { background: rgba(255,255,255,0.08); }
      .tv-sms-inbox-msg--unread { border-left: 3px solid var(--tv-accent, #3b82f6); }
      .tv-sms-inbox-msg__head { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.9rem; }
      .tv-sms-inbox-msg__to { font-size: 0.8rem; opacity: 0.65; margin: 0.15rem 0; }
      .tv-sms-inbox-msg__body { font-size: 0.85rem; opacity: 0.85; }
      .tv-sms-inbox-msg__otp { display: inline-block; margin-top: 0.35rem; font-size: 0.8rem; padding: 0.15rem 0.5rem; border-radius: 4px; background: rgba(59,130,246,0.15); }
      .tv-sms-inbox-empty { text-align: center; padding: 3rem 1.5rem; opacity: 0.8; }
      .tv-sms-inbox-empty .material-symbols-outlined { font-size: 2.5rem; opacity: 0.5; }
      .tv-sms-inbox-detail { background: var(--tv-panel-bg, rgba(255,255,255,0.04)); border-radius: 8px; padding: 1rem; }
      .tv-sms-inbox-detail--empty { display: flex; align-items: center; justify-content: center; opacity: 0.6; }
      .tv-sms-inbox-detail__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
      .tv-sms-inbox-detail__meta { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 1rem; font-size: 0.85rem; margin-bottom: 1rem; }
      .tv-sms-inbox-detail__meta dt { opacity: 0.65; }
      .tv-sms-inbox-detail__otp { margin-bottom: 1rem; padding: 0.75rem; border-radius: 6px; background: rgba(59,130,246,0.1); }
      .tv-sms-inbox-detail__otp-code { font-size: 1.25rem; font-weight: 700; letter-spacing: 0.1em; }
      .tv-sms-inbox-detail__body { margin-bottom: 1rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
      .tv-sms-inbox-detail__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    </style>`;

  return wrapAppPage(ctx, "sms-inbox", "Bandeja SMS", body);
}
