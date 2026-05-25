import type { AdminSessionUser } from "../../../types/admin.js";
import type { TelsimInboundFeedItem } from "../../../services/telsimWebhookService.js";
import { isDailySendLimitEnforced } from "../../../services/smsLiveTestLimiterService.js";
import {
  formatVerifyLastTest,
  type SendControlPanelView,
} from "../../../services/smsSendControlPanelService.js";
import { escapeHtml } from "../../../utils/html.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import { renderPageHeader, renderStatChip } from "../page-kit.js";
import { renderSuperadminBanner } from "../superadmin-kit.js";
import { renderPanelMessageStatusBadge } from "../../app-ui/app-sms-ui.js";

export type TestProviderOption = {
  id: string;
  name: string;
  code: string;
  status: string;
  defaultSenderId: string | null;
};

export type TestRouteOption = {
  id: string;
  providerId: string;
  name: string;
  country: string;
  status: string;
  isDefault: boolean;
  providerName: string;
};

function formatInboundTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CL", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function renderChecklistItem(ok: boolean, label: string, hint?: string): string {
  const icon = ok ? "check_circle" : "error";
  const cls = ok ? "tv-checklist__item--ok" : "tv-checklist__item--fail";
  const hintHtml = hint
    ? `<span class="tv-checklist__hint">${escapeHtml(hint)}</span>`
    : "";
  return `<li class="tv-checklist__item ${cls}">
    <span class="material-symbols-outlined tv-checklist__icon">${icon}</span>
    <span class="tv-checklist__label">${escapeHtml(label)}${hintHtml}</span>
  </li>`;
}

function renderInboundFeedHtml(messages: TelsimInboundFeedItem[]): string {
  if (messages.length === 0) {
    return `<p class="tv-telsim-feed__empty">Sin SMS entrantes en esta línea.</p>`;
  }
  return messages
    .map((m, i) => {
      const isLatest = i === messages.length - 1;
      const text =
        m.content.trim() ||
        (m.verificationCode ? `Código: ${m.verificationCode}` : "—");
      return `<div class="tv-telsim-feed__item${isLatest ? " tv-telsim-feed__item--latest" : ""}" data-inbound-id="${escapeHtml(m.id)}">
        <div class="tv-hero-phone__bubble tv-hero-phone__bubble--in">${escapeHtml(text)}</div>
        <div class="tv-telsim-feed__meta">
          <span class="tv-telsim-feed__from">${escapeHtml(m.from.trim() || "Desconocido")}</span>
          <span class="tv-telsim-feed__sep" aria-hidden="true">·</span>
          <time datetime="${escapeHtml(m.receivedAt)}">${escapeHtml(formatInboundTime(m.receivedAt))}</time>
        </div>
      </div>`;
    })
    .join("");
}

function renderInboundPhone(
  lineLabel: string,
  operator: string,
  messages: TelsimInboundFeedItem[],
): string {
  const latest = messages[messages.length - 1];
  const headFrom = latest?.from.trim() || "SMS entrante";
  const initial = (headFrom.charAt(0) || "S").toUpperCase();
  return `<div class="tv-hero-phone tv-hero-phone--compact tv-telsim-phone-feed" id="tv-telsim-phone-shell">
    <div class="tv-hero-phone__notch" aria-hidden="true"></div>
    <div class="tv-hero-phone__screen">
      <div class="tv-hero-phone__app-head">
        <div class="tv-hero-phone__avatar" aria-hidden="true">${escapeHtml(initial)}</div>
        <div>
          <div class="tv-hero-phone__app-title" id="tv-telsim-feed-title">${escapeHtml(headFrom)}</div>
          <div class="tv-hero-phone__app-sub" id="tv-telsim-feed-sub">${escapeHtml(lineLabel)} · ${escapeHtml(operator)}</div>
        </div>
      </div>
      <div class="tv-hero-phone__messages tv-telsim-feed" id="tv-telsim-feed" role="log" aria-live="polite" aria-relevant="additions">
        ${renderInboundFeedHtml(messages)}
      </div>
    </div>
  </div>`;
}

function renderWebhookBlock(panel: SendControlPanelView): string {
  if (!panel.telsimWebhookConfigured) {
    return `<p class="field-hint tv-telsim-webhook-missing">Define <code>PUBLIC_WEBHOOK_BASE_URL</code> para obtener la URL del webhook.</p>`;
  }
  return `<div class="tv-telsim-webhook tv-telsim-webhook--compact">
    <label class="tv-telsim-webhook__label" for="tv-telsim-webhook-url">Webhook URL (POST en telsim.io)</label>
    <div class="tv-copy-row">
      <input type="text" class="tv-input-full" readonly value="${escapeHtml(panel.telsimWebhookUrl)}" id="tv-telsim-webhook-url" aria-label="URL webhook Telsim" />
      <button type="button" class="btn btn-secondary btn-sm" id="tv-telsim-webhook-copy">Copiar</button>
    </div>
    <p class="field-hint">Evento <code>sms.received</code> · los mensajes se apilan en la bandeja.</p>
  </div>`;
}

function renderProviderRouteFields(
  providers: TestProviderOption[],
  routes: TestRouteOption[],
  disabled: string,
): string {
  const providerOptions = providers
    .map(
      (p) =>
        `<option value="${escapeHtml(p.id)}" data-status="${escapeHtml(p.status)}" data-sender="${escapeHtml(p.defaultSenderId ?? "")}">${escapeHtml(p.name)} (${escapeHtml(p.code)}) — ${escapeHtml(p.status)}</option>`,
    )
    .join("");

  const routeOptions = routes
    .map(
      (r) =>
        `<option value="${escapeHtml(r.id)}" data-provider-id="${escapeHtml(r.providerId)}" data-status="${escapeHtml(r.status)}">${escapeHtml(r.name)} · ${escapeHtml(r.country)}${r.isDefault ? " · default" : ""} · ${escapeHtml(r.status)}</option>`,
    )
    .join("");

  return `<fieldset class="tv-test-route-fieldset">
    <legend class="tv-test-route-fieldset__legend">Ruta de envío</legend>
    <label class="tv-test-route-mode">
      <input type="radio" name="route_mode" value="auto" checked data-tv-route-mode />
      Automática (empresa de prueba)
    </label>
    <label class="tv-test-route-mode">
      <input type="radio" name="route_mode" value="manual" data-tv-route-mode />
      Proveedor / ruta específica
    </label>
    <div id="tv-route-manual-wrap" class="tv-test-route-manual" hidden>
      <div class="form-group">
        <label for="tv-test-provider">Proveedor</label>
        <select id="tv-test-provider" name="provider_id" class="tv-input-full" ${disabled} aria-label="Proveedor SMS">
          <option value="">Selecciona proveedor…</option>
          ${providerOptions}
        </select>
      </div>
      <div class="form-group">
        <label for="tv-test-route">Ruta</label>
        <select id="tv-test-route" name="route_id" class="tv-input-full" ${disabled} aria-label="Ruta SMS">
          <option value="">Selecciona ruta…</option>
          ${routeOptions}
        </select>
      </div>
      <p class="field-hint">Prueba técnica superadmin: no descuenta wallet del cliente.</p>
    </div>
  </fieldset>`;
}

function renderTestWorkspace(options: {
  panel: SendControlPanelView;
  canSend: boolean;
  defaultVerifyMessage: string;
  initialFeeds: Record<string, TelsimInboundFeedItem[]>;
  providers: TestProviderOption[];
  routes: TestRouteOption[];
  checklistHtml: string;
  checklistOkCount: number;
  checklistTotal: number;
}): string {
  const {
    panel,
    canSend,
    defaultVerifyMessage,
    initialFeeds,
    providers,
    routes,
    checklistHtml,
    checklistOkCount,
    checklistTotal,
  } = options;

  if (panel.verifyNumbers.length === 0) {
    return `<section class="tv-panel">
      <div class="tv-panel__body tv-verify-empty">
        <p>No hay líneas configuradas.</p>
        <p class="field-hint">Define <code>TELVOICE_VERIFY_NUMBERS</code> en el servidor.</p>
      </div>
    </section>`;
  }

  const first = panel.verifyNumbers[0]!;
  const disabled = canSend ? "" : "disabled";
  const firstFeed = initialFeeds[first.entry.id] ?? [];

  const lineOptions = panel.verifyNumbers
    .map(
      (v, i) =>
        `<option value="${i}" data-verify-id="${escapeHtml(v.entry.id)}">${escapeHtml(v.entry.operator)} — ${escapeHtml(v.entry.label)} (${escapeHtml(v.maskedPhone)})</option>`,
    )
    .join("");

  return `<div class="tv-test-workspace" id="tv-test-workspace">
    <div class="tv-test-grid">
      <section class="tv-panel tv-test-send-panel">
        <header class="tv-section-head tv-section-head--compact">
          <h2 class="tv-section-head__title">Motor de envío SMS</h2>
          <p class="tv-section-head__sub">Saliente · líneas QA, otro número o ruta de proveedor</p>
        </header>
        <div class="tv-panel__body tv-test-send-panel__body">
          <form method="post" action="/admin/test/qa-send" class="tv-test-send-form" id="tv-test-send-form">
            ${renderProviderRouteFields(providers, routes, disabled)}
            <fieldset class="tv-test-recipient-fieldset">
              <legend class="tv-test-recipient-fieldset__legend">Destinatario</legend>
              <label class="tv-test-recipient-mode">
                <input type="radio" name="recipient_mode" value="line" checked data-tv-recipient-mode />
                Línea registrada
              </label>
              <label class="tv-test-recipient-mode">
                <input type="radio" name="recipient_mode" value="custom" data-tv-recipient-mode />
                Otro número
              </label>
              <div class="form-group" id="tv-recipient-line-wrap">
                <label for="tv-send-line-select">Número de la lista</label>
                <select id="tv-send-line-select" class="tv-input-full" ${disabled} aria-label="Línea para envío">
                  ${lineOptions}
                </select>
                <input type="hidden" name="verify_id" id="tv-telsim-verify-id" value="${escapeHtml(first.entry.id)}" />
              </div>
              <div class="form-group" id="tv-recipient-custom-wrap" hidden>
                <label for="tv-send-custom-to">Número Chile (569…)</label>
                <input id="tv-send-custom-to" class="tv-input-full" name="to" placeholder="56912345678" inputmode="numeric" autocomplete="tel" />
              </div>
            </fieldset>
            <div class="form-group">
              <label for="tv-send-sender">Remitente (sender ID)</label>
              <input id="tv-send-sender" class="tv-input-full" name="sender_id" value="TELVOICE" maxlength="11" pattern="[A-Za-z0-9]+" required ${disabled} />
            </div>
            <div class="form-group">
              <label for="tv-send-message">Mensaje</label>
              <textarea id="tv-send-message" class="tv-input-full" name="message" rows="4" placeholder="Escribe el SMS de prueba…" required ${disabled}>${escapeHtml(defaultVerifyMessage)}</textarea>
              <p class="field-hint"><span id="tv-send-chars">0</span> caracteres</p>
            </div>
            <button type="submit" class="btn btn-primary tv-test-send-submit" id="tv-test-send-btn" ${disabled}>
              <span class="material-symbols-outlined" aria-hidden="true">send</span>
              Enviar SMS
            </button>
            <div id="tv-send-result" class="tv-test-send-result" hidden role="status" aria-live="polite"></div>
          </form>
          <details class="tv-test-checklist-disclosure">
            <summary class="tv-test-checklist-disclosure__summary">
              <span class="material-symbols-outlined" aria-hidden="true">checklist</span>
              Checklist pre-campaña
              <span class="tv-test-checklist-disclosure__badge">${checklistOkCount}/${checklistTotal}</span>
            </summary>
            <div class="tv-test-checklist-disclosure__body">
              ${checklistHtml}
            </div>
          </details>
        </div>
      </section>

      <section class="tv-panel tv-telsim-panel" id="tv-verify-section">
        <header class="tv-section-head tv-section-head--compact">
          <h2 class="tv-section-head__title">SMS entrantes</h2>
          <p class="tv-section-head__sub">Webhook telsim · cola en vivo</p>
        </header>
        <div class="tv-panel__body tv-telsim-panel__body tv-telsim-panel__body--stack">
          <div class="form-group tv-test-inbound-line">
            <label for="tv-telsim-line-select">Línea telsim</label>
            <select id="tv-telsim-line-select" class="tv-input-full" aria-label="Seleccionar línea telsim">
              ${lineOptions}
            </select>
            <p class="field-hint" id="tv-telsim-line-hint">Al llegar un SMS a otra línea, la vista cambia automáticamente.</p>
          </div>
          <div class="tv-telsim-panel__phone" id="tv-telsim-phone-wrap">
            ${renderInboundPhone(first.entry.label, first.entry.operator, firstFeed)}
          </div>
          <p class="tv-telsim-panel__status field-hint" id="tv-telsim-meta">
            ${renderPanelMessageStatusBadge(first.lastStatus, "live_test")}
            · ${escapeHtml(formatVerifyLastTest(first.lastTestAt))}${first.dlrReceived ? " · DLR OK" : ""}
            · <span id="tv-telsim-inbound-count">${firstFeed.length}</span> entrante(s)
          </p>
          ${renderWebhookBlock(panel)}
        </div>
      </section>
    </div>
  </div>`;
}

export function renderAdminTestPage(options: {
  admin: AdminSessionUser;
  panel: SendControlPanelView | null;
  sendEnabled: boolean;
  lineFeeds?: Record<string, TelsimInboundFeedItem[]>;
  providers?: TestProviderOption[];
  routes?: TestRouteOption[];
}): string {
  const panel = options.panel;
  const canSend = options.sendEnabled;
  const defaultVerifyMsg = panel?.defaultVerifyMessage ?? "";
  const initialFeeds = options.lineFeeds ?? {};
  const providers = options.providers ?? [];
  const routes = options.routes ?? [];

  const lt = panel?.sendStatus;
  const dailyRemaining = !lt
    ? "—"
    : isDailySendLimitEnforced()
      ? lt.trafficDailyRemaining != null && lt.trafficDailyLimit != null
        ? `${lt.trafficDailyRemaining} / ${lt.trafficDailyLimit}`
        : `${lt.dailyRemaining} / ${lt.dailyLimit}`
      : `${lt.dailyUsed} hoy`;

  const opsChips =
    panel && lt
      ? `<div class="tv-test-toolbar">
      ${renderStatChip("Ruta activa", lt.routeName ?? "—", "primary")}
      ${renderStatChip("DLR", panel.webhookConfigured ? "OK" : "Off", panel.webhookConfigured ? "success" : "warn")}
      ${renderStatChip("Telsim", panel.telsimWebhookConfigured ? "OK" : "Off", panel.telsimWebhookConfigured ? "success" : "warn")}
      ${renderStatChip(isDailySendLimitEnforced() ? "Cuota" : "Hoy", dailyRemaining, "default")}
    </div>`
      : "";

  const checklistItems = panel?.checklist ?? [];
  const checklistOkCount = checklistItems.filter((c) => c.ok).length;
  const checklistTotal = checklistItems.length || 1;
  const checklistHtml = panel
    ? `<ul class="tv-checklist">${checklistItems.map((c) => renderChecklistItem(c.ok, c.label, c.hint)).join("")}</ul>`
    : `<p class="alert alert-error">Panel no disponible. Revisa SMS_LIVE_TEST.</p>`;

  const telsimVerifyDataJson = panel
    ? JSON.stringify(
        panel.verifyNumbers.map((v) => {
          const feed = initialFeeds[v.entry.id] ?? [];
          const latest = feed[feed.length - 1];
          return {
            id: v.entry.id,
            operator: v.entry.operator,
            label: v.entry.label,
            masked: v.maskedPhone,
            inboundMessages: feed,
            latestInboundId: latest?.id ?? null,
            status: v.lastStatus,
            lastTestAt: v.lastTestAt,
            dlrReceived: v.dlrReceived,
            ready: v.readyForCampaign,
          };
        }),
      )
    : "[]";

  const routesJson = JSON.stringify(routes);
  const providersJson = JSON.stringify(providers);

  const workspace = panel
    ? renderTestWorkspace({
        panel,
        canSend,
        defaultVerifyMessage: defaultVerifyMsg,
        initialFeeds,
        providers,
        routes,
        checklistHtml,
        checklistOkCount,
        checklistTotal,
      })
    : "";

  const body = `
    ${renderSuperadminBanner("Pruebas telsim y QA pre-campaña. Solo operación interna.")}
    ${renderPageHeader({
      title: "Test",
      subtitle: "Envío SMS, rutas de proveedor y bandeja entrante telsim.",
    })}
    ${opsChips}
    ${workspace}
    <script>
    (function(){
      var telsimSelect = document.getElementById('tv-telsim-line-select');
      var sendLineSelect = document.getElementById('tv-send-line-select');
      var telsimLines = ${telsimVerifyDataJson};
      var testRoutes = ${routesJson};
      var testProviders = ${providersJson};
      var defaultVerifyMsg = ${JSON.stringify(defaultVerifyMsg)};

      function statusBadgeHtml(status){
        var map = { delivered:'ok', sent:'ok', pending:'warn', queued:'warn', failed:'err' };
        return '<span class="badge badge-'+(map[status] || 'muted')+'">'+(status || '—')+'</span>';
      }
      function formatTelsimLastTest(at){
        if(!at) return 'Sin test reciente';
        try { return new Date(at).toLocaleString('es-CL', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); }
        catch(e){ return at; }
      }
      function formatInboundTime(iso){
        try { return new Date(iso).toLocaleString('es-CL', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', second:'2-digit' }); }
        catch(e){ return iso; }
      }
      function esc(s){
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }
      function renderFeedHtml(messages){
        if(!messages.length) return '<p class="tv-telsim-feed__empty">Sin SMS entrantes en esta línea.</p>';
        return messages.map(function(m,i){
          var isLatest = i === messages.length - 1;
          var text = (m.content && m.content.trim()) || (m.verificationCode ? 'Código: '+m.verificationCode : '—');
          return '<div class="tv-telsim-feed__item'+(isLatest?' tv-telsim-feed__item--latest':'')+'" data-inbound-id="'+esc(m.id)+'">'+
            '<div class="tv-hero-phone__bubble tv-hero-phone__bubble--in">'+esc(text)+'</div>'+
            '<div class="tv-telsim-feed__meta"><span class="tv-telsim-feed__from">'+esc((m.from||'').trim()||'Desconocido')+'</span>'+
            '<span class="tv-telsim-feed__sep">·</span><time datetime="'+esc(m.receivedAt)+'">'+esc(formatInboundTime(m.receivedAt))+'</time></div></div>';
        }).join('');
      }
      function mergeInboundMessages(existing, incoming){
        var byId = {};
        (existing||[]).forEach(function(m){ byId[m.id]=m; });
        var added = [];
        (incoming||[]).forEach(function(m){ if(!byId[m.id]) added.push(m); byId[m.id]=m; });
        var merged = Object.keys(byId).map(function(k){ return byId[k]; });
        merged.sort(function(a,b){ return new Date(a.receivedAt).getTime()-new Date(b.receivedAt).getTime(); });
        return { merged: merged, addedIds: added.map(function(m){ return m.id; }) };
      }
      function renderInboundPhoneClient(line, messages){
        var latest = messages.length ? messages[messages.length-1] : null;
        var headFrom = latest && latest.from ? latest.from.trim() : 'SMS entrante';
        if(!headFrom) headFrom = 'SMS entrante';
        return '<div class="tv-hero-phone tv-hero-phone--compact tv-telsim-phone-feed" id="tv-telsim-phone-shell">'+
          '<div class="tv-hero-phone__notch"></div><div class="tv-hero-phone__screen">'+
          '<div class="tv-hero-phone__app-head"><div class="tv-hero-phone__avatar">'+esc((headFrom.charAt(0)||'S').toUpperCase())+'</div><div>'+
          '<div class="tv-hero-phone__app-title" id="tv-telsim-feed-title">'+esc(headFrom)+'</div>'+
          '<div class="tv-hero-phone__app-sub" id="tv-telsim-feed-sub">'+esc(line.label)+' · '+esc(line.operator)+'</div></div></div>'+
          '<div class="tv-hero-phone__messages tv-telsim-feed" id="tv-telsim-feed" role="log" aria-live="polite">'+renderFeedHtml(messages)+'</div></div></div>';
      }
      function getLineBySelectIndex(selectEl){
        if(!selectEl||!telsimLines.length) return null;
        return telsimLines[Number(selectEl.value)]||telsimLines[0];
      }
      function syncSendLineToInbound(){
        if(!sendLineSelect||!telsimSelect) return;
        sendLineSelect.value = telsimSelect.value;
        var line = getLineBySelectIndex(telsimSelect);
        var verifyId = document.getElementById('tv-telsim-verify-id');
        if(line && verifyId) verifyId.value = line.id;
      }
      function syncInboundToSendLine(){
        if(!sendLineSelect||!telsimSelect) return;
        telsimSelect.value = sendLineSelect.value;
        updateTelsimLine(false);
      }
      function updateTelsimLine(scrollToLatest){
        if(typeof scrollToLatest==='undefined') scrollToLatest=true;
        var line = getLineBySelectIndex(telsimSelect);
        if(!line) return;
        var verifyId = document.getElementById('tv-telsim-verify-id');
        if(verifyId) verifyId.value = line.id;
        if(sendLineSelect) sendLineSelect.value = String(telsimLines.indexOf(line));
        var wrap = document.getElementById('tv-telsim-phone-wrap');
        if(wrap){
          wrap.innerHTML = renderInboundPhoneClient(line, line.inboundMessages||[]);
          wrap.classList.toggle('tv-telsim-panel__phone--ready', !!line.ready);
          wrap.classList.toggle('tv-telsim-panel__phone--pending', !line.ready);
          wrap.classList.toggle('tv-telsim-panel__phone--pulse', false);
        }
        var metaEl = document.getElementById('tv-telsim-meta');
        if(metaEl){
          var count = (line.inboundMessages||[]).length;
          metaEl.innerHTML = statusBadgeHtml(line.status)+' · '+formatTelsimLastTest(line.lastTestAt)+(line.dlrReceived?' · DLR OK':'')+' · <span id="tv-telsim-inbound-count">'+count+'</span> entrante(s)';
        }
        if(scrollToLatest){
          var feed = document.getElementById('tv-telsim-feed');
          if(feed) feed.scrollTop = feed.scrollHeight;
        }
      }
      var defaultLineHint = 'Al llegar un SMS a otra línea, la vista cambia automáticamente.';
      function flashLineHint(text){
        var hint = document.getElementById('tv-telsim-line-hint');
        if(!hint) return;
        hint.textContent = text;
        hint.classList.add('tv-telsim-line-hint--alert');
        setTimeout(function(){ hint.classList.remove('tv-telsim-line-hint--alert'); hint.textContent = defaultLineHint; }, 5000);
      }
      if(telsimSelect){
        telsimSelect.addEventListener('change', function(){ updateTelsimLine(true); syncSendLineToInbound(); });
        updateTelsimLine(true);
      }
      if(sendLineSelect) sendLineSelect.addEventListener('change', syncInboundToSendLine);

      var recipientRadios = document.querySelectorAll('[data-tv-recipient-mode]');
      var lineWrap = document.getElementById('tv-recipient-line-wrap');
      var customWrap = document.getElementById('tv-recipient-custom-wrap');
      function syncRecipientMode(){
        var mode = 'line';
        recipientRadios.forEach(function(r){ if(r.checked) mode = r.value; });
        if(lineWrap) lineWrap.hidden = mode !== 'line';
        if(customWrap) customWrap.hidden = mode !== 'custom';
      }
      recipientRadios.forEach(function(r){ r.addEventListener('change', syncRecipientMode); });
      syncRecipientMode();

      var routeRadios = document.querySelectorAll('[data-tv-route-mode]');
      var routeManualWrap = document.getElementById('tv-route-manual-wrap');
      var providerSelect = document.getElementById('tv-test-provider');
      var routeSelect = document.getElementById('tv-test-route');
      function syncRouteMode(){
        var mode = 'auto';
        routeRadios.forEach(function(r){ if(r.checked) mode = r.value; });
        if(routeManualWrap) routeManualWrap.hidden = mode !== 'manual';
      }
      routeRadios.forEach(function(r){ r.addEventListener('change', syncRouteMode); });
      syncRouteMode();

      function filterRoutesForProvider(providerId){
        if(!routeSelect) return;
        var current = routeSelect.value;
        var html = '<option value="">Selecciona ruta…</option>';
        testRoutes.forEach(function(r){
          if(r.providerId === providerId){
            html += '<option value="'+esc(r.id)+'" data-provider-id="'+esc(r.providerId)+'">'+esc(r.name)+' · '+esc(r.country)+(r.isDefault?' · default':'')+' · '+esc(r.status)+'</option>';
          }
        });
        routeSelect.innerHTML = html;
        if(current && routeSelect.querySelector('option[value="'+current+'"]')) routeSelect.value = current;
      }
      if(providerSelect){
        providerSelect.addEventListener('change', function(){
          filterRoutesForProvider(providerSelect.value);
          var opt = providerSelect.selectedOptions[0];
          var sender = opt && opt.getAttribute('data-sender');
          var senderInput = document.getElementById('tv-send-sender');
          if(sender && senderInput && sender.trim()) senderInput.value = sender.trim();
        });
      }

      var msgEl = document.getElementById('tv-send-message');
      var charsEl = document.getElementById('tv-send-chars');
      function updateChars(){ if(msgEl&&charsEl) charsEl.textContent = String((msgEl.value||'').length); }
      if(msgEl){ msgEl.addEventListener('input', updateChars); updateChars(); }

      var telsimWebhookCopy = document.getElementById('tv-telsim-webhook-copy');
      var telsimWebhookUrl = document.getElementById('tv-telsim-webhook-url');
      if(telsimWebhookCopy && telsimWebhookUrl){
        telsimWebhookCopy.addEventListener('click', function(){
          telsimWebhookUrl.select();
          if(navigator.clipboard && navigator.clipboard.writeText){
            navigator.clipboard.writeText(telsimWebhookUrl.value||'').catch(function(){});
          }
        });
      }

      function pollTelsimInbound(){
        if(!telsimLines.length) return;
        fetch('/admin/test/telsim-preview', { credentials:'same-origin', headers:{ Accept:'application/json' } })
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(data){
            if(!data||!data.lines) return;
            var lineWithNew = null;
            telsimLines.forEach(function(line){
              var upd = data.lines[line.id];
              if(!upd||!upd.inboundMessages) return;
              var result = mergeInboundMessages(line.inboundMessages, upd.inboundMessages);
              if(result.addedIds.length){
                line.inboundMessages = result.merged;
                line.ready = upd.ready;
                lineWithNew = line;
              }
            });
            if(lineWithNew && telsimSelect){
              var idx = telsimLines.indexOf(lineWithNew);
              if(String(telsimSelect.value)!==String(idx)){
                telsimSelect.value = String(idx);
                flashLineHint('Nuevo SMS en '+lineWithNew.label+' ('+lineWithNew.masked+')');
              }
              var phoneWrap = document.getElementById('tv-telsim-phone-wrap');
              if(phoneWrap) phoneWrap.classList.add('tv-telsim-panel__phone--pulse');
              updateTelsimLine(true);
              syncSendLineToInbound();
            }
          }).catch(function(){});
      }
      if(telsimSelect){ pollTelsimInbound(); setInterval(pollTelsimInbound, 4000); }

      var sendForm = document.getElementById('tv-test-send-form');
      var sendBtn = document.getElementById('tv-test-send-btn');
      var sendResult = document.getElementById('tv-send-result');
      function showSendResult(ok, message){
        if(!sendResult) return;
        sendResult.hidden = false;
        sendResult.className = 'tv-test-send-result '+(ok ? 'tv-test-send-result--ok' : 'tv-test-send-result--err');
        sendResult.textContent = message;
      }
      function resetSendBtn(){
        if(!sendBtn) return;
        sendBtn.removeAttribute('disabled');
        sendBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">send</span> Enviar SMS';
      }
      if(sendForm){
        sendForm.addEventListener('submit', function(ev){
          ev.preventDefault();
          if(sendBtn){ sendBtn.setAttribute('disabled','disabled'); sendBtn.textContent = 'Enviando…'; }
          if(sendResult){ sendResult.hidden = true; }
          fetch('/admin/test/qa-send', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
            body: new FormData(sendForm)
          })
          .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, body: j }; }); })
          .then(function(res){
            showSendResult(res.body && res.body.ok, (res.body && res.body.message) || 'Respuesta inesperada.');
            resetSendBtn();
          })
          .catch(function(){
            showSendResult(false, 'Error de red al enviar. Intenta de nuevo.');
            resetSendBtn();
          });
        });
      }
    })();
    </script>`;

  return wrapAdminPage({
    admin: options.admin,
    title: "Test",
    body,
    activeNav: "test",
  });
}
