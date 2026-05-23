import type { MockSmsSendResult } from "../../types/sms-panel.js";
import type { SmsCampaignRow } from "../../types/sms-panel.js";
import type { PanelSmsMessageRow } from "../../types/sms-panel.js";
import type { ClientSmsReportData } from "../../services/smsPanelReportsService.js";
import { escapeHtml } from "../../utils/html.js";
import { renderBtn, renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtSms, wrapAppPage } from "./app-page-wrap.js";
import {
  renderCampaignsTableRows,
  renderInboxTableRows,
  renderPanelMessageStatusBadge,
  renderSmsModeBadge,
} from "./app-sms-ui.js";
import { formatDate } from "../../utils/html.js";

export type SendSmsPageOptions = {
  error?: string;
  sendResult?: MockSmsSendResult | null;
};

export function renderAppSendSmsPage(
  ctx: AppPageContext,
  opts: SendSmsPageOptions = {},
): string {
  const avail = ctx.balance.availableSms;
  const errorBlock = opts.error
    ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>`
    : "";

  const successBlock = opts.sendResult
    ? `<section class="tv-panel tv-panel--hint" style="margin-bottom:1rem;border-color:var(--tv-ok)">
      <div class="tv-panel__body">
        <h2 style="margin:0 0 0.5rem;font-size:1.1rem">SMS simulado registrado correctamente</h2>
        <ul style="margin:0;padding-left:1.2rem">
          <li><strong>Destino:</strong> ${escapeHtml(opts.sendResult.recipientNumber)}</li>
          <li><strong>Segmentos descontados:</strong> ${opts.sendResult.segments}</li>
          <li><strong>Saldo anterior:</strong> ${fmtSms(opts.sendResult.balanceBefore)} SMS</li>
          <li><strong>Saldo final:</strong> ${fmtSms(opts.sendResult.balanceAfter)} SMS</li>
          <li><strong>Estado:</strong> ${renderPanelMessageStatusBadge(opts.sendResult.status)} ${renderSmsModeBadge("mock")}</li>
          <li><strong>ID mensaje:</strong> <code>${escapeHtml(opts.sendResult.messageId)}</code></li>
        </ul>
        <div class="tv-quick-actions" style="margin-top:1rem">
          ${renderBtn("Ver bandeja", { href: "/app/inbox", variant: "secondary" })}
          ${renderBtn("Ver campaña", { href: "/app/campaigns", variant: "ghost" })}
        </div>
      </div>
    </section>`
    : "";

  const body = `
    ${renderPageHeader({
      title: "Enviar SMS",
      subtitle: "Envío individual en modo simulación operacional (Etapa 9).",
    })}
    ${errorBlock}
    ${successBlock}
    <div class="alert alert-warn tv-mock-sim-banner" role="status">
      <strong>Modo simulación activo:</strong> este envío no será enviado a operadores móviles,
      pero descontará saldo para validar el flujo operativo.
    </div>
    <div class="tv-dash-grid tv-dash-grid--2" style="margin-top:1rem">
      <section class="tv-panel">
        <h2 class="tv-panel__title">Mensaje</h2>
        <form method="post" action="/app/send-sms" class="tv-panel__body tv-form-grid" id="tv-send-sms-form">
          <label>Nombre de campaña (opcional)
            <input class="tv-input-full" name="campaign_name" placeholder="Ej. Bienvenida clientes" />
          </label>
          <label>Remitente / Sender ID
            <input class="tv-input-full" name="sender_id" value="TELVOICE" required maxlength="11" />
          </label>
          <label>Número destinatario
            <input class="tv-input-full" name="to" placeholder="+56912345678" required />
          </label>
          <label>Mensaje
            <textarea class="tv-input-full" name="message" id="tv-sms-message" rows="5" required placeholder="Escribe tu mensaje…"></textarea>
          </label>
          <label>Variables rápidas
            <div class="tv-quick-actions">
              <button type="button" class="btn btn-ghost btn-sm tv-var-btn" data-var="{{nombre}}">{{nombre}}</button>
              <button type="button" class="btn btn-ghost btn-sm tv-var-btn" data-var="{{empresa}}">{{empresa}}</button>
            </div>
          </label>
          <p class="field-hint" id="tv-sms-segment-hint">
            Caracteres: 0 · Codificación: GSM-7 · Segmentos: 0 · Costo: 0 SMS ·
            Saldo actual: ${fmtSms(avail)} · Saldo después: ${fmtSms(avail)} SMS
          </p>
          <button type="submit" class="btn btn-primary">Enviar SMS simulado</button>
        </form>
      </section>
      <section class="tv-panel">
        <h2 class="tv-panel__title">Vista previa móvil</h2>
        <div class="tv-panel__body">
          <div class="tv-mobile-preview" id="tv-sms-preview">
            <strong id="tv-preview-sender">TELVOICE</strong><br/><br/>
            <span id="tv-preview-body">Hola, tu mensaje aparecerá aquí.</span>
          </div>
        </div>
      </section>
    </div>
    <script>
    (function(){
      var ta = document.getElementById('tv-sms-message');
      var hint = document.getElementById('tv-sms-segment-hint');
      var previewBody = document.getElementById('tv-preview-body');
      var previewSender = document.getElementById('tv-preview-sender');
      var senderInput = document.querySelector('input[name="sender_id"]');
      var avail = ${avail};
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
      function refresh(){
        var t = ta ? ta.value : '';
        var c = calc(t);
        var after = Math.max(0, avail - c.cost);
        if(hint) hint.textContent = 'Caracteres: '+c.chars+' · Codificación: '+c.enc+' · Segmentos: '+c.seg+' · Costo: '+c.cost+' SMS · Saldo actual: '+avail.toLocaleString('es-CL')+' · Saldo después: '+after.toLocaleString('es-CL')+' SMS';
        if(previewBody) previewBody.textContent = t || 'Hola, tu mensaje aparecerá aquí.';
        if(previewSender && senderInput) previewSender.textContent = senderInput.value || 'TELVOICE';
      }
      if(ta){ ta.addEventListener('input', refresh); }
      if(senderInput){ senderInput.addEventListener('input', refresh); }
      document.querySelectorAll('.tv-var-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
          if(!ta) return;
          var v = btn.getAttribute('data-var') || '';
          ta.value = (ta.value || '') + v;
          ta.focus();
          refresh();
        });
      });
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
      subtitle: "Mensajes SMS enviados por tu empresa (modo mock operacional).",
    })}
    <div class="table-wrap tv-panel">
      <table class="tv-table">
        <thead><tr>
          <th>Fecha</th><th>Destinatario</th><th>Remitente</th><th>Mensaje</th>
          <th>Segmentos</th><th>Estado</th><th>Modo</th><th>Acción</th>
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
        <td>${renderPanelMessageStatusBadge(m.status)}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="4">Sin mensajes.</td></tr>`;

  const body = `
    ${renderPageHeader({
      title: "Reportes",
      subtitle: "Métricas iniciales desde mensajes y movimientos reales.",
    })}
    <div class="tv-kpi-grid" style="margin-bottom:1rem">
      <article class="tv-kpi"><span class="tv-kpi__label">SMS enviados</span><span class="tv-kpi__value">${report.messagesSent}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">SMS consumidos</span><span class="tv-kpi__value">${report.smsConsumed}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Campañas</span><span class="tv-kpi__value">${report.campaignsCount}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">Tasa mock delivered</span><span class="tv-kpi__value">${escapeHtml(report.deliveredRate)}</span></article>
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
