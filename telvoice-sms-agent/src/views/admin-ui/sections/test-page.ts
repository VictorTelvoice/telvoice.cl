import type { AdminSessionUser } from "../../../types/admin.js";
import type { TelsimInboundFeedItem } from "../../../services/telsimWebhookService.js";
import { isDailySendLimitEnforced } from "../../../services/smsLiveTestLimiterService.js";
import {
  formatVerifyLastTest,
  type SendControlPanelView,
} from "../../../services/smsSendControlPanelService.js";
import { escapeHtml } from "../../../utils/html.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import {
  renderNotice,
  renderPageHeader,
  renderPanel,
  renderStatChip,
} from "../page-kit.js";
import { renderSuperadminBanner } from "../superadmin-kit.js";
import { renderPanelMessageStatusBadge } from "../../app-ui/app-sms-ui.js";

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
    return `<p class="tv-telsim-feed__empty">Sin SMS entrantes en esta línea. Envía una prueba o espera el webhook <code>sms.received</code>.</p>`;
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

function renderTestWorkspace(
  panel: SendControlPanelView,
  canSend: boolean,
  defaultVerifyMessage: string,
  initialFeeds: Record<string, TelsimInboundFeedItem[]>,
): string {
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

  const webhookBlock = panel.telsimWebhookConfigured
    ? `<div class="form-group tv-telsim-webhook">
          <label>Webhook URL (POST en telsim.io)</label>
          <div class="tv-copy-row">
            <input type="text" class="tv-input-full" readonly value="${escapeHtml(panel.telsimWebhookUrl)}" id="tv-telsim-webhook-url" aria-label="URL webhook Telsim" />
            <button type="button" class="btn btn-secondary btn-sm" id="tv-telsim-webhook-copy">Copiar</button>
          </div>
          <p class="field-hint">Evento <code>sms.received</code>. Los SMS se apilan en la bandeja sin borrar los anteriores.</p>
        </div>`
    : `<p class="field-hint tv-telsim-webhook-missing">Define <code>PUBLIC_WEBHOOK_BASE_URL</code> para obtener la URL del webhook.</p>`;

  return `<div class="tv-test-workspace" id="tv-test-workspace">
    ${webhookBlock}
    <div class="form-group tv-test-line-pick">
      <label for="tv-telsim-line-select">Línea telsim (entrantes y envío registrado)</label>
      <select id="tv-telsim-line-select" class="tv-input-full" aria-label="Seleccionar línea telsim">
        ${lineOptions}
      </select>
      <p class="field-hint" id="tv-telsim-line-hint">Al llegar un SMS a otra línea, la vista cambia automáticamente a esa línea.</p>
    </div>
    <div class="tv-test-workspace__cols">
      <section class="tv-panel tv-test-send-panel">
        <header class="tv-section-head">
          <h2 class="tv-section-head__title">Motor de envío SMS</h2>
          <p class="tv-section-head__sub">Prueba saliente hacia líneas registradas u otro número Chile</p>
        </header>
        <div class="tv-panel__body">
          <form method="post" action="/admin/test/qa-send" class="tv-test-send-form" id="tv-test-send-form">
            <fieldset class="tv-test-recipient-mode">
              <legend class="tv-test-recipient-mode__legend">Destinatario</legend>
              <label class="tv-test-recipient-mode__opt">
                <input type="radio" name="recipient_mode" value="line" checked data-tv-recipient-mode />
                Línea registrada
              </label>
              <label class="tv-test-recipient-mode__opt">
                <input type="radio" name="recipient_mode" value="custom" data-tv-recipient-mode />
                Otro número
              </label>
            </fieldset>
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
            <div class="form-group">
              <label for="tv-send-sender">Remitente (sender ID)</label>
              <input id="tv-send-sender" class="tv-input-full" name="sender_id" value="TELVOICE" maxlength="11" pattern="[A-Za-z0-9]+" required ${disabled} />
            </div>
            <div class="form-group">
              <label for="tv-send-message">Mensaje</label>
              <textarea id="tv-send-message" class="tv-input-full" name="message" rows="4" placeholder="Escribe el SMS de prueba…" ${disabled}>${escapeHtml(defaultVerifyMessage)}</textarea>
              <p class="field-hint"><span id="tv-send-chars">0</span> caracteres</p>
            </div>
            <button type="submit" class="btn btn-primary tv-test-send-submit" ${disabled}>
              <span class="material-symbols-outlined" aria-hidden="true">send</span>
              Enviar SMS
            </button>
          </form>
        </div>
      </section>
      <section class="tv-panel tv-telsim-panel" id="tv-verify-section">
        <header class="tv-section-head">
          <h2 class="tv-section-head__title">SMS entrantes</h2>
          <p class="tv-section-head__sub">Cola en vivo vía webhook — el último mensaje se resalta</p>
        </header>
        <div class="tv-panel__body tv-telsim-panel__body">
          <div class="tv-telsim-panel__phone" id="tv-telsim-phone-wrap">
            ${renderInboundPhone(first.entry.label, first.entry.operator, firstFeed)}
          </div>
          <p class="tv-telsim-panel__status field-hint" id="tv-telsim-meta">
            ${renderPanelMessageStatusBadge(first.lastStatus, "live_test")}
            · ${escapeHtml(formatVerifyLastTest(first.lastTestAt))}${first.dlrReceived ? " · DLR OK" : ""}
            · <span id="tv-telsim-inbound-count">${firstFeed.length}</span> entrante(s)
          </p>
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
  flash?: string;
  error?: string;
}): string {
  const panel = options.panel;
  const canSend = options.sendEnabled;
  const defaultVerifyMsg = panel?.defaultVerifyMessage ?? "";
  const initialFeeds = options.lineFeeds ?? {};

  const flashBlock = options.flash
    ? `<div class="alert alert-success">${escapeHtml(options.flash)}</div>`
    : "";
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

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
      ? `<div class="tv-stat-chips tv-stat-chips--ops" style="margin-bottom:1rem">
      ${renderStatChip("Ruta", lt.routeName ?? "—", "primary")}
      ${renderStatChip("Webhook DLR", panel.webhookConfigured ? "Activo" : "Off", panel.webhookConfigured ? "success" : "warn")}
      ${renderStatChip("Webhook telsim", panel.telsimWebhookConfigured ? "Activo" : "Off", panel.telsimWebhookConfigured ? "success" : "warn")}
      ${renderStatChip(isDailySendLimitEnforced() ? "Cuota hoy" : "Enviados hoy", dailyRemaining, "default")}
    </div>`
      : "";

  const preCampaignBanner =
    panel && panel.verifyNumbers.length > 0 && !panel.allVerifyNumbersReady
      ? renderNotice(
          "Validación pre-campaña pendiente: envía test QA a cada línea telsim y confirma DLR.",
          "warn",
        )
      : panel && panel.allVerifyNumbersReady && panel.verifyNumbers.length > 0
        ? `<div class="alert tv-precampaign-banner tv-precampaign-banner--ok" style="margin-bottom:1rem">
      <strong>Listo para campaña.</strong> Todas las líneas de verificación respondieron correctamente.
    </div>`
        : "";

  const checklistHtml = panel
    ? `<ul class="tv-checklist">
        ${panel.checklist.map((c) => renderChecklistItem(c.ok, c.label, c.hint)).join("")}
      </ul>`
    : `<p class="alert alert-error">Panel de pruebas no disponible. Revisa SMS_LIVE_TEST y empresa permitida.</p>`;

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
            message: v.lastTest?.message?.trim() || defaultVerifyMsg,
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

  const workspace = panel
    ? renderTestWorkspace(panel, canSend, defaultVerifyMsg, initialFeeds)
    : "";

  const body = `
    ${renderSuperadminBanner(
      "Pruebas telsim y QA pre-campaña. Los clientes no ven este panel en Enviar SMS.",
    )}
    ${renderPageHeader({
      title: "Test",
      subtitle: "Motor de envío SMS, bandeja entrante telsim y checklist pre-campaña.",
    })}
    ${flashBlock}
    ${errorBlock}
    ${opsChips}
    ${preCampaignBanner}
    <div class="tv-test-layout">
      <div class="tv-test-layout__main">
        ${workspace}
      </div>
      <aside class="tv-test-layout__aside">
        ${renderPanel("Checklist pre-campaña", checklistHtml)}
      </aside>
    </div>
    <script>
    (function(){
      var telsimSelect = document.getElementById('tv-telsim-line-select');
      var sendLineSelect = document.getElementById('tv-send-line-select');
      var telsimLines = ${telsimVerifyDataJson};
      var defaultVerifyMsg = ${JSON.stringify(defaultVerifyMsg)};
      var pollTimer = null;

      function statusBadgeHtml(status){
        var map = { delivered:'ok', sent:'ok', pending:'warn', queued:'warn', failed:'err' };
        var cls = map[status] || 'muted';
        return '<span class="badge badge-'+cls+'">'+(status || '—')+'</span>';
      }
      function formatTelsimLastTest(at){
        if(!at) return 'Sin test reciente';
        try {
          return new Date(at).toLocaleString('es-CL', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
        } catch(e) { return at; }
      }
      function formatInboundTime(iso){
        try {
          return new Date(iso).toLocaleString('es-CL', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', second:'2-digit' });
        } catch(e) { return iso; }
      }
      function escapeHtmlClient(s){
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }
      function renderFeedHtml(messages){
        if(!messages.length){
          return '<p class="tv-telsim-feed__empty">Sin SMS entrantes en esta línea. Envía una prueba o espera el webhook <code>sms.received</code>.</p>';
        }
        return messages.map(function(m, i){
          var isLatest = i === messages.length - 1;
          var text = (m.content && m.content.trim()) || (m.verificationCode ? 'Código: '+m.verificationCode : '—');
          return '<div class="tv-telsim-feed__item'+(isLatest ? ' tv-telsim-feed__item--latest' : '')+'" data-inbound-id="'+escapeHtmlClient(m.id)+'">'+
            '<div class="tv-hero-phone__bubble tv-hero-phone__bubble--in">'+escapeHtmlClient(text)+'</div>'+
            '<div class="tv-telsim-feed__meta"><span class="tv-telsim-feed__from">'+escapeHtmlClient((m.from||'').trim() || 'Desconocido')+'</span>'+
            '<span class="tv-telsim-feed__sep" aria-hidden="true">·</span>'+
            '<time datetime="'+escapeHtmlClient(m.receivedAt)+'">'+escapeHtmlClient(formatInboundTime(m.receivedAt))+'</time></div></div>';
        }).join('');
      }
      function mergeInboundMessages(existing, incoming){
        var byId = {};
        (existing || []).forEach(function(m){ byId[m.id] = m; });
        var added = [];
        (incoming || []).forEach(function(m){
          if(!byId[m.id]){ added.push(m); }
          byId[m.id] = m;
        });
        var merged = Object.keys(byId).map(function(k){ return byId[k]; });
        merged.sort(function(a,b){ return new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime(); });
        return { merged: merged, addedIds: added.map(function(m){ return m.id; }) };
      }
      function renderInboundPhoneClient(line, messages){
        var latest = messages.length ? messages[messages.length - 1] : null;
        var headFrom = latest && latest.from ? latest.from.trim() : 'SMS entrante';
        if(!headFrom) headFrom = 'SMS entrante';
        var initial = (headFrom.charAt(0) || 'S').toUpperCase();
        return '<div class="tv-hero-phone tv-hero-phone--compact tv-telsim-phone-feed" id="tv-telsim-phone-shell">'+
          '<div class="tv-hero-phone__notch" aria-hidden="true"></div>'+
          '<div class="tv-hero-phone__screen">'+
          '<div class="tv-hero-phone__app-head"><div class="tv-hero-phone__avatar" aria-hidden="true">'+escapeHtmlClient(initial)+'</div><div>'+
          '<div class="tv-hero-phone__app-title" id="tv-telsim-feed-title">'+escapeHtmlClient(headFrom)+'</div>'+
          '<div class="tv-hero-phone__app-sub" id="tv-telsim-feed-sub">'+escapeHtmlClient(line.label)+' · '+escapeHtmlClient(line.operator)+'</div></div></div>'+
          '<div class="tv-hero-phone__messages tv-telsim-feed" id="tv-telsim-feed" role="log" aria-live="polite" aria-relevant="additions">'+
          renderFeedHtml(messages)+'</div></div></div>';
      }
      function getLineBySelectIndex(selectEl){
        if(!selectEl || !telsimLines.length) return null;
        return telsimLines[Number(selectEl.value)] || telsimLines[0];
      }
      function syncSendLineToInbound(){
        if(!sendLineSelect || !telsimSelect) return;
        sendLineSelect.value = telsimSelect.value;
        var line = getLineBySelectIndex(telsimSelect);
        var verifyId = document.getElementById('tv-telsim-verify-id');
        if(line && verifyId) verifyId.value = line.id;
      }
      function syncInboundToSendLine(){
        if(!sendLineSelect || !telsimSelect) return;
        telsimSelect.value = sendLineSelect.value;
        updateTelsimLine(false);
      }
      function updateTelsimLine(scrollToLatest){
        if(typeof scrollToLatest === 'undefined') scrollToLatest = true;
        var line = getLineBySelectIndex(telsimSelect);
        if(!line) return;
        var verifyId = document.getElementById('tv-telsim-verify-id');
        if(verifyId) verifyId.value = line.id;
        if(sendLineSelect) sendLineSelect.value = String(telsimLines.indexOf(line));
        var wrap = document.getElementById('tv-telsim-phone-wrap');
        if(wrap){
          wrap.innerHTML = renderInboundPhoneClient(line, line.inboundMessages || []);
          wrap.classList.toggle('tv-telsim-panel__phone--ready', !!line.ready);
          wrap.classList.toggle('tv-telsim-panel__phone--pending', !line.ready);
          wrap.classList.toggle('tv-telsim-panel__phone--pulse', false);
        }
        var metaEl = document.getElementById('tv-telsim-meta');
        if(metaEl) {
          var count = (line.inboundMessages || []).length;
          metaEl.innerHTML = statusBadgeHtml(line.status) + ' · ' + formatTelsimLastTest(line.lastTestAt) + (line.dlrReceived ? ' · DLR OK' : '') + ' · <span id="tv-telsim-inbound-count">'+count+'</span> entrante(s)';
        }
        if(scrollToLatest){
          var feed = document.getElementById('tv-telsim-feed');
          if(feed) feed.scrollTop = feed.scrollHeight;
        }
      }
      var defaultLineHint = 'Al llegar un SMS a otra línea, la vista cambia automáticamente a esa línea.';
      function flashLineHint(text){
        var hint = document.getElementById('tv-telsim-line-hint');
        if(!hint) return;
        hint.textContent = text;
        hint.classList.add('tv-telsim-line-hint--alert');
        setTimeout(function(){
          hint.classList.remove('tv-telsim-line-hint--alert');
          hint.textContent = defaultLineHint;
        }, 5000);
      }
      if(telsimSelect){
        telsimSelect.addEventListener('change', function(){ updateTelsimLine(true); syncSendLineToInbound(); });
        updateTelsimLine(true);
      }
      if(sendLineSelect){
        sendLineSelect.addEventListener('change', syncInboundToSendLine);
      }
      var recipientRadios = document.querySelectorAll('[data-tv-recipient-mode]');
      var lineWrap = document.getElementById('tv-recipient-line-wrap');
      var customWrap = document.getElementById('tv-recipient-custom-wrap');
      function syncRecipientMode(){
        var mode = 'line';
        recipientRadios.forEach(function(r){ if(r.checked) mode = r.value; });
        if(lineWrap) lineWrap.hidden = mode !== 'line';
        if(customWrap) customWrap.hidden = mode !== 'custom';
        var verifyInput = document.getElementById('tv-telsim-verify-id');
        if(verifyInput) verifyInput.disabled = mode === 'custom';
      }
      recipientRadios.forEach(function(r){ r.addEventListener('change', syncRecipientMode); });
      syncRecipientMode();
      var msgEl = document.getElementById('tv-send-message');
      var charsEl = document.getElementById('tv-send-chars');
      function updateChars(){
        if(msgEl && charsEl) charsEl.textContent = String((msgEl.value || '').length);
      }
      if(msgEl){ msgEl.addEventListener('input', updateChars); updateChars(); }
      var telsimWebhookCopy = document.getElementById('tv-telsim-webhook-copy');
      var telsimWebhookUrl = document.getElementById('tv-telsim-webhook-url');
      if(telsimWebhookCopy && telsimWebhookUrl){
        telsimWebhookCopy.addEventListener('click', function(){
          telsimWebhookUrl.select();
          telsimWebhookUrl.setSelectionRange(0, 99999);
          var val = telsimWebhookUrl.value || '';
          if(navigator.clipboard && navigator.clipboard.writeText){
            navigator.clipboard.writeText(val).catch(function(){});
          }
        });
      }
      function pollTelsimInbound(){
        if(!telsimLines.length) return;
        fetch('/admin/test/telsim-preview', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(data){
            if(!data || !data.lines) return;
            var lineWithNewInbound = null;
            telsimLines.forEach(function(line){
              var upd = data.lines[line.id];
              if(!upd || !upd.inboundMessages) return;
              var result = mergeInboundMessages(line.inboundMessages, upd.inboundMessages);
              if(result.addedIds.length){
                line.inboundMessages = result.merged;
                line.latestInboundId = upd.latestInboundId || result.merged[result.merged.length-1].id;
                line.ready = upd.ready;
                lineWithNewInbound = line;
              }
            });
            if(lineWithNewInbound && telsimSelect){
              var idx = telsimLines.indexOf(lineWithNewInbound);
              if(String(telsimSelect.value) !== String(idx)){
                telsimSelect.value = String(idx);
                flashLineHint('Nuevo SMS en '+lineWithNewInbound.label+' ('+lineWithNewInbound.masked+')');
              }
              var phoneWrap = document.getElementById('tv-telsim-phone-wrap');
              if(phoneWrap) phoneWrap.classList.add('tv-telsim-panel__phone--pulse');
              updateTelsimLine(true);
              syncSendLineToInbound();
            }
          })
          .catch(function(){});
      }
      if(telsimSelect){
        pollTelsimInbound();
        pollTimer = setInterval(pollTelsimInbound, 4000);
      }
      var sendForm = document.getElementById('tv-test-send-form');
      if(sendForm){
        sendForm.addEventListener('submit', function(){
          var btn = sendForm.querySelector('button[type=submit]');
          if(btn){ btn.setAttribute('disabled','disabled'); btn.textContent = 'Enviando…'; }
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
