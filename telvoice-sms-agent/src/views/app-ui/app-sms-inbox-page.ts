import {
  inboundSmsStatusLabel,
} from "../../services/inboundSmsService.js";
import { filterClientPanelNumbers } from "../../services/clientNumberService.js";
import type {
  ClientNumberListItem,
  InboundSmsMessageRow,
  InboundSmsStatus,
} from "../../types/client-numbers.js";
import { escapeHtml } from "../../utils/html.js";
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

function formatInboxDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function chileTodayBounds(): { start: string; end: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return {
    start: `${y}-${m}-${d}T00:00:00.000-03:00`,
    end: `${y}-${m}-${d}T23:59:59.999-03:00`,
  };
}

function isTodayInChile(iso: string): boolean {
  const { start, end } = chileTodayBounds();
  const t = new Date(iso).getTime();
  return t >= new Date(start).getTime() && t <= new Date(end).getTime();
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
  return `<span class="badge badge-${cls} tv-sms-in-status">${escapeHtml(inboundSmsStatusLabel(status))}</span>`;
}

function renderSourceBadge(source: string | null): string {
  if (source === "simulation") {
    return `<span class="tv-sms-in-source tv-sms-in-source--sim">Simulación</span>`;
  }
  return "";
}

function resolveSelectedNumber(
  numbers: ClientNumberListItem[],
  filters: SmsInboxFilters,
): ClientNumberListItem | null {
  const active = numbers.filter((n) => n.status === "active");
  if (filters.numberId) {
    return numbers.find((n) => n.id === filters.numberId) ?? null;
  }
  if (active.length === 1) return active[0] ?? null;
  return null;
}

function renderStatsCards(
  numbers: ClientNumberListItem[],
  messages: InboundSmsMessageRow[],
  selectedNumber: ClientNumberListItem | null,
): string {
  const activeCount = numbers.filter((n) => n.status === "active").length;
  const scopedMessages = selectedNumber
    ? messages.filter((m) => m.client_number_id === selectedNumber.id)
    : messages;
  const todayCount = scopedMessages.filter((m) => isTodayInChile(m.received_at)).length;
  const lastMsg = scopedMessages[0];
  const receptionOk = activeCount > 0;

  const lastLabel = lastMsg
    ? `${formatInboxDateTime(lastMsg.received_at)} · ${lastMsg.from_number ?? "Desconocido"}`
    : "Sin mensajes aún";

  const fourthLabel =
    selectedNumber && activeCount > 1 ? "Línea en vista" : "Estado de recepción";
  const fourthValue =
    selectedNumber && activeCount > 1
      ? selectedNumber.number
      : receptionOk
        ? "Recepción activa"
        : "Sin numeración activa";
  const fourthExtraCls =
    receptionOk && activeCount <= 1 ? " tv-sms-in-reception--ok" : "";

  return `<div class="tv-sms-in-stats">
    <article class="tv-sms-in-stat">
      <span class="tv-sms-in-stat__icon material-symbols-outlined" aria-hidden="true">sim_card</span>
      <div>
        <p class="tv-sms-in-stat__label">Numeraciones activas</p>
        <p class="tv-sms-in-stat__value">${activeCount}</p>
      </div>
    </article>
    <article class="tv-sms-in-stat">
      <span class="tv-sms-in-stat__icon material-symbols-outlined" aria-hidden="true">today</span>
      <div>
        <p class="tv-sms-in-stat__label">SMS recibidos hoy</p>
        <p class="tv-sms-in-stat__value">${todayCount}</p>
      </div>
    </article>
    <article class="tv-sms-in-stat tv-sms-in-stat--wide">
      <span class="tv-sms-in-stat__icon material-symbols-outlined" aria-hidden="true">schedule</span>
      <div>
        <p class="tv-sms-in-stat__label">Último SMS recibido</p>
        <p class="tv-sms-in-stat__value tv-sms-in-stat__value--sm" id="tv-sms-in-last">${escapeHtml(lastLabel)}</p>
      </div>
    </article>
    <article class="tv-sms-in-stat">
      <span class="tv-sms-in-stat__icon material-symbols-outlined" aria-hidden="true">cell_tower</span>
      <div>
        <p class="tv-sms-in-stat__label">${escapeHtml(fourthLabel)}</p>
        <p class="tv-sms-in-stat__value tv-sms-in-stat__value--sm${fourthExtraCls}" id="tv-sms-in-reception">
          ${escapeHtml(fourthValue)}
        </p>
      </div>
    </article>
  </div>`;
}

function renderLineSelectorBar(
  activeNumbers: ClientNumberListItem[],
  selectedNumber: ClientNumberListItem | null,
): string {
  if (activeNumbers.length < 2) return "";

  const options = activeNumbers
    .map((n) => {
      const sel = selectedNumber?.id === n.id ? " selected" : "";
      return `<option value="${escapeHtml(n.id)}"${sel}>${escapeHtml(n.number)}</option>`;
    })
    .join("");

  return `<div class="tv-sms-in-line-bar">
    <div class="tv-sms-in-line-bar__label">
      <span class="material-symbols-outlined" aria-hidden="true">dialpad</span>
      <span>Línea en revisión</span>
    </div>
    <select id="tv-sms-in-number-id" class="tv-filter-input tv-sms-in-select" aria-label="Seleccionar numeración">
      ${options}
    </select>
  </div>`;
}

function renderSimulateNumberField(
  numbers: ClientNumberListItem[],
  selectedNumber: ClientNumberListItem | null,
): string {
  const active = numbers.filter((n) => n.status === "active");
  if (!active.length) return "";

  if (active.length === 1 && active[0]) {
    const n = active[0];
    return `<div class="tv-sms-in-number-single">
      <span class="tv-sms-in-number-single__label">Numeración destino</span>
      <strong class="tv-sms-in-number-single__value">${escapeHtml(n.number)}</strong>
      <input type="hidden" id="tv-sms-in-number-id" value="${escapeHtml(n.id)}" />
    </div>`;
  }

  const line = selectedNumber?.number ?? "—";
  const id = selectedNumber?.id ?? "";
  return `<div class="tv-sms-in-number-single tv-sms-in-number-single--linked">
    <span class="tv-sms-in-number-single__label">Numeración destino</span>
    <strong class="tv-sms-in-number-single__value">${escapeHtml(line)}</strong>
    <input type="hidden" id="tv-sms-in-sim-number-id" value="${escapeHtml(id)}" />
    <p class="field-hint">Usa el selector superior para cambiar de línea.</p>
  </div>`;
}

function renderSimulateForm(
  numbers: ClientNumberListItem[],
  selectedNumber: ClientNumberListItem | null,
): string {
  const active = numbers.filter((n) => n.status === "active");
  if (!active.length) return "";

  return `<section class="tv-sms-in-panel tv-sms-in-panel--simulate">
    <header class="tv-sms-in-panel__head">
      <h2 class="tv-sms-in-panel__title">
        <span class="material-symbols-outlined" aria-hidden="true">science</span>
        Simular SMS entrante
      </h2>
      <p class="tv-sms-in-panel__sub">Prueba la recepción en tu numeración. Los envíos de prueba se distinguen con el badge <strong>Simulación</strong>.</p>
    </header>
    <form id="tv-sms-in-simulate-form" class="tv-sms-in-simulate-form" novalidate>
      ${renderSimulateNumberField(numbers, selectedNumber)}
      <div class="tv-sms-in-simulate-grid">
        ${renderFilterField("Número remitente", `<input type="tel" id="tv-sms-in-from" name="from" class="tv-filter-input" placeholder="+56912345678" required autocomplete="off" />`)}
        ${renderFilterField("Mensaje recibido", `<textarea id="tv-sms-in-body" name="body" class="tv-filter-input tv-sms-in-textarea" rows="3" placeholder="Escribe el contenido del SMS entrante…" required></textarea>`)}
      </div>
      <div class="tv-sms-in-simulate-actions">
        ${renderBtn("Simular SMS entrante", { type: "submit", variant: "primary", icon: "send" })}
        <p class="tv-sms-in-simulate-error" id="tv-sms-in-simulate-error" role="alert" hidden></p>
      </div>
    </form>
  </section>`;
}

function renderPhoneFeedItem(m: InboundSmsMessageRow, isLatest: boolean): string {
  const from = m.from_number?.trim() || "Desconocido";
  return `<div class="tv-sms-in-feed__item${isLatest ? " tv-sms-in-feed__item--latest" : ""}" data-msg-id="${escapeHtml(m.id)}">
    <div class="tv-hero-phone__bubble tv-hero-phone__bubble--in tv-sms-in-bubble">${escapeHtml(m.body)}</div>
    <div class="tv-sms-in-feed__meta">
      <span class="tv-sms-in-feed__from">${escapeHtml(from)}</span>
      <span aria-hidden="true">·</span>
      <time datetime="${escapeHtml(m.received_at)}">${escapeHtml(formatInboxTime(m.received_at))}</time>
      ${renderSourceBadge(m.source)}
    </div>
  </div>`;
}

function renderPhoneMockup(
  selectedNumber: ClientNumberListItem | null,
  phoneMessages: InboundSmsMessageRow[],
): string {
  const lineLabel = selectedNumber?.number ?? "Sin numeración";
  const receptionCls = selectedNumber?.status === "active"
    ? "tv-sms-in-phone-status--ok"
    : "";
  const receptionLabel = selectedNumber?.status === "active"
    ? "Recepción activa"
    : "Selecciona numeración";

  const feed =
    phoneMessages.length > 0
      ? phoneMessages
          .slice()
          .reverse()
          .map((m, i, arr) => renderPhoneFeedItem(m, i === arr.length - 1))
          .join("")
      : `<p class="tv-sms-in-feed__empty" id="tv-sms-in-feed-empty">Aún no hay SMS entrantes para esta numeración.</p>`;

  return `<aside class="tv-sms-in-phone-col">
    <div class="tv-sms-in-phone-wrap">
      <div class="tv-hero-phone tv-hero-phone--compact tv-sms-in-phone" id="tv-sms-in-phone">
        <div class="tv-hero-phone__notch" aria-hidden="true"></div>
        <div class="tv-hero-phone__screen">
          <header class="tv-sms-in-phone-head">
            <div class="tv-sms-in-phone-head__brand">
              <span class="tv-sms-in-phone-head__logo material-symbols-outlined" aria-hidden="true">sms</span>
              <div>
                <p class="tv-sms-in-phone-head__title">Telvoice SMS</p>
                <p class="tv-sms-in-phone-head__line" id="tv-sms-in-phone-line">${escapeHtml(lineLabel)}</p>
              </div>
            </div>
            <span class="tv-sms-in-phone-status ${receptionCls}" id="tv-sms-in-phone-status">${escapeHtml(receptionLabel)}</span>
          </header>
          <div class="tv-hero-phone__messages tv-sms-in-feed" id="tv-sms-in-feed" role="log" aria-live="polite" aria-relevant="additions">
            ${feed}
          </div>
        </div>
      </div>
    </div>
  </aside>`;
}

function renderHistoryTable(
  messages: InboundSmsMessageRow[],
  filters: SmsInboxFilters,
  hasNumbers: boolean,
): string {
  if (!hasNumbers) {
    return `<section class="tv-sms-in-panel tv-sms-in-panel--history">
      <div class="tv-sms-in-empty">
        <span class="material-symbols-outlined" aria-hidden="true">sim_card</span>
        <h3>Sin numeraciones contratadas</h3>
        <p>Contrata una numeración Telvoice para recibir y simular SMS entrantes en tu panel.</p>
        ${renderBtn("Ver planes y numeraciones", { href: "/app/planes-agente", variant: "primary", icon: "add_call" })}
        ${renderBtn("Mis numeraciones", { href: "/app/numeraciones", variant: "secondary" })}
      </div>
    </section>`;
  }

  const rows =
    messages.length > 0
      ? messages
          .map(
            (m) => `<tr data-msg-id="${escapeHtml(m.id)}" data-number-id="${escapeHtml(m.client_number_id)}">
          <td><time datetime="${escapeHtml(m.received_at)}">${escapeHtml(formatInboxDateTime(m.received_at))}</time></td>
          <td><code class="tv-sms-in-num">${escapeHtml(m.to_number)}</code></td>
          <td>${escapeHtml(m.from_number ?? "—")}</td>
          <td class="tv-sms-in-msg-cell">${escapeHtml(m.body.slice(0, 120))}${m.body.length > 120 ? "…" : ""}${m.detected_otp ? `<span class="tv-otp-pill"><code>${escapeHtml(m.detected_otp)}</code></span>` : ""}</td>
          <td>${renderStatusBadge(m.status)} ${renderSourceBadge(m.source)}</td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="tv-sms-in-table-empty">No hay SMS entrantes con los filtros actuales.</td></tr>`;

  return `<section class="tv-sms-in-panel tv-sms-in-panel--history">
    <header class="tv-sms-in-panel__head tv-sms-in-panel__head--row">
      <div>
        <h2 class="tv-sms-in-panel__title">
          <span class="material-symbols-outlined" aria-hidden="true">history</span>
          Historial de SMS entrantes
        </h2>
      </div>
      ${renderBtn("Exportar CSV", {
        href: `/app/sms-inbox/export.csv${inboxQueryString(filters)}`,
        variant: "ghost",
        icon: "download",
        size: "sm",
      })}
    </header>
    <form method="get" action="/app/sms-inbox" class="tv-sms-in-history-filters">
      ${filters.numberId ? `<input type="hidden" name="number" value="${escapeHtml(filters.numberId)}" />` : ""}
      ${renderFilterField("Buscar", `<input type="search" name="q" class="tv-filter-input" value="${escapeHtml(filters.q ?? "")}" placeholder="Remitente o contenido" />`)}
      ${renderFilterField("Remitente", `<input type="text" name="from" class="tv-filter-input" value="${escapeHtml(filters.from ?? "")}" placeholder="+569…" />`)}
      <div class="tv-sms-in-history-filters__actions">
        ${renderBtn("Filtrar", { type: "submit", variant: "secondary", size: "sm" })}
        ${renderBtn("Limpiar", { href: filters.numberId ? `/app/sms-inbox?number=${encodeURIComponent(filters.numberId)}` : "/app/sms-inbox", variant: "ghost", size: "sm" })}
      </div>
    </form>
    <div class="tv-table-wrap tv-sms-in-table-wrap">
      <table class="tv-table tv-sms-in-table" id="tv-sms-in-history-table">
        <thead>
          <tr>
            <th>Fecha / hora</th>
            <th>Numeración destino</th>
            <th>Remitente</th>
            <th>Mensaje</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody id="tv-sms-in-history-body">${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function renderPageScript(
  messages: InboundSmsMessageRow[],
  filters: SmsInboxFilters,
  selectedNumber: ClientNumberListItem | null,
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
  var root = document.getElementById("tv-sms-in-root");
  if (!root) return;

  var feedEl = document.getElementById("tv-sms-in-feed");
  var historyBody = document.getElementById("tv-sms-in-history-body");
  var toast = document.getElementById("tv-sms-in-toast");
  var liveBadge = document.getElementById("tv-sms-in-live");
  var numberSelect = document.getElementById("tv-sms-in-number-id");
  var simNumberHidden = document.getElementById("tv-sms-in-sim-number-id");
  var lastStat = document.getElementById("tv-sms-in-last");
  var simForm = document.getElementById("tv-sms-in-simulate-form");
  var simError = document.getElementById("tv-sms-in-simulate-error");
  var simBtn = simForm ? simForm.querySelector('button[type="submit"]') : null;

  var knownIds = new Set(${JSON.stringify(knownIds)});
  var latestAt = ${JSON.stringify(latestAt)};
  var pollBase = ${JSON.stringify(pollBase)};
  var selectedNumberId = ${JSON.stringify(selectedNumber?.id ?? filters.numberId ?? "")};
  var pollTimer = null;

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour: "numeric", minute: "2-digit", hour12: true });
    } catch (e) { return ""; }
  }

  function formatDateTime(iso) {
    try {
      return new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
    } catch (e) { return iso; }
  }

  function statusBadge(status) {
    var labels = { received: "Recibido", read: "Leído", archived: "Archivado", forwarded: "Reenviado", failed: "Fallido" };
    var cls = { received: "warn", read: "ok", archived: "muted", forwarded: "ok", failed: "err" };
    var l = labels[status] || status;
    var c = cls[status] || "muted";
    return '<span class="badge badge-' + c + ' tv-sms-in-status">' + esc(l) + '</span>';
  }

  function sourceBadge(source) {
    return source === "simulation" ? '<span class="tv-sms-in-source tv-sms-in-source--sim">Simulación</span>' : "";
  }

  function buildPollUrl() {
    var sep = pollBase.indexOf("?") >= 0 ? "&" : "?";
    return pollBase + (latestAt ? sep + "after=" + encodeURIComponent(latestAt) : "");
  }

  function setLiveBadge(state) {
    if (!liveBadge) return;
    liveBadge.classList.toggle("tv-sms-in-live--warn", state !== "ok");
    liveBadge.innerHTML = state === "ok"
      ? '<span class="tv-sms-in-live__dot" aria-hidden="true"></span> En tiempo real'
      : "Reconectando…";
  }

  function showToast(text) {
    if (!toast) return;
    toast.textContent = text || "Nuevo SMS recibido";
    toast.hidden = false;
    toast.classList.add("tv-sms-in-toast--visible");
    setTimeout(function() {
      toast.classList.remove("tv-sms-in-toast--visible");
      setTimeout(function() { toast.hidden = true; }, 300);
    }, 3200);
  }

  function scrollFeedToBottom() {
    if (!feedEl) return;
    feedEl.scrollTop = feedEl.scrollHeight;
  }

  function renderFeedBubble(m, isLatest) {
    var from = (m.from_number || "").trim() || "Desconocido";
    return '<div class="tv-sms-in-feed__item' + (isLatest ? " tv-sms-in-feed__item--latest" : "") + '" data-msg-id="' + esc(m.id) + '">' +
      '<div class="tv-hero-phone__bubble tv-hero-phone__bubble--in tv-sms-in-bubble tv-sms-in-bubble--enter">' + esc(m.body) + '</div>' +
      '<div class="tv-sms-in-feed__meta"><span class="tv-sms-in-feed__from">' + esc(from) + '</span><span aria-hidden="true">·</span>' +
      '<time datetime="' + esc(m.received_at) + '">' + esc(formatTime(m.received_at)) + '</time>' + sourceBadge(m.source) + '</div></div>';
  }

  function prependHistoryRow(m) {
    if (!historyBody) return;
    if (selectedNumberId && m.client_number_id !== selectedNumberId) return;
    var emptyRow = historyBody.querySelector(".tv-sms-in-table-empty");
    if (emptyRow) emptyRow.closest("tr").remove();
    var tr = document.createElement("tr");
    tr.setAttribute("data-msg-id", m.id);
    tr.setAttribute("data-number-id", m.client_number_id);
    var body = esc((m.body || "").slice(0, 120)) + ((m.body || "").length > 120 ? "…" : "");
    tr.innerHTML = '<td><time datetime="' + esc(m.received_at) + '">' + esc(formatDateTime(m.received_at)) + '</time></td>' +
      '<td><code class="tv-sms-in-num">' + esc(m.to_number) + '</code></td>' +
      '<td>' + esc(m.from_number || "—") + '</td>' +
      '<td class="tv-sms-in-msg-cell">' + body + '</td>' +
      '<td>' + statusBadge(m.status) + " " + sourceBadge(m.source) + '</td>';
    historyBody.insertBefore(tr, historyBody.firstChild);
  }

  function appendToFeed(m) {
    if (!feedEl) return;
    if (selectedNumberId && m.client_number_id !== selectedNumberId) return;
    var empty = document.getElementById("tv-sms-in-feed-empty");
    if (empty) empty.remove();
    feedEl.querySelectorAll(".tv-sms-in-feed__item--latest").forEach(function(el) {
      el.classList.remove("tv-sms-in-feed__item--latest");
    });
    var div = document.createElement("div");
    div.innerHTML = renderFeedBubble(m, true);
    feedEl.appendChild(div.firstChild);
    scrollFeedToBottom();
  }

  function updateLastStat(m) {
    if (!lastStat || !m) return;
    if (selectedNumberId && m.client_number_id !== selectedNumberId) return;
    lastStat.textContent = formatDateTime(m.received_at) + " · " + (m.from_number || "Desconocido");
  }

  function ingestMessage(m, fromPoll) {
    if (knownIds.has(m.id)) return;
    knownIds.add(m.id);
    if (!latestAt || m.received_at > latestAt) latestAt = m.received_at;
    prependHistoryRow(m);
    appendToFeed(m);
    updateLastStat(m);
    if (fromPoll) showToast();
  }

  function poll() {
    fetch(buildPollUrl(), { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function(r) { if (!r.ok) throw new Error("poll"); return r.json(); })
      .then(function(data) {
        if (!data.ok) throw new Error("poll");
        setLiveBadge("ok");
        var incoming = (data.messages || []).filter(function(m) { return !knownIds.has(m.id); });
        if (incoming.length) {
          incoming.sort(function(a, b) { return a.received_at.localeCompare(b.received_at); });
          incoming.forEach(function(m) { ingestMessage(m, true); });
        } else if (data.latest_received_at && data.latest_received_at > latestAt) {
          latestAt = data.latest_received_at;
        }
      })
      .catch(function() { setLiveBadge("warn"); });
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
  scrollFeedToBottom();

  if (numberSelect && numberSelect.tagName === "SELECT") {
    numberSelect.addEventListener("change", function() {
      var id = numberSelect.value;
      var p = new URLSearchParams(window.location.search);
      if (id) p.set("number", id); else p.delete("number");
      p.delete("msg");
      window.location.href = "/app/sms-inbox?" + p.toString();
    });
  }

  function getActiveNumberId() {
    if (numberSelect) return numberSelect.value || "";
    if (simNumberHidden) return simNumberHidden.value || "";
    return selectedNumberId || "";
  }

  if (simForm) {
    simForm.addEventListener("submit", function(ev) {
      ev.preventDefault();
      if (simError) { simError.hidden = true; simError.textContent = ""; }
      var numberId = getActiveNumberId();
      var fromEl = document.getElementById("tv-sms-in-from");
      var bodyEl = document.getElementById("tv-sms-in-body");
      var from = fromEl && "value" in fromEl ? fromEl.value : "";
      var body = bodyEl && "value" in bodyEl ? bodyEl.value : "";
      if (!numberId) {
        if (simError) { simError.textContent = "Selecciona una numeración destino."; simError.hidden = false; }
        return;
      }
      if (!from.trim()) {
        if (simError) { simError.textContent = "Ingresa el número remitente."; simError.hidden = false; }
        return;
      }
      if (!body.trim()) {
        if (simError) { simError.textContent = "Ingresa el mensaje recibido."; simError.hidden = false; }
        return;
      }
      if (simBtn) {
        simBtn.disabled = true;
        simBtn.setAttribute("aria-busy", "true");
        simBtn.classList.add("tv-sms-in-btn--loading");
        simBtn.dataset.label = simBtn.textContent || "Simular SMS entrante";
        simBtn.textContent = "Simulando…";
      }
      fetch("/api/app/sms-inbox/simulate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ number_id: numberId, from: from.trim(), body: body.trim() })
      })
      .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
      .then(function(res) {
        if (!res.ok || !res.j.ok) throw new Error((res.j && res.j.error) || "Error al simular");
        var m = res.j.message;
        if (m) {
          ingestMessage(m, false);
          showToast("SMS simulado recibido");
          if (bodyEl && "value" in bodyEl) bodyEl.value = "";
        }
      })
      .catch(function(err) {
        if (simError) { simError.textContent = err.message || "No se pudo simular el SMS."; simError.hidden = false; }
      })
      .finally(function() {
        if (simBtn) {
          simBtn.disabled = false;
          simBtn.removeAttribute("aria-busy");
          simBtn.classList.remove("tv-sms-in-btn--loading");
          simBtn.textContent = simBtn.dataset.label || "Simular SMS entrante";
        }
      });
    });
  }
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
  const numbers = filterClientPanelNumbers(data.numbers);
  const activeNumbers = numbers.filter((n) => n.status === "active");
  const selectedNumber = resolveSelectedNumber(numbers, filters);
  const phoneMessages = selectedNumber
    ? data.messages.filter((m) => m.client_number_id === selectedNumber.id)
    : data.messages;

  const body = `
    <header class="tv-sms-in-head">
      <div class="tv-sms-in-head__main">
        <h1 class="tv-sms-in-head__title">SMS Entrantes</h1>
        <p class="tv-sms-in-head__sub">Revisa y simula la recepción de mensajes en tus numeraciones Telvoice.</p>
      </div>
      <div class="tv-sms-in-head__actions">
        <span class="tv-sms-in-live" id="tv-sms-in-live" role="status">
          <span class="tv-sms-in-live__dot" aria-hidden="true"></span>
          En tiempo real
        </span>
      </div>
    </header>

    ${renderStatsCards(numbers, data.messages, selectedNumber)}

    ${activeNumbers.length >= 2 ? renderLineSelectorBar(activeNumbers, selectedNumber) : ""}

    <div class="tv-sms-in-root" id="tv-sms-in-root"
         data-number-id="${escapeHtml(selectedNumber?.id ?? "")}"
         data-latest-at="${escapeHtml(data.messages[0]?.received_at ?? "")}">

      <div class="tv-sms-in-layout">
        <div class="tv-sms-in-main">
          ${activeNumbers.length ? renderSimulateForm(numbers, selectedNumber) : ""}
          ${renderHistoryTable(data.messages, filters, numbers.length > 0)}
        </div>
        ${activeNumbers.length ? renderPhoneMockup(selectedNumber, phoneMessages) : ""}
      </div>
    </div>

    <div class="tv-sms-in-toast" id="tv-sms-in-toast" role="status" aria-live="polite" hidden>
      Nuevo SMS recibido
    </div>

    ${renderPageScript(data.messages, filters, selectedNumber)}
    ${renderAgentModuleStyles()}`;

  return wrapAppPage(ctx, "sms-inbox", "SMS Entrantes", body, {
    bodyClass: "tv-page--sms-inbox",
  });
}
