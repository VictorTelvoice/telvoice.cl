import type { AdminSessionUser } from "../../../types/admin.js";
import {
  formatVerifyLastTest,
  type SendControlPanelView,
} from "../../../services/smsSendControlPanelService.js";
import { escapeHtml } from "../../../utils/html.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import {
  renderHeroPhonePreview,
  renderNotice,
  renderPageHeader,
  renderPanel,
  renderStatChip,
} from "../page-kit.js";
import { renderSuperadminBanner } from "../superadmin-kit.js";
import { renderPanelMessageStatusBadge } from "../../app-ui/app-sms-ui.js";

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

function renderTelsimVerifyPanel(
  panel: SendControlPanelView,
  canSend: boolean,
  defaultVerifyMessage: string,
): string {
  if (panel.verifyNumbers.length === 0) {
    return `<section class="tv-panel tv-telsim-panel" id="tv-verify-section">
      <header class="tv-section-head">
        <h2 class="tv-section-head__title">Verificación telsim.io</h2>
      </header>
      <div class="tv-panel__body">
        <div class="tv-verify-empty">
          <p>No hay líneas configuradas.</p>
          <p class="field-hint">Define <code>TELVOICE_VERIFY_NUMBERS</code> en el servidor.</p>
        </div>
      </div>
    </section>`;
  }

  const first = panel.verifyNumbers[0]!;
  const firstMsg = first.lastTest?.message?.trim() || defaultVerifyMessage;
  const firstInbound = first.lastTelsimInbound;
  const firstPreview =
    firstInbound?.content?.trim() ||
    (firstInbound?.verificationCode
      ? `Código: ${firstInbound.verificationCode}`
      : "") ||
    firstMsg;
  const firstPreviewSender =
    firstInbound &&
    (firstInbound.content.trim() || firstInbound.verificationCode)
      ? firstInbound.from.trim() || "SMS entrante"
      : first.lastTest?.sender_id?.trim() || "TELVOICE";
  const disabled = canSend ? "" : "disabled";

  const lineOptions = panel.verifyNumbers
    .map(
      (v, i) =>
        `<option value="${i}">${escapeHtml(v.entry.operator)} — ${escapeHtml(v.entry.label)} (${escapeHtml(v.maskedPhone)})</option>`,
    )
    .join("");

  const webhookBlock = panel.telsimWebhookConfigured
    ? `<div class="form-group tv-telsim-webhook">
          <label>Webhook URL (POST en telsim.io)</label>
          <div class="tv-copy-row">
            <input type="text" class="tv-input-full" readonly value="${escapeHtml(panel.telsimWebhookUrl)}" id="tv-telsim-webhook-url" aria-label="URL webhook Telsim" />
            <button type="button" class="btn btn-secondary btn-sm" id="tv-telsim-webhook-copy">Copiar</button>
          </div>
          <p class="field-hint">Evento <code>sms.received</code>. Requiere <code>TELSIM_WEBHOOK_SECRET</code> en el servidor.</p>
        </div>`
    : `<p class="field-hint tv-telsim-webhook-missing">Define <code>PUBLIC_WEBHOOK_BASE_URL</code> para obtener la URL del webhook.</p>`;

  return `<section class="tv-panel tv-telsim-panel" id="tv-verify-section">
      <header class="tv-section-head">
        <h2 class="tv-section-head__title">Verificación telsim.io</h2>
        <p class="tv-section-head__sub">Líneas QA, webhook entrante y test pre-campaña (solo operación interna)</p>
      </header>
      <div class="tv-panel__body tv-telsim-panel__body">
        ${webhookBlock}
        <div class="form-group tv-telsim-panel__select">
          <label for="tv-telsim-line-select">Línea de prueba</label>
          <select id="tv-telsim-line-select" class="tv-input-full" ${disabled} aria-label="Seleccionar línea telsim">
            ${lineOptions}
          </select>
        </div>
        <div class="tv-telsim-panel__phone" id="tv-telsim-phone-wrap">
          ${renderHeroPhonePreview({
            senderLabel: firstPreviewSender,
            senderSub: "Vía Telvoice A2P",
            message: firstPreview,
            bubbleId: "tv-telsim-bubble",
            compact: true,
          })}
        </div>
        <p class="tv-telsim-panel__status field-hint" id="tv-telsim-meta">
          ${renderPanelMessageStatusBadge(first.lastStatus, "live_test")}
          · ${escapeHtml(formatVerifyLastTest(first.lastTestAt))}${first.dlrReceived ? " · DLR OK" : ""}${firstInbound ? " · SMS entrante telsim" : ""}
        </p>
        <form method="post" action="/admin/test/qa-send" class="tv-telsim-panel__form" id="tv-telsim-qa-form">
          <input type="hidden" name="verify_id" id="tv-telsim-verify-id" value="${escapeHtml(first.entry.id)}" />
          <input type="hidden" name="sender_id" value="TELVOICE" />
          <button type="submit" class="btn btn-secondary btn-sm tv-telsim-panel__btn" ${disabled}>
            <span class="material-symbols-outlined" aria-hidden="true">science</span>
            Enviar test QA
          </button>
        </form>
      </div>
    </section>`;
}

export function renderAdminTestPage(options: {
  admin: AdminSessionUser;
  panel: SendControlPanelView | null;
  sendEnabled: boolean;
  flash?: string;
  error?: string;
}): string {
  const panel = options.panel;
  const canSend = options.sendEnabled;
  const defaultVerifyMsg = panel?.defaultVerifyMessage ?? "";

  const flashBlock = options.flash
    ? `<div class="alert alert-success">${escapeHtml(options.flash)}</div>`
    : "";
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  const lt = panel?.sendStatus;
  const dailyRemaining =
    lt?.trafficDailyRemaining != null && lt.trafficDailyLimit != null
      ? `${lt.trafficDailyRemaining} / ${lt.trafficDailyLimit}`
      : lt
        ? `${lt.dailyRemaining} / ${lt.dailyLimit}`
        : "—";

  const opsChips =
    panel && lt
      ? `<div class="tv-stat-chips tv-stat-chips--ops" style="margin-bottom:1rem">
      ${renderStatChip("Ruta", lt.routeName ?? "—", "primary")}
      ${renderStatChip("Webhook DLR", panel.webhookConfigured ? "Activo" : "Off", panel.webhookConfigured ? "success" : "warn")}
      ${renderStatChip("Webhook telsim", panel.telsimWebhookConfigured ? "Activo" : "Off", panel.telsimWebhookConfigured ? "success" : "warn")}
      ${renderStatChip("Cuota hoy", dailyRemaining, "default")}
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
          const outbound =
            v.lastTest?.message?.trim() || defaultVerifyMsg;
          const inbound = v.lastTelsimInbound;
          const preview =
            inbound?.content?.trim() ||
            (inbound?.verificationCode
              ? `Código: ${inbound.verificationCode}`
              : "") ||
            outbound;
          return {
            id: v.entry.id,
            operator: v.entry.operator,
            label: v.entry.label,
            masked: v.maskedPhone,
            message: outbound,
            previewMessage: preview,
            previewSender:
              inbound &&
              (inbound.content.trim() || inbound.verificationCode)
                ? inbound.from.trim() || "SMS entrante"
                : v.lastTest?.sender_id?.trim() || "TELVOICE",
            inboundCode: inbound?.verificationCode ?? null,
            inboundAt: inbound?.receivedAt ?? null,
            sender: v.lastTest?.sender_id?.trim() || "TELVOICE",
            status: v.lastStatus,
            lastTestAt: v.lastTestAt,
            dlrReceived: v.dlrReceived,
            ready: v.readyForCampaign,
          };
        }),
      )
    : "[]";

  const telsimPanel = panel
    ? renderTelsimVerifyPanel(panel, canSend, defaultVerifyMsg)
    : "";

  const body = `
    ${renderSuperadminBanner(
      "Pruebas telsim y QA pre-campaña. Los clientes no ven este panel en Enviar SMS.",
    )}
    ${renderPageHeader({
      title: "Test",
      subtitle: "Verificación de líneas telsim.io, SMS entrantes y envíos QA antes de campañas.",
    })}
    ${flashBlock}
    ${errorBlock}
    ${opsChips}
    ${preCampaignBanner}
    <div class="tv-test-layout">
      <div class="tv-test-layout__main">
        ${telsimPanel}
      </div>
      <aside class="tv-test-layout__aside">
        ${renderPanel("Checklist pre-campaña", checklistHtml)}
      </aside>
    </div>
    <script>
    (function(){
      var telsimSelect = document.getElementById('tv-telsim-line-select');
      var telsimLines = ${telsimVerifyDataJson};
      var defaultVerifyMsg = ${JSON.stringify(defaultVerifyMsg)};
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
      function updateTelsimLine(){
        if(!telsimSelect || !telsimLines.length) return;
        var line = telsimLines[Number(telsimSelect.value)] || telsimLines[0];
        if(!line) return;
        var telsimVerifyId = document.getElementById('tv-telsim-verify-id');
        if(telsimVerifyId) telsimVerifyId.value = line.id;
        var bubble = document.getElementById('tv-telsim-bubble');
        var title = document.querySelector('#tv-telsim-phone-wrap .tv-hero-phone__app-title');
        if(bubble) bubble.textContent = line.previewMessage || line.message || defaultVerifyMsg;
        if(title) title.textContent = line.previewSender || line.sender || 'TELVOICE';
        var metaEl = document.getElementById('tv-telsim-meta');
        if(metaEl) {
          var inboundHint = line.inboundAt ? ' · SMS entrante telsim' : '';
          metaEl.innerHTML = statusBadgeHtml(line.status) + ' · ' + formatTelsimLastTest(line.lastTestAt) + (line.dlrReceived ? ' · DLR OK' : '') + inboundHint;
        }
        var wrap = document.getElementById('tv-telsim-phone-wrap');
        if(wrap) {
          wrap.classList.toggle('tv-telsim-panel__phone--ready', !!line.ready);
          wrap.classList.toggle('tv-telsim-panel__phone--pending', !line.ready);
        }
      }
      if(telsimSelect){
        telsimSelect.addEventListener('change', updateTelsimLine);
        updateTelsimLine();
      }
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
            var changed = false;
            telsimLines.forEach(function(line){
              var upd = data.lines[line.id];
              if(!upd) return;
              if(upd.previewMessage && upd.previewMessage !== line.previewMessage){
                line.previewMessage = upd.previewMessage;
                line.previewSender = upd.previewSender || line.previewSender;
                line.inboundAt = upd.inboundAt;
                line.inboundCode = upd.inboundCode;
                line.ready = upd.ready;
                changed = true;
              }
            });
            if(changed) updateTelsimLine();
          })
          .catch(function(){});
      }
      if(telsimSelect){
        setInterval(pollTelsimInbound, 8000);
        pollTelsimInbound();
      }
      var qaForm = document.getElementById('tv-telsim-qa-form');
      if(qaForm){
        qaForm.addEventListener('submit', function(){
          var btn = qaForm.querySelector('button[type=submit]');
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
