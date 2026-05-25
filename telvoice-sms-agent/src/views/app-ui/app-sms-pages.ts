import type { MockSmsSendResult } from "../../types/sms-panel.js";
import type { SmsCampaignRow } from "../../types/sms-panel.js";
import type { PanelSmsMessageRow } from "../../types/sms-panel.js";
import type { ClientSmsReportData } from "../../services/smsPanelReportsService.js";
import type { LiveTestSendPageStatus } from "../../services/smsLiveTestLimiterService.js";
import type { SendControlPanelView } from "../../services/smsSendControlPanelService.js";
import { formatVerifyLastTest } from "../../services/smsSendControlPanelService.js";
import { escapeHtml } from "../../utils/html.js";
import {
  renderBtn,
  renderHeroPhonePreview,
  renderMobilePreview,
  renderModeCards,
  renderNotice,
  renderPageHeader,
  renderPanel,
  renderStatChip,
} from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtSms, wrapAppPage } from "./app-page-wrap.js";
import {
  renderCampaignsTableRows,
  renderInboxTableRows,
  renderPanelMessageStatusBadge,
} from "./app-sms-ui.js";
import { formatDate } from "../../utils/html.js";

export type SendSmsPageOptions = {
  error?: string;
  sendResult?: MockSmsSendResult | null;
  sendEnabled?: boolean;
  liveTestStatus?: LiveTestSendPageStatus | null;
  controlPanel?: SendControlPanelView | null;
};

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
  const firstSender = first.lastTest?.sender_id?.trim() || "TELVOICE";
  const disabled = canSend ? "" : "disabled";

  const lineOptions = panel.verifyNumbers
    .map(
      (v, i) =>
        `<option value="${i}">${escapeHtml(v.entry.operator)} — ${escapeHtml(v.entry.label)} (${escapeHtml(v.maskedPhone)})</option>`,
    )
    .join("");

  return `<section class="tv-panel tv-telsim-panel" id="tv-verify-section">
      <header class="tv-section-head">
        <h2 class="tv-section-head__title">Verificación telsim.io</h2>
        <p class="tv-section-head__sub">Selecciona operador y envía test QA</p>
      </header>
      <div class="tv-panel__body tv-telsim-panel__body">
        <div class="form-group tv-telsim-panel__select">
          <label for="tv-telsim-line-select">Línea de prueba</label>
          <select id="tv-telsim-line-select" class="tv-input-full" ${disabled} aria-label="Seleccionar línea telsim">
            ${lineOptions}
          </select>
        </div>
        <div class="tv-telsim-panel__phone" id="tv-telsim-phone-wrap">
          ${renderHeroPhonePreview({
            senderLabel: firstSender,
            senderSub: "Vía Telvoice A2P",
            message: firstMsg,
            bubbleId: "tv-telsim-bubble",
            compact: true,
          })}
        </div>
        <p class="tv-telsim-panel__status field-hint" id="tv-telsim-meta">
          ${renderPanelMessageStatusBadge(first.lastStatus, "live_test")}
          · ${escapeHtml(formatVerifyLastTest(first.lastTestAt))}${first.dlrReceived ? " · DLR OK" : ""}
        </p>
        <form method="post" action="/app/send-sms" class="tv-telsim-panel__form" id="tv-telsim-qa-form">
          <input type="hidden" name="verify_id" id="tv-telsim-verify-id" value="${escapeHtml(first.entry.id)}" />
          <input type="hidden" name="sender_id" value="TELVOICE" />
          <input type="hidden" name="quick_verify" value="1" />
          <button type="submit" class="btn btn-secondary btn-sm tv-telsim-panel__btn" ${disabled}>
            <span class="material-symbols-outlined" aria-hidden="true">science</span>
            Enviar test QA
          </button>
        </form>
      </div>
    </section>`;
}

export function renderAppSendSmsPage(
  ctx: AppPageContext,
  opts: SendSmsPageOptions = {},
): string {
  const avail = ctx.balance.availableSms;
  const errorBlock = opts.error
    ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>`
    : "";

  const lt = opts.liveTestStatus;
  const panel = opts.controlPanel;
  const canSend = lt?.canSelectLiveTest ?? false;
  const defaultVerifyMsg = panel?.defaultVerifyMessage ?? "";

  const verifyPhonesForJs = panel
    ? panel.verifyNumbers.map((v) => v.entry.phone)
    : [];
  const envAllowed = lt?.allowedNumbersNormalized ?? [];
  const allowedLiveNumbers = [...new Set([...envAllowed, ...verifyPhonesForJs])];

  const dailyRemaining =
    lt?.trafficDailyRemaining != null && lt.trafficDailyLimit != null
      ? `${lt.trafficDailyRemaining} / ${lt.trafficDailyLimit}`
      : lt
        ? `${lt.dailyRemaining} / ${lt.dailyLimit}`
        : "—";

  const disabledAttr = canSend ? "" : "disabled";
  const submitDisabled = canSend ? "" : "disabled";

  const headerActions = `
    ${renderBtn("Bandeja", { href: "/app/inbox", variant: "ghost" })}
    ${renderBtn("Reportes", { href: "/app/reports", variant: "ghost" })}
    <button type="submit" form="tv-app-send-form" class="tv-btn-campaign" id="tv-header-send-btn" ${submitDisabled}>
      <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">send</span>
      Enviar SMS
    </button>`;

  const modes = renderModeCards(
    [
      {
        id: "single",
        label: "SMS individual",
        description: "Un destinatario, envío inmediato.",
        icon: "person",
      },
      {
        id: "verify",
        label: "Verificación telsim",
        description: "Prueba DLR antes de campaña.",
        icon: "science",
      },
      {
        id: "mass",
        label: "Campaña masiva",
        description: "Listas y envíos programados.",
        icon: "groups",
      },
      {
        id: "template",
        label: "Desde plantilla",
        description: "Mensajes con variables.",
        icon: "description",
      },
    ],
    "single",
  );

  const varChips = ["{{nombre}}", "{{empresa}}"]
    .map(
      (v) =>
        `<button type="button" class="tv-var-chip tv-var-btn" data-var="${escapeHtml(v)}">${escapeHtml(v)}</button>`,
    )
    .join("");

  const telsimVerifyDataJson = panel
    ? JSON.stringify(
        panel.verifyNumbers.map((v) => ({
          id: v.entry.id,
          operator: v.entry.operator,
          label: v.entry.label,
          masked: v.maskedPhone,
          message:
            v.lastTest?.message?.trim() || defaultVerifyMsg,
          sender: v.lastTest?.sender_id?.trim() || "TELVOICE",
          status: v.lastStatus,
          lastTestAt: v.lastTestAt,
          dlrReceived: v.dlrReceived,
          ready: v.readyForCampaign,
        })),
      )
    : "[]";

  const telsimPanel = panel
    ? renderTelsimVerifyPanel(panel, canSend, defaultVerifyMsg)
    : "";

  const opsChips =
    panel && lt
      ? `<div class="tv-stat-chips tv-stat-chips--ops">
      ${renderStatChip("Saldo SMS", fmtSms(avail), "success")}
      ${renderStatChip("Ruta", lt.routeName ?? "—", "primary")}
      ${renderStatChip("Webhook", panel.webhookConfigured ? "Activo" : "Off", panel.webhookConfigured ? "success" : "warn")}
      ${renderStatChip("Cuota hoy", dailyRemaining, "default")}
      ${renderStatChip("TPS", lt.effectiveTps != null ? String(lt.effectiveTps) : "—", "default")}
    </div>`
      : "";

  const preCampaignBanner =
    panel && panel.verifyNumbers.length > 0 && !panel.allVerifyNumbersReady
      ? renderNotice(
          "Validación pre-campaña pendiente: envía test QA a cada línea telsim y confirma DLR.",
          "warn",
        )
      : panel && panel.allVerifyNumbersReady && panel.verifyNumbers.length > 0
        ? `<div class="alert tv-precampaign-banner tv-precampaign-banner--ok">
      <strong>Listo para campaña.</strong> Todas las líneas de verificación respondieron correctamente.
    </div>`
        : "";

  const successBlock = opts.sendResult
    ? `<section class="tv-panel tv-panel--hint tv-send-result">
      <header class="tv-section-head"><h2 class="tv-section-head__title">Envío registrado</h2></header>
      <div class="tv-panel__body">
        <ul class="tv-send-result__list">
          <li><strong>Destino:</strong> ${escapeHtml(opts.sendResult.recipientNumber)}</li>
          <li><strong>Segmentos:</strong> ${opts.sendResult.segments}</li>
          <li><strong>Saldo:</strong> ${fmtSms(opts.sendResult.balanceBefore)} → ${fmtSms(opts.sendResult.balanceAfter)} SMS</li>
          <li><strong>Estado:</strong> ${renderPanelMessageStatusBadge(opts.sendResult.status, opts.sendResult.sendMode)}</li>
        </ul>
        <p class="field-hint">«Entregado» se actualiza cuando el operador confirma vía webhook DLR.</p>
      </div>
    </section>`
    : "";

  const blockHint =
    lt?.liveTestBlockReason && !canSend
      ? `<p class="field-hint tv-send-block-reason">${escapeHtml(lt.liveTestBlockReason)}</p>`
      : "";

  const checklistHtml = panel
    ? `<ul class="tv-checklist">
        ${panel.checklist.map((c) => renderChecklistItem(c.ok, c.label, c.hint)).join("")}
      </ul>
      ${blockHint}`
    : `<p class="alert alert-error">El envío SMS no está disponible. Contacte a soporte Telvoice.</p>`;

  const sendForm = !panel
    ? checklistHtml
    : `
    <form method="post" action="/app/send-sms" id="tv-app-send-form" class="tv-send-layout">
      <div class="tv-send-main">
        ${modes}
        <section class="tv-panel">
          <div class="tv-panel__body">
            <div class="tv-form-grid">
              <div class="form-group">
                <label for="campaign_name">Nombre de campaña (opcional)</label>
                <input id="campaign_name" class="tv-input-full" name="campaign_name" placeholder="Ej. Bienvenida clientes" ${disabledAttr} />
              </div>
              <div class="form-group">
                <label for="sender_id">Remitente / Sender ID</label>
                <input id="sender_id" class="tv-input-full" name="sender_id" value="TELVOICE" required maxlength="11" ${disabledAttr} />
              </div>
            </div>
            <div class="form-group">
              <label for="tv-send-to">Número destinatario</label>
              <input class="tv-input-full" name="to" id="tv-send-to" placeholder="+56912345678" required ${disabledAttr} />
            </div>
            <div class="form-group">
              <label for="tv-sms-message">Mensaje SMS</label>
              <textarea id="tv-sms-message" class="tv-input-full" name="message" rows="5" required placeholder="Escribe tu mensaje…" ${disabledAttr}></textarea>
              <div class="tv-var-row">
                <button type="button" class="tv-var-chip tv-template-btn" data-template="qa">QA pre-campaña</button>
                <button type="button" class="tv-var-chip tv-template-btn" data-template="dlr">Test DLR</button>
                ${varChips}
              </div>
            </div>
            <p class="field-hint tv-live-segment-warn" id="tv-live-segment-warn" hidden>El mensaje supera el máximo de segmentos permitido.</p>
            <p class="field-hint tv-live-number-warn" id="tv-live-number-warn" hidden>El número destino no está autorizado.</p>
            <button type="submit" class="btn btn-primary tv-send-submit" id="tv-send-submit" ${submitDisabled}>Enviar SMS</button>
          </div>
        </section>
        ${renderPanel("Checklist pre-campaña", checklistHtml)}
      </div>
      <aside class="tv-send-aside">
        ${telsimPanel}
        <section class="tv-panel">
          <header class="tv-section-head"><h2 class="tv-section-head__title">Vista previa móvil</h2></header>
          <div class="tv-panel__body tv-panel__body--center">
            ${renderMobilePreview("TELVOICE", "Hola, tu mensaje aparecerá aquí.")}
          </div>
        </section>
        <section class="tv-panel tv-validation-panel">
          <header class="tv-section-head"><h2 class="tv-section-head__title">Validación</h2></header>
          <div class="tv-panel__body">
            <div class="tv-stat-chips tv-stat-chips--compact tv-validation-chips">
              ${renderStatChip("Caracteres", "0", "default")}
              ${renderStatChip("Segmentos", "0", "primary")}
              ${renderStatChip("Costo est.", "0 SMS", "primary")}
              ${renderStatChip("Codificación", "GSM-7", "default")}
            </div>
          </div>
        </section>
      </aside>
    </form>`;

  const body = `
    <div class="tv-app-send-page">
    ${renderPageHeader({
      title: "Enviar SMS",
      subtitle: "Envío unitario, verificación telsim.io y validación DLR antes de campañas.",
      actions: panel ? headerActions : undefined,
    })}
    ${errorBlock}
    ${opsChips}
    ${preCampaignBanner}
    ${successBlock}
    ${sendForm}
    </div>
    <script>
    (function(){
      var ta = document.getElementById('tv-sms-message');
      var senderInput = document.getElementById('sender_id');
      var toInput = document.getElementById('tv-send-to');
      var telsimSelect = document.getElementById('tv-telsim-line-select');
      var telsimLines = ${telsimVerifyDataJson};
      var avail = ${avail};
      var maxLiveSegments = ${lt?.maxSegments ?? 3};
      var canSend = ${canSend ? "true" : "false"};
      var numbersRestricted = ${lt?.authorizedNumbersConfigured ? "true" : "false"};
      var allowedLiveNumbers = ${JSON.stringify(allowedLiveNumbers)};
      var defaultVerifyMsg = ${JSON.stringify(defaultVerifyMsg)};
      var templateQa = defaultVerifyMsg;
      var templateDlr = '[Telvoice DLR] Test entrega ' + new Date().toISOString().slice(0,16).replace('T',' ') + '.';
      function gsmBasic(ch){ return /^[@£$¥èéùìòÇ\\nØø\\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\\-./0-9:;<=>?¡A-Za-zäöñüà^{}\\\\\\[\\]~|€]*$/.test(ch); }
      function calc(text){
        var chars = [...text].length;
        if(!chars) return {chars:0,enc:'GSM-7',seg:0,cost:0};
        if(gsmBasic(text)){
          if(chars<=160) return {chars:chars,enc:'GSM-7',seg:1,cost:1};
          return {chars:chars,enc:'GSM-7',seg:Math.ceil(chars/153),cost:Math.ceil(chars/153)};
        }
        if(chars<=70) return {chars:chars,enc:'UCS-2',seg:1,cost:1};
        return {chars:chars,enc:'UCS-2',seg:Math.ceil(chars/67),cost:Math.ceil(chars/67)};
      }
      function normalizePhoneDigits(v){
        var d = (v || '').replace(/\\D/g,'');
        if(d.length===11 && d.charAt(0)==='9') return '56'+d;
        if(d.length===9 && d.charAt(0)==='9') return '56'+d;
        return d;
      }
      function isRecipientAllowed(){
        if(!numbersRestricted && allowedLiveNumbers.length === 0) return true;
        if(!toInput) return true;
        var v = (toInput.value || '').trim();
        if(!v) return true;
        if(!allowedLiveNumbers.length && !numbersRestricted) return true;
        var digits = normalizePhoneDigits(v);
        return allowedLiveNumbers.some(function(n){
          var a = normalizePhoneDigits(n);
          return a === digits || a === digits.replace(/^\\+/,'');
        });
      }
      function setChip(label, value){
        document.querySelectorAll('.tv-validation-chips .tv-stat-chip').forEach(function(chip){
          var l = chip.querySelector('.tv-stat-chip__label');
          var val = chip.querySelector('.tv-stat-chip__value');
          if(l && val && l.textContent === label) val.textContent = value;
        });
      }
      function formatTelsimLastTest(at){
        if(!at) return 'Sin test reciente';
        try {
          var d = new Date(at);
          return d.toLocaleString('es-CL', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
        } catch(e) { return at; }
      }
      function statusBadgeHtml(status){
        var map = { delivered:'ok', sent:'ok', pending:'warn', queued:'warn', failed:'err' };
        var cls = map[status] || 'muted';
        var label = status || '—';
        return '<span class="badge badge-'+cls+'">'+label+'</span>';
      }
      function updateTelsimLine(){
        if(!telsimSelect || !telsimLines.length) return;
        var line = telsimLines[Number(telsimSelect.value)] || telsimLines[0];
        if(!line) return;
        var telsimVerifyId = document.getElementById('tv-telsim-verify-id');
        if(telsimVerifyId) telsimVerifyId.value = line.id;
        var bubble = document.getElementById('tv-telsim-bubble');
        var title = document.querySelector('#tv-telsim-phone-wrap .tv-hero-phone__app-title');
        if(bubble) bubble.textContent = line.message || defaultVerifyMsg;
        if(title) title.textContent = line.sender || 'TELVOICE';
        var metaEl = document.getElementById('tv-telsim-meta');
        if(metaEl) {
          metaEl.innerHTML = statusBadgeHtml(line.status) + ' · ' + formatTelsimLastTest(line.lastTestAt) + (line.dlrReceived ? ' · DLR OK' : '');
        }
        var wrap = document.getElementById('tv-telsim-phone-wrap');
        if(wrap) {
          wrap.classList.toggle('tv-telsim-panel__phone--ready', !!line.ready);
          wrap.classList.toggle('tv-telsim-panel__phone--pending', !line.ready);
        }
      }
      function refresh(){
        if(!ta) return;
        var t = ta.value || '';
        var c = calc(t);
        setChip('Caracteres', String(c.chars));
        setChip('Segmentos', String(c.seg));
        setChip('Costo est.', c.cost + ' SMS');
        setChip('Codificación', c.enc);
        var bubble = document.querySelector('.tv-phone__bubble');
        var phoneHeader = document.querySelector('.tv-phone__header');
        if(bubble) bubble.textContent = t || 'Hola, tu mensaje aparecerá aquí.';
        if(phoneHeader && senderInput) phoneHeader.textContent = senderInput.value || 'TELVOICE';
        var overSeg = c.seg > maxLiveSegments;
        var numOk = isRecipientAllowed();
        var segWarn = document.getElementById('tv-live-segment-warn');
        var numWarn = document.getElementById('tv-live-number-warn');
        var submitBtn = document.getElementById('tv-send-submit');
        var headerBtn = document.getElementById('tv-header-send-btn');
        if(segWarn) segWarn.hidden = !overSeg;
        if(numWarn) numWarn.hidden = numOk || (!numbersRestricted && allowedLiveNumbers.length === 0);
        var disabled = overSeg || !numOk;
        if(submitBtn && canSend) submitBtn.disabled = disabled;
        if(headerBtn && canSend) headerBtn.disabled = disabled;
      }
      if(telsimSelect){
        telsimSelect.addEventListener('change', updateTelsimLine);
        updateTelsimLine();
      }
      document.querySelectorAll('.tv-var-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
          if(!ta) return;
          ta.value = (ta.value || '') + (btn.getAttribute('data-var') || '');
          ta.focus();
          refresh();
        });
      });
      document.querySelectorAll('.tv-template-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
          if(!ta) return;
          ta.value = btn.getAttribute('data-template') === 'dlr' ? templateDlr : templateQa;
          ta.focus();
          refresh();
        });
      });
      document.querySelectorAll('[data-tv-send-mode]').forEach(function(btn){
        btn.addEventListener('click', function(){
          var id = btn.getAttribute('data-tv-send-mode');
          if(id === 'verify') {
            var el = document.getElementById('tv-verify-section');
            if(el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            if(telsimSelect) telsimSelect.focus();
          }
          if(id === 'mass') window.location.href = '/app/campaigns';
          if(id === 'template') window.location.href = '/app/templates';
        });
      });
      if(senderInput) senderInput.addEventListener('input', refresh);
      if(toInput) toInput.addEventListener('input', refresh);
      if(ta){ ta.addEventListener('input', refresh); refresh(); }
    })();
    </script>`;

  return wrapAppPage(ctx, "send-sms", "Enviar SMS", body);
}

export function renderAppInboxPage(
  ctx: AppPageContext,
  messages: PanelSmsMessageRow[],
): string {
  const body = `
    ${renderPageHeader({
      title: "Bandeja",
      subtitle: "Mensajes SMS enviados por tu empresa.",
    })}
    <div class="table-wrap tv-panel">
      <table class="tv-table">
        <thead><tr>
          <th>Fecha</th><th>Destinatario</th><th>Remitente</th><th>Mensaje</th>
          <th>Seg.</th><th>Costo SMS</th><th>Estado</th><th>Modo</th><th>Referencia</th><th>Error</th>
        </tr></thead>
        <tbody>${renderInboxTableRows(messages)}</tbody>
      </table>
    </div>`;
  return wrapAppPage(ctx, "inbox", "Bandeja", body);
}

export function renderAppCampaignsPage(
  ctx: AppPageContext,
  campaigns: SmsCampaignRow[],
): string {
  const body = `
    ${renderPageHeader({
      title: "Campañas",
      subtitle: "Campañas SMS registradas en tu cuenta.",
      actions: renderBtn("Nuevo envío", { href: "/app/send-sms", variant: "primary" }),
    })}
    <div class="table-wrap tv-panel">
      <table class="tv-table">
        <thead><tr>
          <th>Fecha</th><th>Nombre</th><th>Remitente</th><th>Total dest.</th>
          <th>Válidos</th><th>Costo SMS</th><th>Estado</th><th>Modo</th><th>Acción</th>
        </tr></thead>
        <tbody>${renderCampaignsTableRows(campaigns)}</tbody>
      </table>
    </div>`;
  return wrapAppPage(ctx, "campaigns", "Campañas", body);
}

export function renderAppReportsPage(
  ctx: AppPageContext,
  report: ClientSmsReportData,
): string {
  const dailyRows = report.dailyConsumption.length
    ? report.dailyConsumption
        .map(
          (d) => `<tr><td>${escapeHtml(d.day)}</td><td>${d.sms}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="2">Sin consumo registrado aún.</td></tr>`;

  const msgRows = report.recentMessages.length
    ? report.recentMessages
        .map(
          (m) => `<tr>
        <td>${formatDate(m.created_at)}</td>
        <td><code>${escapeHtml(m.recipient_number)}</code></td>
        <td>${m.cost_sms}</td>
        <td>${renderPanelMessageStatusBadge(m.status, m.mode)}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="4">Sin mensajes.</td></tr>`;

  const body = `
    ${renderPageHeader({
      title: "Reportes",
      subtitle: "Métricas desde mensajes y movimientos reales.",
    })}
    <div class="tv-kpi-grid" style="margin-bottom:1rem">
      <article class="tv-kpi"><span class="tv-kpi__label">Mensajes enviados</span><span class="tv-kpi__value">${report.messagesSent}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Entregados</span><span class="tv-kpi__value">${report.deliveredCount}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Pendientes</span><span class="tv-kpi__value">${report.pendingCount}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Fallidos</span><span class="tv-kpi__value">${report.failedCount}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">SMS consumidos</span><span class="tv-kpi__value">${report.smsConsumed}</span></article>
    </div>
    <div class="tv-dash-grid tv-dash-grid--2">
      <section class="tv-panel">
        <h2 class="tv-panel__title">Consumo por día</h2>
        <div class="table-wrap tv-panel__body" style="padding:0">
          <table class="tv-table"><thead><tr><th>Día</th><th>SMS</th></tr></thead><tbody>${dailyRows}</tbody></table>
        </div>
      </section>
      <section class="tv-panel">
        <h2 class="tv-panel__title">Últimos mensajes</h2>
        <div class="table-wrap tv-panel__body" style="padding:0">
          <table class="tv-table"><thead><tr><th>Fecha</th><th>Destino</th><th>SMS</th><th>Estado</th></tr></thead><tbody>${msgRows}</tbody></table>
        </div>
      </section>
    </div>`;
  return wrapAppPage(ctx, "reports", "Reportes", body);
}
