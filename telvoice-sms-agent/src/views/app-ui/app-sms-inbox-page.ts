import {
  inboundSmsStatusLabel,
} from "../../services/inboundSmsService.js";
import { clientNumberStatusLabel, filterClientPanelNumbers } from "../../services/clientNumberService.js";
import type {
  ClientNumberListItem,
  ClientNumberStatus,
  InboundSmsMessageRow,
  InboundSmsStatus,
} from "../../types/client-numbers.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import { renderBtn, renderFilterField } from "../admin-ui/page-kit.js";
import { renderAgentModuleStyles } from "../shared/agent-module-styles.js";
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

function formatInboxTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("es-CL", {
    timeZone: "America/Santiago",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function numberStatusUpper(status: ClientNumberStatus): string {
  const map: Record<ClientNumberStatus, string> = {
    active: "ACTIVO",
    cancelled: "CANCELADO",
    pending_activation: "PENDIENTE",
    available: "DISPONIBLE",
    reserved: "RESERVADO",
    suspended: "SUSPENDIDO",
  };
  return map[status] ?? clientNumberStatusLabel(status).toUpperCase();
}

function numberStatusBadgeCls(status: ClientNumberStatus): string {
  if (status === "active") return "ok";
  if (status === "pending_activation") return "warn";
  if (status === "cancelled") return "muted";
  return "muted";
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
  return `<span class="badge badge-${cls} tv-inbox-status-badge">${escapeHtml(inboundSmsStatusLabel(status).toUpperCase())}</span>`;
}

function buildCountsByNumber(messages: InboundSmsMessageRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of messages) {
    counts.set(m.client_number_id, (counts.get(m.client_number_id) ?? 0) + 1);
  }
  return counts;
}

function renderInboxHeader(filters: SmsInboxFilters): string {
  return `<header class="tv-inbox-page-head">
    <div class="tv-inbox-page-head__main">
      <h1 class="tv-inbox-page-head__title">Bandeja SMS entrantes</h1>
      <p class="tv-inbox-page-head__sub">SMS recibidos en tus numeraciones Telvoice contratadas.</p>
    </div>
    <div class="tv-inbox-page-head__actions">
      <span class="tv-inbox-live-badge tv-inbox-live-badge--ok" id="tv-inbox-live-badge" role="status">
        <span class="tv-inbox-live-badge__dot" aria-hidden="true"></span>
        En tiempo real
      </span>
      ${renderBtn("Exportar CSV", {
        href: `/app/sms-inbox/export.csv${inboxQueryString(filters)}`,
        variant: "secondary",
        icon: "download",
        size: "sm",
      })}
    </div>
  </header>
  <div class="tv-inbox-toast" id="tv-inbox-toast" role="status" aria-live="polite" hidden>
    Nuevo SMS recibido
  </div>`;
}

function renderFiltersPanel(filters: SmsInboxFilters): string {
  const hasFilters = Boolean(
    filters.q || filters.from || filters.startDate || filters.endDate,
  );
  return `<details class="tv-inbox-filters-panel"${hasFilters ? " open" : ""}>
    <summary class="tv-inbox-filters-panel__toggle">
      <span class="material-symbols-outlined" aria-hidden="true">filter_list</span>
      Filtros de búsqueda
    </summary>
    <form method="get" action="/app/sms-inbox" class="tv-inbox-filters">
      ${filters.numberId ? `<input type="hidden" name="number" value="${escapeHtml(filters.numberId)}" />` : ""}
      ${renderFilterField("Buscar", `<input type="search" name="q" class="tv-filter-input" value="${escapeHtml(filters.q ?? "")}" placeholder="Contenido o remitente" />`)}
      ${renderFilterField("Remitente", `<input type="text" name="from" class="tv-filter-input" value="${escapeHtml(filters.from ?? "")}" placeholder="Remitente" />`)}
      ${renderFilterField("Desde", `<input type="date" name="start_date" class="tv-filter-input" value="${escapeHtml(filters.startDate ?? "")}" />`)}
      ${renderFilterField("Hasta", `<input type="date" name="end_date" class="tv-filter-input" value="${escapeHtml(filters.endDate ?? "")}" />`)}
      <div class="tv-inbox-filters__actions">
        ${renderBtn("Filtrar", { type: "submit", variant: "primary", size: "sm" })}
        ${renderBtn("Limpiar", { href: filters.numberId ? `/app/sms-inbox?number=${encodeURIComponent(filters.numberId)}` : "/app/sms-inbox", variant: "ghost", size: "sm" })}
      </div>
    </form>
  </details>`;
}

function renderNumberSidebar(
  numbers: ClientNumberListItem[],
  filters: SmsInboxFilters,
  countsByNumber: Map<string, number>,
  totalCount: number,
): string {
  const allActive = !filters.numberId ? " tv-inbox-nav__item--active" : "";
  const allItem = `<a href="/app/sms-inbox${inboxQueryString({ ...filters, numberId: undefined })}" class="tv-inbox-nav__item${allActive}" data-number-search="todos">
    <span class="tv-inbox-nav__row">
      <span class="tv-inbox-nav__label">Todos los números</span>
      <span class="tv-inbox-nav__count" data-count-all>${totalCount}</span>
    </span>
  </a>`;

  const items = numbers
    .map((n) => {
      const active = filters.numberId === n.id ? " tv-inbox-nav__item--active" : "";
      const statusCls = numberStatusBadgeCls(n.status);
      const count = countsByNumber.get(n.id) ?? 0;
      const countHtml =
        count > 0
          ? `<span class="tv-inbox-nav__count" data-count-for="${escapeHtml(n.id)}">${count}</span>`
          : `<span class="tv-inbox-nav__count tv-inbox-nav__count--zero" data-count-for="${escapeHtml(n.id)}">0</span>`;
      return `<a href="/app/sms-inbox${inboxQueryString({ ...filters, numberId: n.id })}" class="tv-inbox-nav__item${active}" data-number-search="${escapeHtml(n.number.toLowerCase())} ${escapeHtml(n.status)}">
        <span class="tv-inbox-nav__row">
          <span class="tv-inbox-nav__num">${escapeHtml(n.number)}</span>
          ${countHtml}
        </span>
        <span class="badge badge-${statusCls} badge-sm tv-inbox-nav__status">${escapeHtml(numberStatusUpper(n.status))}</span>
      </a>`;
    })
    .join("");

  return `<aside class="tv-inbox-col tv-inbox-col--numbers">
    <div class="tv-inbox-card">
      <header class="tv-inbox-card__head">
        <h2 class="tv-inbox-card__title">Numeraciones</h2>
      </header>
      <div class="tv-inbox-number-search">
        <span class="material-symbols-outlined" aria-hidden="true">search</span>
        <input type="search" id="tv-inbox-number-filter" class="tv-filter-input" placeholder="Buscar número" autocomplete="off" />
      </div>
      <nav class="tv-inbox-nav" id="tv-inbox-number-nav">${allItem}${items}</nav>
    </div>
  </aside>`;
}

export function renderMessageListItemHtml(
  m: InboundSmsMessageRow,
  filters: SmsInboxFilters,
): string {
  const active = filters.selectedId === m.id ? " tv-inbox-msg--active" : "";
  const unread = m.status === "received" ? " tv-inbox-msg--unread" : "";
  const otp = m.detected_otp
    ? `<span class="tv-inbox-msg__otp">OTP: ${escapeHtml(m.detected_otp)}</span>`
    : "";
  const href = `/app/sms-inbox${inboxQueryString(filters, { msg: m.id })}`;
  const statusLabel = inboundSmsStatusLabel(m.status).toUpperCase();
  return `<a href="${escapeHtml(href)}" class="tv-inbox-msg${active}${unread}" data-msg-id="${escapeHtml(m.id)}" data-number-id="${escapeHtml(m.client_number_id)}">
    <div class="tv-inbox-msg__head">
      <strong class="tv-inbox-msg__from">${escapeHtml(m.from_number ?? "Desconocido")}</strong>
      <time class="tv-inbox-msg__time">${formatInboxTime(m.received_at)}</time>
    </div>
    <div class="tv-inbox-msg__to">→ ${escapeHtml(m.to_number)}</div>
    <div class="tv-inbox-msg__body">${escapeHtml(m.body.slice(0, 140))}${m.body.length > 140 ? "…" : ""}</div>
    <div class="tv-inbox-msg__foot">
      ${otp}
      <span class="tv-inbox-msg__status">${escapeHtml(statusLabel)} · ${formatInboxTime(m.received_at)}</span>
    </div>
  </a>`;
}

function renderMessageList(
  messages: InboundSmsMessageRow[],
  filters: SmsInboxFilters,
  hasActiveNumbers: boolean,
): string {
  if (!hasActiveNumbers) {
    return `<div class="tv-inbox-empty tv-inbox-empty--numbers">
      <span class="material-symbols-outlined" aria-hidden="true">sim_card</span>
      <h3>No tienes numeraciones activas</h3>
      <p>Contrata una numeración para comenzar a recibir SMS.</p>
      ${renderBtn("Ver numeraciones", { href: "/app/numeraciones", variant: "primary" })}
    </div>`;
  }

  if (!messages.length) {
    return `<div class="tv-inbox-empty">
      <span class="material-symbols-outlined" aria-hidden="true">mail</span>
      <h3>Aún no tienes SMS entrantes</h3>
      <p>Cuando recibas mensajes en tus numeraciones Telvoice, aparecerán aquí en tiempo real.</p>
      ${renderBtn("Ver mis numeraciones", { href: "/app/numeraciones", variant: "secondary" })}
    </div>`;
  }

  return messages.map((m) => renderMessageListItemHtml(m, filters)).join("");
}

function renderMessageDetail(
  message: InboundSmsMessageRow | null,
  filters: SmsInboxFilters,
): string {
  if (!message) {
    return `<aside class="tv-inbox-col tv-inbox-col--detail">
      <div class="tv-inbox-card tv-inbox-detail tv-inbox-detail--empty">
        <span class="material-symbols-outlined" aria-hidden="true">chat_bubble_outline</span>
        <p>Selecciona un SMS para ver el detalle</p>
      </div>
    </aside>`;
  }

  const markReadForm =
    message.status === "received"
      ? `<form method="post" action="/app/sms-inbox/${encodeURIComponent(message.id)}/read" class="tv-inbox-detail__form">
          <input type="hidden" name="redirect" value="/app/sms-inbox${escapeHtml(inboxQueryString({ ...filters, selectedId: message.id }))}" />
          ${renderBtn("Marcar leído", { type: "submit", size: "sm", variant: "secondary", icon: "done" })}
        </form>`
      : "";

  const otpBlock = message.detected_otp
    ? `<div class="tv-inbox-detail__otp">
        <span class="tv-inbox-detail__otp-label">Código detectado</span>
        <code class="tv-inbox-detail__otp-code" id="tv-otp-code">${escapeHtml(message.detected_otp)}</code>
        <button type="button" class="btn btn-ghost btn-sm" data-copy-target="tv-otp-code" data-copy-label="Copiar código">Copiar código</button>
      </div>`
    : "";

  return `<aside class="tv-inbox-col tv-inbox-col--detail">
    <div class="tv-inbox-card tv-inbox-detail" id="tv-inbox-detail-panel">
      <header class="tv-inbox-detail__head">
        <h2 class="tv-inbox-card__title">Detalle del SMS</h2>
        ${renderStatusBadge(message.status)}
      </header>
      <dl class="tv-inbox-detail__meta">
        <dt>Estado</dt><dd>${renderStatusBadge(message.status)}</dd>
        <dt>ID</dt><dd><code class="tv-inbox-detail__id">${escapeHtml(message.id.slice(0, 8))}…</code></dd>
        <dt>Receptor</dt><dd>${escapeHtml(message.to_number)}</dd>
        <dt>Remitente</dt><dd>${escapeHtml(message.from_number ?? "—")}</dd>
        <dt>Fecha</dt><dd>${formatDate(message.received_at)}</dd>
        <dt>Origen</dt><dd>${escapeHtml(message.source ?? "—")}</dd>
      </dl>
      ${otpBlock}
      <div class="tv-inbox-detail__body-box">
        <p id="tv-sms-body">${escapeHtml(message.body)}</p>
      </div>
      <div class="tv-inbox-detail__actions">
        <button type="button" class="btn btn-secondary btn-sm" data-copy-target="tv-sms-body" data-copy-label="Copiar mensaje">
          <span class="material-symbols-outlined" aria-hidden="true">content_copy</span>
          Copiar mensaje
        </button>
        ${markReadForm}
      </div>
    </div>
  </aside>`;
}

function renderPollingScript(
  messages: InboundSmsMessageRow[],
  filters: SmsInboxFilters,
): string {
  const latestAt = messages[0]?.received_at ?? "";
  const knownIds = messages.map((m) => m.id);
  const pollParams = new URLSearchParams();
  if (filters.numberId) pollParams.set("number_id", filters.numberId);
  if (filters.q) pollParams.set("q", filters.q);
  if (filters.from) pollParams.set("from", filters.from);
  if (filters.startDate) pollParams.set("start_date", filters.startDate);
  if (filters.endDate) pollParams.set("end_date", filters.endDate);
  const pollBase = `/api/app/sms-inbox/messages${pollParams.toString() ? `?${pollParams}` : ""}`;

  return `<script>
(function() {
  var POLL_MS = 7000;
  var root = document.getElementById("tv-sms-inbox-root");
  if (!root) return;

  var listEl = document.getElementById("tv-sms-inbox-msg-list");
  var badge = document.getElementById("tv-inbox-live-badge");
  var toast = document.getElementById("tv-inbox-toast");
  var knownIds = new Set(${JSON.stringify(knownIds)});
  var latestAt = ${JSON.stringify(latestAt)};
  var pollBase = ${JSON.stringify(pollBase)};
  var pollTimer = null;
  var filters = ${JSON.stringify({ msg: filters.selectedId, number: filters.numberId })};

  function buildPollUrl() {
    var sep = pollBase.indexOf("?") >= 0 ? "&" : "?";
    return pollBase + (latestAt ? sep + "after=" + encodeURIComponent(latestAt) : "");
  }

  function setBadge(state) {
    if (!badge) return;
    badge.classList.remove("tv-inbox-live-badge--ok", "tv-inbox-live-badge--warn");
    if (state === "ok") {
      badge.classList.add("tv-inbox-live-badge--ok");
      badge.innerHTML = '<span class="tv-inbox-live-badge__dot" aria-hidden="true"></span> En tiempo real';
    } else {
      badge.classList.add("tv-inbox-live-badge--warn");
      badge.textContent = "Reconectando…";
    }
  }

  function showToast() {
    if (!toast) return;
    toast.hidden = false;
    toast.classList.add("tv-inbox-toast--visible");
    setTimeout(function() {
      toast.classList.remove("tv-inbox-toast--visible");
      setTimeout(function() { toast.hidden = true; }, 300);
    }, 3200);
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour: "numeric", minute: "2-digit", hour12: true });
    } catch (e) { return ""; }
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  function buildMsgHref(id) {
    var p = new URLSearchParams(window.location.search);
    p.set("msg", id);
    return "/app/sms-inbox?" + p.toString();
  }

  function renderMsgItem(m) {
    var active = filters.msg === m.id ? " tv-inbox-msg--active" : "";
    var unread = m.status === "received" ? " tv-inbox-msg--unread" : "";
    var otp = m.detected_otp ? '<span class="tv-inbox-msg__otp">OTP: ' + esc(m.detected_otp) + "</span>" : "";
    var body = esc((m.body || "").slice(0, 140)) + ((m.body || "").length > 140 ? "…" : "");
    var t = formatTime(m.received_at);
    return '<a href="' + esc(buildMsgHref(m.id)) + '" class="tv-inbox-msg' + active + unread + '" data-msg-id="' + esc(m.id) + '" data-number-id="' + esc(m.client_number_id) + '">' +
      '<div class="tv-inbox-msg__head"><strong class="tv-inbox-msg__from">' + esc(m.from_number || "Desconocido") + '</strong><time class="tv-inbox-msg__time">' + esc(t) + '</time></div>' +
      '<div class="tv-inbox-msg__to">→ ' + esc(m.to_number) + '</div>' +
      '<div class="tv-inbox-msg__body">' + body + '</div>' +
      '<div class="tv-inbox-msg__foot">' + otp + '<span class="tv-inbox-msg__status">RECIBIDO · ' + esc(t) + '</span></div></a>';
  }

  function updateCounts(counts) {
    if (!counts) return;
    Object.keys(counts).forEach(function(nid) {
      var el = document.querySelector('[data-count-for="' + nid + '"]');
      if (el) {
        el.textContent = String(counts[nid]);
        el.classList.toggle("tv-inbox-nav__count--zero", counts[nid] === 0);
      }
    });
    var allEl = document.querySelector("[data-count-all]");
    if (allEl) {
      var sum = Object.values(counts).reduce(function(a, b) { return a + b; }, 0);
      allEl.textContent = String(sum);
    }
  }

  function prependMessages(newOnes) {
    if (!listEl || !newOnes.length) return;
    var empty = listEl.querySelector(".tv-inbox-empty");
    if (empty) empty.remove();
    var frag = document.createDocumentFragment();
    var div = document.createElement("div");
    newOnes.forEach(function(m) {
      div.innerHTML = renderMsgItem(m);
      frag.appendChild(div.firstChild);
    });
    listEl.insertBefore(frag, listEl.firstChild);
  }

  function poll() {
    fetch(buildPollUrl(), { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function(r) { if (!r.ok) throw new Error("poll"); return r.json(); })
      .then(function(data) {
        if (!data.ok) throw new Error("poll");
        setBadge("ok");
        var incoming = (data.messages || []).filter(function(m) { return !knownIds.has(m.id); });
        if (incoming.length) {
          incoming.sort(function(a, b) { return b.received_at.localeCompare(a.received_at); });
          incoming.forEach(function(m) { knownIds.add(m.id); });
          prependMessages(incoming);
          latestAt = data.latest_received_at || incoming[0].received_at || latestAt;
          updateCounts(data.counts_by_number);
          showToast();
        } else if (data.latest_received_at && data.latest_received_at > latestAt) {
          latestAt = data.latest_received_at;
        }
      })
      .catch(function() { setBadge("warn"); });
  }

  function startPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(poll, POLL_MS);
    poll();
  }

  function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "hidden") stopPoll();
    else startPoll();
  });

  startPoll();

  var numFilter = document.getElementById("tv-inbox-number-filter");
  if (numFilter) {
    numFilter.addEventListener("input", function() {
      var q = numFilter.value.toLowerCase().trim();
      document.querySelectorAll("#tv-inbox-number-nav .tv-inbox-nav__item").forEach(function(el) {
        var hay = (el.getAttribute("data-number-search") || "").toLowerCase();
        el.style.display = !q || hay.indexOf(q) >= 0 ? "" : "none";
      });
    });
  }

  document.querySelectorAll("[data-copy-target]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var id = btn.getAttribute("data-copy-target");
      var el = document.getElementById(id);
      if (!el) return;
      var label = btn.getAttribute("data-copy-label") || btn.textContent;
      navigator.clipboard.writeText((el.textContent || "").trim()).then(function() {
        btn.textContent = "Copiado";
        setTimeout(function() { btn.textContent = label; }, 1500);
      });
    });
  });
})();
</script>`;
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
  const sidebarNumbers = filterClientPanelNumbers(data.numbers);
  const countsByNumber = buildCountsByNumber(data.messages);
  const hasActiveNumbers = sidebarNumbers.some((n) => n.status === "active");
  const latestAt = data.messages[0]?.received_at ?? "";

  const body = `
    ${renderInboxHeader(filters)}
    ${renderFiltersPanel(filters)}
    <div class="tv-inbox-shell" id="tv-sms-inbox-root"
         data-latest-at="${escapeHtml(latestAt)}"
         data-known-ids="${escapeHtml(JSON.stringify(data.messages.map((m) => m.id)))}">
      <div class="tv-inbox-layout">
        ${renderNumberSidebar(sidebarNumbers, filters, countsByNumber, data.messages.length)}
        <section class="tv-inbox-col tv-inbox-col--messages">
          <div class="tv-inbox-card tv-inbox-card--messages">
            <header class="tv-inbox-card__head tv-inbox-card__head--row">
              <h2 class="tv-inbox-card__title">Mensajes recibidos</h2>
              <span class="tv-inbox-sort-label">Más recientes</span>
            </header>
            <div class="tv-inbox-msg-list" id="tv-sms-inbox-msg-list">
              ${renderMessageList(data.messages, filters, hasActiveNumbers)}
            </div>
          </div>
        </section>
        ${renderMessageDetail(data.selectedMessage, filters)}
      </div>
    </div>
    ${renderPollingScript(data.messages, filters)}
    ${renderAgentModuleStyles()}`;

  return wrapAppPage(ctx, "sms-inbox", "Bandeja SMS", body, {
    bodyClass: "tv-page--sms-inbox",
  });
}
