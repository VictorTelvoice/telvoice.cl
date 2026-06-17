import { filterClientPanelNumbers } from "../../services/clientNumberService.js";
import type {
  ClientNumberListItem,
  InboundSmsMessageRow,
  InboundSmsStatus,
} from "../../types/client-numbers.js";
import { escapeHtml } from "../../utils/html.js";
import { renderBtn, renderPageHeader } from "../admin-ui/page-kit.js";
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

function renderSourceBadge(source: string | null): string {
  if (source === "simulation") {
    return `<span class="badge badge-muted tv-sms-in-source">Simulación</span>`;
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

function formatUnreadBadge(count: number): string {
  if (count <= 0) return "";
  return count > 99 ? "99+" : String(count);
}

function renderLineTabs(
  activeNumbers: ClientNumberListItem[],
  selectedNumber: ClientNumberListItem | null,
  unreadByNumber: Record<string, number>,
): string {
  if (!activeNumbers.length) return "";

  const tabs = activeNumbers
    .map((n) => {
      const active = selectedNumber?.id === n.id;
      const unread = active ? 0 : (unreadByNumber[n.id] ?? 0);
      const badgeLabel = formatUnreadBadge(unread);
      const badge = badgeLabel
        ? `<span class="tv-sms-in-line__badge" id="tv-sms-in-badge-${escapeHtml(n.id)}" data-number-id="${escapeHtml(n.id)}">${escapeHtml(badgeLabel)}</span>`
        : "";

      return `<a href="/app/sms-inbox?number=${encodeURIComponent(n.id)}"
        class="tv-sms-in-line${active ? " tv-sms-in-line--active" : ""}"
        role="tab"
        aria-selected="${active ? "true" : "false"}"
        data-number-id="${escapeHtml(n.id)}">
        <span class="material-symbols-outlined tv-sms-in-line__icon" aria-hidden="true">sim_card</span>
        <span class="tv-sms-in-line__num">${escapeHtml(n.number)}</span>
        ${badge}
      </a>`;
    })
    .join("");

  return `<div class="tv-sms-in-lines" role="tablist" aria-label="Líneas contratadas">${tabs}</div>`;
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

  return `<div class="tv-sms-in-phone-wrap">
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
  </div>`;
}

function renderEmptyState(): string {
  return `<section class="tv-panel tv-sms-in-empty">
    <div class="tv-sms-in-empty__icon" aria-hidden="true">
      <span class="material-symbols-outlined">sim_card</span>
    </div>
    <h2 class="tv-section-head__title">Sin numeraciones contratadas</h2>
    <p class="tv-page-sub">Contrata una numeración Telvoice para recibir SMS entrantes en tu panel.</p>
    <div class="tv-sms-in-empty__actions">
      ${renderBtn("Ver planes y numeraciones", { href: "/app/planes-agente", variant: "primary", icon: "add_call" })}
      ${renderBtn("Mis numeraciones", { href: "/app/numeraciones", variant: "secondary" })}
    </div>
  </section>`;
}

function renderPageScript(
  messages: InboundSmsMessageRow[],
  selectedNumber: ClientNumberListItem | null,
  filters: SmsInboxFilters,
): string {
  const latestAt = messages[0]?.received_at ?? "";
  const knownIds = messages.map((m) => m.id);
  const selectedNumberId = selectedNumber?.id ?? filters.numberId ?? "";

  return `<script>
(function() {
  var POLL_MS = 7000;
  var root = document.getElementById("tv-sms-in-root");
  if (!root) return;

  var feedEl = document.getElementById("tv-sms-in-feed");
  var toast = document.getElementById("tv-sms-in-toast");
  var liveBadge = document.getElementById("tv-sms-in-live");

  var knownIds = new Set(${JSON.stringify(knownIds)});
  var latestAt = ${JSON.stringify(latestAt)};
  var pollBase = "/api/app/sms-inbox/poll";
  var selectedNumberId = ${JSON.stringify(selectedNumberId)};
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

  function sourceBadge(source) {
    return source === "simulation" ? '<span class="badge badge-muted tv-sms-in-source">Simulación</span>' : "";
  }

  function buildPollUrl() {
    if (!latestAt) return pollBase;
    return pollBase + "?after=" + encodeURIComponent(latestAt);
  }

  function formatBadgeCount(count) {
    if (count <= 0) return "";
    return count > 99 ? "99+" : String(count);
  }

  function setLineBadge(numberId, count) {
    if (!numberId || numberId === selectedNumberId || count <= 0) {
      var stale = document.getElementById("tv-sms-in-badge-" + numberId);
      if (stale) stale.remove();
      return;
    }
    var tab = document.querySelector('.tv-sms-in-line[data-number-id="' + numberId + '"]');
    if (!tab) return;
    var badge = document.getElementById("tv-sms-in-badge-" + numberId);
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "tv-sms-in-line__badge";
      badge.id = "tv-sms-in-badge-" + numberId;
      badge.setAttribute("data-number-id", numberId);
      tab.appendChild(badge);
    }
    badge.textContent = formatBadgeCount(count);
  }

  function updateLineBadges(unreadByNumber) {
    if (!unreadByNumber) return;
    document.querySelectorAll(".tv-sms-in-line[data-number-id]").forEach(function(tab) {
      var numberId = tab.getAttribute("data-number-id");
      if (!numberId) return;
      var count = numberId === selectedNumberId ? 0 : (unreadByNumber[numberId] || 0);
      setLineBadge(numberId, count);
    });
  }

  function bumpLineBadge(numberId) {
    if (!numberId || numberId === selectedNumberId) return;
    var badge = document.getElementById("tv-sms-in-badge-" + numberId);
    var current = badge ? parseInt(badge.textContent, 10) : 0;
    setLineBadge(numberId, (Number.isFinite(current) ? current : 0) + 1);
  }

  function setLiveBadge(state) {
    if (!liveBadge) return;
    liveBadge.classList.toggle("badge-warn", state !== "ok");
    liveBadge.classList.toggle("badge-ok", state === "ok");
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

  function ingestMessage(m, fromPoll) {
    if (knownIds.has(m.id)) return;
    knownIds.add(m.id);
    if (!latestAt || m.received_at > latestAt) latestAt = m.received_at;

    if (m.client_number_id === selectedNumberId) {
      appendToFeed(m);
      setLineBadge(selectedNumberId, 0);
      if (fromPoll) showToast();
    } else if (m.status === "received") {
      bumpLineBadge(m.client_number_id);
      if (fromPoll) showToast("Nuevo SMS en otra línea");
    }
  }

  function poll() {
    fetch(buildPollUrl(), { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function(r) { if (!r.ok) throw new Error("poll"); return r.json(); })
      .then(function(data) {
        if (!data.ok) throw new Error("poll");
        setLiveBadge("ok");
        updateLineBadges(data.unread_by_number);
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
})();
</script>`;
}

export type AppSmsInboxPageData = {
  numbers: ClientNumberListItem[];
  messages: InboundSmsMessageRow[];
  filters: SmsInboxFilters;
  selectedMessage: InboundSmsMessageRow | null;
  unreadByNumber: Record<string, number>;
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
    ${renderPageHeader({
      title: "SMS Entrantes",
      subtitle: "Mensajes recibidos en tus numeraciones Telvoice.",
      actions: `<span class="badge badge-ok tv-sms-in-live" id="tv-sms-in-live" role="status">
        <span class="tv-sms-in-live__dot" aria-hidden="true"></span>
        En tiempo real
      </span>`,
    })}

    ${renderLineTabs(activeNumbers, selectedNumber, data.unreadByNumber)}

    <div class="tv-sms-in-root" id="tv-sms-in-root"
         data-number-id="${escapeHtml(selectedNumber?.id ?? "")}"
         data-latest-at="${escapeHtml(data.messages[0]?.received_at ?? "")}">
      <div class="tv-sms-in-layout">
        ${activeNumbers.length ? renderPhoneMockup(selectedNumber, phoneMessages) : renderEmptyState()}
      </div>
    </div>

    <div class="tv-sms-in-toast" id="tv-sms-in-toast" role="status" aria-live="polite" hidden>
      Nuevo SMS recibido
    </div>

    ${activeNumbers.length ? renderPageScript(data.messages, selectedNumber, filters) : ""}
    ${renderAgentModuleStyles()}`;

  return wrapAppPage(ctx, "sms-inbox", "SMS Entrantes", body);
}
