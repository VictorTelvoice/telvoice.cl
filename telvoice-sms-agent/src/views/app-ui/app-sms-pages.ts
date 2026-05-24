import type { MockSmsSendResult } from "../../types/sms-panel.js";
import type { SmsCampaignRow } from "../../types/sms-panel.js";
import type { PanelSmsMessageRow } from "../../types/sms-panel.js";
import type { ClientSmsReportData } from "../../services/smsPanelReportsService.js";
import type { LiveTestSendPageStatus } from "../../services/smsLiveTestLimiterService.js";
import type { SendControlPanelView } from "../../services/smsSendControlPanelService.js";
import { formatVerifyLastTest } from "../../services/smsSendControlPanelService.js";
import { escapeHtml } from "../../utils/html.js";
import { renderBtn, renderPageHeader } from "../admin-ui/page-kit.js";
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

function renderVerifyCards(
  panel: SendControlPanelView,
  canSend: boolean,
): string {
  if (panel.verifyNumbers.length === 0) {
    return `<div class="tv-verify-empty">
      <p>No hay números de verificación configurados.</p>
      <p class="field-hint">Telvoice puede registrar líneas telsim.io en <code>TELVOICE_VERIFY_NUMBERS</code> para validar DLR antes de cada campaña.</p>
    </div>`;
  }

  return panel.verifyNumbers
    .map((v) => {
      const readyCls = v.readyForCampaign
        ? "tv-verify-card--ready"
        : "tv-verify-card--pending";
      const disabled = canSend ? "" : "disabled";
      const channelBadge =
        v.entry.channel === "telsim"
          ? `<span class="badge badge-ok">telsim.io</span>`
          : `<span class="badge badge-muted">manual</span>`;
      return `<article class="tv-verify-card ${readyCls}">
        <header class="tv-verify-card__head">
          <div>
            <strong class="tv-verify-card__operator">${escapeHtml(v.entry.operator)}</strong>
            <span class="tv-verify-card__label">${escapeHtml(v.entry.label)}</span>
          </div>
          ${channelBadge}
        </header>
        <p class="tv-verify-card__phone"><code>${escapeHtml(v.maskedPhone)}</code></p>
        <p class="tv-verify-card__meta">
          ${renderPanelMessageStatusBadge(v.lastStatus, "live_test")}
          · ${escapeHtml(formatVerifyLastTest(v.lastTestAt))}
          ${v.dlrReceived ? " · DLR confirmado" : ""}
        </p>
        <form method="post" action="/app/send-sms" class="tv-verify-card__form">
          <input type="hidden" name="verify_id" value="${escapeHtml(v.entry.id)}" />
          <input type="hidden" name="sender_id" value="TELVOICE" />
          <input type="hidden" name="quick_verify" value="1" />
          <button type="submit" class="btn btn-sm btn-secondary" ${disabled}>
            <span class="material-symbols-outlined" style="font-size:1rem;vertical-align:-2px">science</span>
            Enviar test QA
          </button>
        </form>
      </article>`;
    })
    .join("");
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

  const kpiRow =
    panel && lt
      ? `<div class="tv-kpi-grid tv-send-kpis">
      <article class="tv-kpi"><span class="tv-kpi__label">Saldo SMS</span><span class="tv-kpi__value">${fmtSms(avail)}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Ruta activa</span><span class="tv-kpi__value tv-kpi__value--sm">${escapeHtml(lt.routeName ?? "—")}</span><span class="tv-kpi__sub">${escapeHtml(lt.providerName ?? "—")}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Webhook DLR</span><span class="tv-kpi__value tv-kpi__value--sm">${panel.webhookConfigured ? "Activo" : "Sin config"}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Cuota hoy</span><span class="tv-kpi__value tv-kpi__value--sm">${dailyRemaining}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">TPS asignado</span><span class="tv-kpi__value tv-kpi__value--sm">${lt.effectiveTps != null ? `${lt.effectiveTps}` : "—"}</span></article>
    </div>`
      : "";

  const preCampaignBanner =
    panel && panel.verifyNumbers.length > 0 && !panel.allVerifyNumbersReady
      ? `<div class="alert alert-warn tv-precampaign-banner">
      <strong>Validación pre-campaña pendiente.</strong>
      Envía test QA a cada línea telsim y confirma DLR antes de lanzar la campaña masiva.
    </div>`
      : panel && panel.allVerifyNumbersReady && panel.verifyNumbers.length > 0
        ? `<div class="alert tv-precampaign-banner tv-precampaign-banner--ok">
      <strong>Listo para campaña.</strong> Todas las líneas de verificación respondieron correctamente.
    </div>`
        : "";

  const successBlock = opts.sendResult
    ? `<section class="tv-panel tv-panel--hint tv-send-result" style="margin-bottom:1rem;border-color:var(--tv-ok)">
      <div class="tv-panel__body">
        <h2 style="margin:0 0 0.5rem;font-size:1.1rem">Envío registrado</h2>
        <ul style="margin:0;padding-left:1.2rem">
          <li><strong>Destino:</strong> ${escapeHtml(opts.sendResult.recipientNumber)}</li>
          <li><strong>Segmentos:</strong> ${opts.sendResult.segments}</li>
          <li><strong>Saldo:</strong> ${fmtSms(opts.sendResult.balanceBefore)} → ${fmtSms(opts.sendResult.balanceAfter)} SMS</li>
          <li><strong>Estado:</strong> ${renderPanelMessageStatusBadge(opts.sendResult.status, opts.sendResult.sendMode)}</li>
          <li><strong>Provider ID:</strong> <code>${escapeHtml(opts.sendResult.providerMessageId || "—")}</code></li>
        </ul>
        <p class="field-hint" style="margin:0.75rem 0 0">«Entregado» se actualiza cuando el operador confirma vía webhook DLR.</p>
        <div class="tv-quick-actions" style="margin-top:1rem">
          ${renderBtn("Ver bandeja", { href: "/app/inbox", variant: "secondary" })}
          ${renderBtn("Reportes", { href: "/app/reports", variant: "ghost" })}
        </div>
      </div>
    </section>`
    : "";

  const blockHint =
    lt?.liveTestBlockReason && !canSend
      ? `<p class="field-hint tv-send-block-reason">${escapeHtml(lt.liveTestBlockReason)}</p>`
      : "";

  const checklistBlock = panel
    ? `<section class="tv-panel tv-send-checklist">
      <h2 class="tv-panel__title">Checklist pre-campaña</h2>
      <ul class="tv-checklist tv-panel__body">
        ${panel.checklist.map((c) => renderChecklistItem(c.ok, c.label, c.hint)).join("")}
      </ul>
      ${blockHint}
    </section>`
    : `<p class="alert alert-error">El envío SMS no está disponible. Verifique credenciales del proveedor y contacte a soporte Telvoice.</p>`;

  const verifySelectOptions = panel
    ? panel.verifyNumbers
        .map(
          (v) =>
            `<option value="${escapeHtml(v.entry.phone)}">${escapeHtml(v.entry.label)} (${escapeHtml(v.maskedPhone)})</option>`,
        )
        .join("")
    : "";

  const disabledAttr = canSend ? "" : "disabled";

  const body = `
    ${renderPageHeader({
      title: "Panel de envío SMS",
      subtitle:
        "Envío rápido, verificación telsim.io y validación DLR antes de campañas.",
    })}
    ${errorBlock}
    ${kpiRow}
    ${preCampaignBanner}
    ${successBlock}
    <div class="tv-send-layout">
      <section class="tv-panel tv-send-quick">
        <h2 class="tv-panel__title">Envío rápido</h2>
        <form method="post" action="/app/send-sms" class="tv-panel__body tv-form-grid" id="tv-send-sms-form">
          <label>Nombre de campaña (opcional)
            <input class="tv-input-full" name="campaign_name" placeholder="Ej. Bienvenida clientes" ${disabledAttr} />
          </label>
          <label>Remitente / Sender ID
            <input class="tv-input-full" name="sender_id" value="TELVOICE" required maxlength="11" ${disabledAttr} />
          </label>
          <label>Número destinatario
            <div class="tv-send-to-row">
              <input class="tv-input-full" name="to" id="tv-send-to" placeholder="+56912345678" required ${disabledAttr} />
              ${
                verifySelectOptions
                  ? `<select class="tv-input-full tv-send-to-pick" id="tv-verify-pick" ${disabledAttr} aria-label="Elegir línea de verificación">
                <option value="">Línea telsim…</option>
                ${verifySelectOptions}
              </select>`
                  : ""
              }
            </div>
          </label>
          <label>Mensaje
            <textarea class="tv-input-full" name="message" id="tv-sms-message" rows="5" required placeholder="Escribe tu mensaje…" ${disabledAttr}></textarea>
          </label>
          <label>Plantillas rápidas
            <div class="tv-quick-actions">
              <button type="button" class="btn btn-ghost btn-sm tv-template-btn" data-template="qa">QA pre-campaña</button>
              <button type="button" class="btn btn-ghost btn-sm tv-template-btn" data-template="dlr">Test DLR</button>
              <button type="button" class="btn btn-ghost btn-sm tv-var-btn" data-var="{{nombre}}">{{nombre}}</button>
              <button type="button" class="btn btn-ghost btn-sm tv-var-btn" data-var="{{empresa}}">{{empresa}}</button>
            </div>
          </label>
          <p class="field-hint" id="tv-sms-segment-hint">
            Caracteres: 0 · GSM-7 · Segmentos: 0 · Costo: 0 SMS · Saldo: ${fmtSms(avail)}
          </p>
          <p class="field-hint tv-live-segment-warn" id="tv-live-segment-warn" hidden style="margin:0;color:var(--tv-danger)">
            El mensaje supera el máximo de segmentos permitido.
          </p>
          <p class="field-hint tv-live-number-warn" id="tv-live-number-warn" hidden style="margin:0;color:var(--tv-danger)">
            El número destino no está autorizado para envío SMS.
          </p>
          <button type="submit" class="btn btn-primary btn-lg tv-send-submit" id="tv-send-submit" ${disabledAttr}>
            <span class="material-symbols-outlined" style="font-size:1.1rem;vertical-align:-3px">send</span>
            Enviar SMS
          </button>
        </form>
      </section>
      <aside class="tv-send-aside">
        ${checklistBlock}
        <section class="tv-panel">
          <h2 class="tv-panel__title">Vista previa</h2>
          <div class="tv-panel__body">
            <div class="tv-mobile-preview" id="tv-sms-preview">
              <strong id="tv-preview-sender">TELVOICE</strong><br/><br/>
              <span id="tv-preview-body">Hola, tu mensaje aparecerá aquí.</span>
            </div>
            ${
              panel?.webhookConfigured
                ? `<p class="field-hint tv-webhook-hint"><code>${escapeHtml(panel.webhookUrl)}</code></p>`
                : `<p class="field-hint tv-webhook-hint tv-webhook-hint--warn">Configure PUBLIC_WEBHOOK_BASE_URL para recibir DLR.</p>`
            }
          </div>
        </section>
      </aside>
    </div>
    <section class="tv-panel tv-verify-section">
      <div class="tv-verify-section__head">
        <h2 class="tv-panel__title">Verificación telsim.io</h2>
        <p class="field-hint">Prueba cada operador y confirma entrega vía webhook antes de la campaña.</p>
      </div>
      <div class="tv-verify-grid tv-panel__body">
        ${panel ? renderVerifyCards(panel, canSend) : ""}
      </div>
    </section>
    <script>
    (function(){
      var ta = document.getElementById('tv-sms-message');
      var hint = document.getElementById('tv-sms-segment-hint');
      var previewBody = document.getElementById('tv-preview-body');
      var previewSender = document.getElementById('tv-preview-sender');
      var senderInput = document.querySelector('input[name="sender_id"]');
      var toInput = document.getElementById('tv-send-to');
      var verifyPick = document.getElementById('tv-verify-pick');
      var avail = ${avail};
      var maxLiveSegments = ${lt?.maxSegments ?? 3};
      var canSend = ${canSend ? "true" : "false"};
      var numbersRestricted = ${lt?.authorizedNumbersConfigured ? "true" : "false"};
      var allowedLiveNumbers = ${JSON.stringify(allowedLiveNumbers)};
      var defaultVerifyMsg = ${JSON.stringify(panel?.defaultVerifyMessage ?? "")};
      var templateQa = defaultVerifyMsg;
      var templateDlr = '[Telvoice DLR] Test entrega ' + new Date().toISOString().slice(0,16).replace('T',' ') + '. Responda OK si recibio.';
      function gsmBasic(ch){ return /^[@£$¥èéùìòÇ\\nØø\\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\\-./0-9:;<=>?¡A-Za-zäöñüà^{}\\\\\\[\\]~|€]*$/.test(ch); }
      function calc(text){
        var chars = [...text].length;
        if(!chars) return {chars:0,enc:'GSM-7',seg:0,cost:0};
        if(gsmBasic(text)){
          if(chars<=160) return {chars:chars,enc:'GSM-7',seg:1,cost:1};
          var s=Math.ceil(chars/153); return {chars:chars,enc:'GSM-7',seg:s,cost:s};
        }
        if(chars<=70) return {chars:chars,enc:'UCS-2',seg:1,cost:1};
        var u=Math.ceil(chars/67); return {chars:chars,enc:'UCS-2',seg:u,cost:u};
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
      function refresh(){
        var t = ta ? ta.value : '';
        var c = calc(t);
        var after = Math.max(0, avail - c.cost);
        if(hint) hint.textContent = 'Caracteres: '+c.chars+' · '+c.enc+' · Segmentos: '+c.seg+' · Costo: '+c.cost+' SMS · Saldo: '+avail.toLocaleString('es-CL')+' · Después: '+after.toLocaleString('es-CL');
        if(previewBody) previewBody.textContent = t || 'Hola, tu mensaje aparecerá aquí.';
        if(previewSender && senderInput) previewSender.textContent = senderInput.value || 'TELVOICE';
        var overSeg = c.seg > maxLiveSegments;
        var segWarn = document.getElementById('tv-live-segment-warn');
        var numWarn = document.getElementById('tv-live-number-warn');
        var submitBtn = document.getElementById('tv-send-submit');
        var numOk = isRecipientAllowed();
        if(segWarn) segWarn.hidden = !overSeg;
        if(numWarn) numWarn.hidden = numOk || (!numbersRestricted && allowedLiveNumbers.length === 0);
        if(submitBtn && canSend) submitBtn.disabled = overSeg || !numOk;
      }
      if(verifyPick && toInput){
        verifyPick.addEventListener('change', function(){
          if(verifyPick.value) toInput.value = verifyPick.value;
          refresh();
        });
      }
      if(senderInput){ senderInput.addEventListener('input', refresh); }
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
          var kind = btn.getAttribute('data-template');
          ta.value = kind === 'dlr' ? templateDlr : templateQa;
          ta.focus();
          refresh();
        });
      });
      if(toInput){ toInput.addEventListener('input', refresh); }
      if(ta){ ta.addEventListener('input', refresh); }
      refresh();
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
