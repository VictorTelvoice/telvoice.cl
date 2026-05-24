import type { MockSmsSendResult } from "../../types/sms-panel.js";
import type { SmsCampaignRow } from "../../types/sms-panel.js";
import type { PanelSmsMessageRow } from "../../types/sms-panel.js";
import type { ClientSmsReportData } from "../../services/smsPanelReportsService.js";
import type { LiveTestSendPageStatus } from "../../services/smsLiveTestLimiterService.js";
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
  liveTestAvailable?: boolean;
  liveTestStatus?: LiveTestSendPageStatus | null;
};

export function renderAppSendSmsPage(
  ctx: AppPageContext,
  opts: SendSmsPageOptions = {},
): string {
  const avail = ctx.balance.availableSms;
  const errorBlock = opts.error
    ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>`
    : "";

  const isLiveResult = opts.sendResult?.sendMode === "live_test";

  const successBlock = opts.sendResult
    ? `<section class="tv-panel tv-panel--hint" style="margin-bottom:1rem;border-color:var(--tv-ok)">
      <div class="tv-panel__body">
        <h2 style="margin:0 0 0.5rem;font-size:1.1rem">${isLiveResult ? "SMS real controlado enviado" : "SMS simulado registrado correctamente"}</h2>
        <ul style="margin:0;padding-left:1.2rem">
          <li><strong>Destino:</strong> ${escapeHtml(opts.sendResult.recipientNumber)}</li>
          <li><strong>Segmentos descontados:</strong> ${opts.sendResult.segments}</li>
          <li><strong>Saldo anterior:</strong> ${fmtSms(opts.sendResult.balanceBefore)} SMS</li>
          <li><strong>Saldo final:</strong> ${fmtSms(opts.sendResult.balanceAfter)} SMS</li>
          <li><strong>Estado:</strong> ${renderPanelMessageStatusBadge(opts.sendResult.status)} ${renderSmsModeBadge(opts.sendResult.sendMode ?? "mock")}</li>
          <li><strong>Provider Message ID:</strong> <code>${escapeHtml(opts.sendResult.providerMessageId || "—")}</code></li>
          <li><strong>ID mensaje:</strong> <code>${escapeHtml(opts.sendResult.messageId)}</code></li>
        </ul>
        <div class="tv-quick-actions" style="margin-top:1rem">
          ${renderBtn("Ver bandeja", { href: "/app/inbox", variant: "secondary" })}
          ${renderBtn("Ver campaña", { href: "/app/campaigns", variant: "ghost" })}
        </div>
      </div>
    </section>`
    : "";

  const lt = opts.liveTestStatus;
  const liveTestLimitsCard =
    opts.liveTestAvailable && lt
      ? `<section class="tv-panel tv-panel--hint" id="tv-live-test-limits" style="margin-bottom:1rem">
      <h2 class="tv-panel__title">Envío real controlado</h2>
      <div class="tv-panel__body">
        <p class="field-hint" style="margin-top:0">
          Este modo envía SMS reales usando rutas autorizadas por Telvoice. Está limitado para pruebas operativas.
        </p>
        <ul style="margin:0.5rem 0 0;padding-left:1.2rem;font-size:0.9rem">
          <li><strong>Límite diario cliente:</strong> <span id="tv-lt-daily">${lt.dailyRemaining}</span> / ${lt.dailyLimit} disponibles <span class="field-hint">(no incluye pruebas Superadmin)</span></li>
          <li><strong>Segmentos máximos:</strong> ${lt.maxSegments}</li>
          <li><strong>Número autorizado:</strong> ${
            lt.maskedNumbers.length
              ? lt.maskedNumbers.map((n) => escapeHtml(n)).join(", ")
              : "No configurado en servidor"
          }</li>
          <li><strong>Empresa autorizada:</strong> ${lt.companyAuthorized ? "Sí" : "No"}</li>
          <li><strong>TPS asignado:</strong> ${lt.effectiveTps != null ? `${lt.effectiveTps} TPS` : "—"}</li>
          <li><strong>Límite diario restante:</strong> ${
            lt.trafficDailyRemaining != null && lt.trafficDailyLimit != null
              ? `${lt.trafficDailyRemaining} / ${lt.trafficDailyLimit}`
              : `${lt.dailyRemaining} / ${lt.dailyLimit} (prueba controlada)`
          }</li>
          <li><strong>Estado de ruta:</strong> ${lt.routeActive ? "Disponible" : "No disponible temporalmente"}</li>
        </ul>
        <p class="field-hint tv-live-test-policy-block" id="tv-lt-block-hint" ${lt.liveTestBlockReason && !lt.canSelectLiveTest ? "" : 'hidden'} style="margin-top:0.75rem;color:var(--tv-danger)">
          ${escapeHtml(lt.liveTestBlockReason ?? "")}
        </p>
      </div>
    </section>`
      : "";

  const liveRadioDisabled =
    lt && !lt.canSelectLiveTest ? "disabled" : "";
  const modeSelector = opts.liveTestAvailable
    ? `<fieldset class="tv-form-grid" style="border:0;padding:0;margin:0 0 1rem">
        <legend style="font-weight:600;margin-bottom:0.5rem">Modo de envío</legend>
        <label style="display:flex;gap:0.5rem;align-items:center">
          <input type="radio" name="send_mode" value="mock" checked data-tv-send-mode="mock" /> Simulación
        </label>
        <label style="display:flex;gap:0.5rem;align-items:center;opacity:${liveRadioDisabled ? "0.6" : "1"}">
          <input type="radio" name="send_mode" value="live_test" data-tv-send-mode="live_test" ${liveRadioDisabled} id="tv-send-mode-live" /> Envío real controlado
        </label>
      </fieldset>
      <div class="alert alert-error tv-live-test-banner" id="tv-live-test-alert" hidden role="alert">
        <strong>Envío real controlado:</strong> este modo enviará un SMS real usando la ruta API aSMSC conectada.
        Se descontará saldo <em>solo si el proveedor acepta</em> el mensaje. Límite: 1 destinatario · ${lt?.maxSegments ?? 1} segmento.
      </div>`
    : "";

  const mockBanner = opts.liveTestAvailable
    ? `<div class="alert alert-warn tv-mock-sim-banner" id="tv-mock-banner" role="status">
      <strong>Modo simulación (por defecto):</strong> no se envía a operadores móviles; descuenta saldo para validar el flujo.
    </div>`
    : `<div class="alert alert-warn tv-mock-sim-banner" role="status">
      <strong>Modo simulación activo:</strong> este envío no será enviado a operadores móviles,
      pero descontará saldo para validar el flujo operativo.
    </div>`;

  const body = `
    ${renderPageHeader({
      title: "Enviar SMS",
      subtitle: opts.liveTestAvailable
        ? "Simulación por defecto · envío real controlado opcional (live_test)."
        : "Envío individual en modo simulación operacional.",
    })}
    ${errorBlock}
    ${successBlock}
    ${liveTestLimitsCard}
    ${mockBanner}
    <div class="tv-dash-grid tv-dash-grid--2" style="margin-top:1rem">
      <section class="tv-panel">
        <h2 class="tv-panel__title">Mensaje</h2>
        <form method="post" action="/app/send-sms" class="tv-panel__body tv-form-grid" id="tv-send-sms-form">
          ${modeSelector}
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
          <p class="field-hint tv-live-segment-warn" id="tv-live-segment-warn" hidden style="margin:0;color:var(--tv-danger)">
            El mensaje supera el máximo de segmentos permitido para envío real. Usa simulación o acorta el texto.
          </p>
          <p class="field-hint tv-live-number-warn" id="tv-live-number-warn" hidden style="margin:0;color:var(--tv-danger)">
            El número destino no está autorizado para live_test.
          </p>
          <button type="submit" class="btn btn-primary" id="tv-send-submit">Enviar SMS simulado</button>
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
      var maxLiveSegments = ${lt?.maxSegments ?? 1};
      var liveTestCanSelect = ${lt?.canSelectLiveTest ? "true" : "false"};
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
      var submitBtn = document.getElementById('tv-send-submit');
      var liveAlert = document.getElementById('tv-live-test-alert');
      var mockBannerEl = document.getElementById('tv-mock-banner');
      var segWarn = document.getElementById('tv-live-segment-warn');
      var numWarn = document.getElementById('tv-live-number-warn');
      var toInput = document.querySelector('input[name="to"]');
      var liveRadio = document.getElementById('tv-send-mode-live');
      var allowedLiveNumbers = ${JSON.stringify(lt?.allowedNumbersNormalized ?? [])};
      function normalizePhoneDigits(v){
        var d = (v || '').replace(/\\D/g,'');
        if(d.length===11 && d.charAt(0)==='9') return '56'+d;
        if(d.length===9 && d.charAt(0)==='9') return '56'+d;
        return d;
      }
      function isRecipientAllowedForLive(){
        if(!toInput) return true;
        var v = (toInput.value || '').trim();
        if(!v) return true;
        if(!allowedLiveNumbers.length) return false;
        var digits = normalizePhoneDigits(v);
        return allowedLiveNumbers.some(function(n){
          var a = normalizePhoneDigits(n);
          return a === digits || a === digits.replace(/^\\+/,'');
        });
      }
      function refreshLiveGuards(){
        refresh();
        var t = ta ? ta.value : '';
        var c = calc(t);
        var overSeg = c.seg > maxLiveSegments;
        if(segWarn) segWarn.hidden = !overSeg;
        var numOk = isRecipientAllowedForLive();
        if(numWarn) numWarn.hidden = numOk;
        if(liveRadio){
          var block = overSeg || !numOk || !liveTestCanSelect;
          liveRadio.disabled = block;
          if(block && liveRadio.checked){
            var mockR = document.querySelector('input[name="send_mode"][value="mock"]');
            if(mockR) mockR.checked = true;
          }
        }
        syncMode();
      }
      function syncMode(){
        var live = document.querySelector('input[name="send_mode"][value="live_test"]:checked');
        if(submitBtn){
          submitBtn.textContent = live ? 'Enviar SMS real controlado' : 'Enviar SMS simulado';
          var c = calc(ta ? ta.value : '');
          submitBtn.disabled = !!(live && (c.seg > maxLiveSegments || !isRecipientAllowedForLive()));
        }
        if(liveAlert) liveAlert.hidden = !live;
        if(mockBannerEl) mockBannerEl.hidden = !!live;
      }
      document.querySelectorAll('input[name="send_mode"]').forEach(function(r){ r.addEventListener('change', syncMode); });
      if(toInput){ toInput.addEventListener('input', refreshLiveGuards); }
      if(ta){ ta.addEventListener('input', refreshLiveGuards); }
      refreshLiveGuards();
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
      <article class="tv-kpi"><span class="tv-kpi__label">SMS simulados (mock)</span><span class="tv-kpi__value">${report.mockMessages}</span></article>
      <article class="tv-kpi"><span class="tv-kpi__label">SMS reales live_test</span><span class="tv-kpi__value">${report.liveTestMessages}</span></article>
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
