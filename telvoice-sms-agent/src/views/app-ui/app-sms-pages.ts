import type {
  MockSmsSendResult,
  PanelCampaignSendResult,
} from "../../types/sms-panel.js";
import type { SmsCampaignRow } from "../../types/sms-panel.js";
import type { PanelSmsMessageRow } from "../../types/sms-panel.js";
import type { LiveTestSendPageStatus } from "../../services/smsLiveTestLimiterService.js";
import { isDailySendLimitEnforced } from "../../services/smsLiveTestLimiterService.js";
import type { SendControlPanelView } from "../../services/smsSendControlPanelService.js";
import { escapeHtml } from "../../utils/html.js";
import {
  MOCK_CONTACT_LISTS,
  MOCK_TEMPLATES,
} from "../admin-ui/mock-data-stage3.js";
import { suggestSenderIdFromCompanyName } from "../../utils/suggestSenderId.js";
import {
  renderBtn,
  renderHeroPhonePreview,
  renderModeCards,
  renderPageHeader,
  renderStatChip,
} from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { fmtSms, wrapAppPage } from "./app-page-wrap.js";
import {
  renderCampaignsTableRows,
  renderInboxTableRows,
  renderPanelMessageStatusBadge,
} from "./app-sms-ui.js";
import {
  APP_SCHEDULE_TIMEZONE,
  formatScheduleInTimeZone,
} from "../../utils/scheduleTime.js";

export type SendSmsPageOptions = {
  error?: string;
  flash?: string;
  activeMode?: "single" | "mass" | "scheduled" | "template";
  sendResult?: MockSmsSendResult | null;
  campaignResult?: PanelCampaignSendResult | null;
  sendEnabled?: boolean;
  liveTestStatus?: LiveTestSendPageStatus | null;
  controlPanel?: SendControlPanelView | null;
  /** Clave de un solo uso; evita envíos duplicados en servidor. */
  idempotencyKey?: string;
};

function renderContactListOptions(disabled: boolean): string {
  const dis = disabled ? " disabled" : "";
  const placeholder = `<option value="" data-sample=""${dis}>— Seleccionar lista —</option>`;
  const items = MOCK_CONTACT_LISTS.map(
    (list) =>
      `<option value="${escapeHtml(list.id)}" data-sample="${escapeHtml(list.sampleNumbers.join("\n"))}">${escapeHtml(list.label ?? list.name)} (${list.count})</option>`,
  ).join("");
  return placeholder + items;
}

function renderTemplateOptions(disabled: boolean): string {
  const dis = disabled ? " disabled" : "";
  return `<option value=""${dis}>— Elegir plantilla —</option>${MOCK_TEMPLATES.map(
    (t) =>
      `<option value="${escapeHtml(t.id)}" data-message="${escapeHtml(t.message)}"${dis}>${escapeHtml(t.name)}</option>`,
  ).join("")}`;
}

type AppSendMode = "single" | "mass" | "scheduled" | "template";

function sendOutcomeTitle(
  activeMode: AppSendMode,
  campaignResult?: PanelCampaignSendResult | null,
): string {
  if (!campaignResult) return "Resultado del envío";
  const scheduled =
    activeMode === "scheduled" || campaignResult.mode === "scheduled";
  if (scheduled && campaignResult.queued > 0 && campaignResult.sent === 0) {
    return "Envío programado";
  }
  if (activeMode === "template") return "Envío desde plantilla";
  if (scheduled) return "Campaña programada";
  return "Campaña en producción";
}

function renderSendOutcomeBlock(opts: {
  flash?: string;
  activeMode: AppSendMode;
  campaignResult?: PanelCampaignSendResult | null;
  sendResult?: MockSmsSendResult | null;
}): string {
  const { flash, activeMode, campaignResult, sendResult } = opts;
  if (!flash && !campaignResult && !sendResult) return "";

  if (campaignResult) {
    const title = sendOutcomeTitle(activeMode, campaignResult);
    const scheduledLabel = campaignResult.scheduledAt
      ? formatScheduleInTimeZone(
          campaignResult.scheduledAt,
          APP_SCHEDULE_TIMEZONE,
        )
      : "";
    const lead = flash
      ? `<p class="tv-send-outcome__lead">${escapeHtml(flash)}</p>`
      : "";
    return `<section class="tv-panel tv-panel--hint tv-send-outcome" role="status" aria-live="polite">
      <header class="tv-section-head">
        <h2 class="tv-section-head__title">${escapeHtml(title)}</h2>
        ${lead}
      </header>
      <div class="tv-panel__body">
        <ul class="tv-send-result__list">
          <li><strong>Campaña:</strong> ${escapeHtml(campaignResult.campaignName)}</li>
          <li><strong>Destinatarios:</strong> ${campaignResult.totalRecipients}</li>
          <li><strong>Enviados:</strong> ${campaignResult.sent}${campaignResult.queued > 0 ? ` · En cola: ${campaignResult.queued}` : ""}${campaignResult.failed > 0 ? ` · Fallidos: ${campaignResult.failed}` : ""}</li>
          <li><strong>SMS consumidos:</strong> ${campaignResult.smsConsumed}</li>
          <li><strong>Saldo:</strong> ${fmtSms(campaignResult.balanceBefore)} → ${fmtSms(campaignResult.balanceAfter)} SMS</li>
          ${scheduledLabel ? `<li><strong>Programado:</strong> ${escapeHtml(scheduledLabel)}</li>` : ""}
        </ul>
        <p class="field-hint"><a href="/app/campaigns">Ver campañas</a> · <a href="/app/inbox">Bandeja</a></p>
      </div>
    </section>`;
  }

  if (sendResult) {
    const lead = flash
      ? `<p class="tv-send-outcome__lead">${escapeHtml(flash)}</p>`
      : "";
    return `<section class="tv-panel tv-panel--hint tv-send-outcome" role="status" aria-live="polite">
      <header class="tv-section-head">
        <h2 class="tv-section-head__title">Envío registrado</h2>
        ${lead}
      </header>
      <div class="tv-panel__body">
        <ul class="tv-send-result__list">
          <li><strong>Destino:</strong> ${escapeHtml(sendResult.recipientNumber)}</li>
          <li><strong>Segmentos:</strong> ${sendResult.segments}</li>
          <li><strong>Saldo:</strong> ${fmtSms(sendResult.balanceBefore)} → ${fmtSms(sendResult.balanceAfter)} SMS</li>
          <li><strong>Estado:</strong> ${renderPanelMessageStatusBadge(sendResult.status, sendResult.sendMode)}</li>
        </ul>
        <p class="field-hint">«Entregado» se actualiza cuando el operador confirma vía webhook DLR. <a href="/app/inbox">Bandeja</a></p>
      </div>
    </section>`;
  }

  return `<section class="tv-send-outcome tv-send-outcome--flash" role="status" aria-live="polite">
    <div class="alert alert-success">${escapeHtml(flash ?? "")}</div>
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
  const canSubmit = lt?.canSelectLiveTest ?? false;
  const defaultVerifyMsg = panel?.defaultVerifyMessage ?? "";

  const verifyPhonesForJs = panel
    ? panel.verifyNumbers.map((v) => v.entry.phone)
    : [];
  const envAllowed = lt?.allowedNumbersNormalized ?? [];
  const allowedLiveNumbers = [...new Set([...envAllowed, ...verifyPhonesForJs])];

  const dailyRemaining = !lt
    ? "—"
    : isDailySendLimitEnforced()
      ? lt.trafficDailyRemaining != null && lt.trafficDailyLimit != null
        ? `${lt.trafficDailyRemaining} / ${lt.trafficDailyLimit}`
        : `${lt.dailyRemaining} / ${lt.dailyLimit}`
      : `${lt.dailyUsed} hoy`;

  const disabledAttr = "";
  const submitDisabled = canSubmit ? "" : "disabled";
  const submitBlockAlert =
    !canSubmit && lt?.liveTestBlockReason
      ? `<div class="alert alert-warn tv-send-block-reason" role="status">${escapeHtml(lt.liveTestBlockReason)}</div>`
      : !canSubmit
        ? `<div class="alert alert-warn tv-send-block-reason" role="status">Puedes preparar el mensaje; el envío se habilitará cuando tu cuenta cumpla los requisitos del checklist.</div>`
        : "";
  const suggestedSenderId = suggestSenderIdFromCompanyName(ctx.company.name);
  const companyDisplayName = ctx.company.name.trim() || "Tu empresa";

  const headerActions = `
    ${renderBtn("Bandeja", { href: "/app/inbox", variant: "ghost" })}
    ${renderBtn("Reportes", { href: "/app/reports", variant: "ghost" })}
    <button type="submit" form="tv-app-send-form" class="tv-btn-campaign" id="tv-header-send-btn" ${submitDisabled}>
      <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">send</span>
      Enviar SMS
    </button>`;

  const activeMode = opts.activeMode ?? "single";

  const modes = renderModeCards(
    [
      {
        id: "single",
        label: "SMS individual",
        description: "Un destinatario, envío inmediato o de prueba.",
        icon: "person",
      },
      {
        id: "mass",
        label: "Campaña masiva",
        description: "Listas de contactos o carga CSV.",
        icon: "groups",
      },
      {
        id: "scheduled",
        label: "Envío programado",
        description: "CSV o listas con fecha y hora de despacho.",
        icon: "schedule",
      },
      {
        id: "template",
        label: "Desde plantilla",
        description: "Mensajes preaprobados con variables.",
        icon: "description",
      },
    ],
    activeMode,
  );

  const varChips = ["{nombre}", "{codigo}", "{empresa}", "{fecha}"]
    .map(
      (v) =>
        `<button type="button" class="tv-var-chip tv-var-btn" data-var="${escapeHtml(v)}">${escapeHtml(v)}</button>`,
    )
    .join("");

  const sendOutcomeBlock = renderSendOutcomeBlock({
    flash: opts.flash,
    activeMode,
    campaignResult: opts.campaignResult,
    sendResult: opts.sendResult,
  });

  const opsChips =
    panel && lt
      ? `<div class="tv-stat-chips tv-stat-chips--ops">
      ${renderStatChip("Saldo SMS", fmtSms(avail), "success")}
      ${renderStatChip("Ruta", lt.routeName ?? "—", "primary")}
      ${renderStatChip("Webhook", panel.webhookConfigured ? "Activo" : "Off", panel.webhookConfigured ? "success" : "warn")}
      ${renderStatChip(isDailySendLimitEnforced() ? "Cuota hoy" : "Enviados hoy", dailyRemaining, "default")}
      ${renderStatChip("TPS", lt.effectiveTps != null ? String(lt.effectiveTps) : "—", "default")}
    </div>`
      : "";

  const panelUnavailableHtml = `<p class="alert alert-error">El envío SMS no está disponible. Contacte a soporte Telvoice.</p>`;

  const sendForm = !panel
    ? `${panelUnavailableHtml}${sendOutcomeBlock}`
    : `
    <form method="post" action="/app/send-sms" id="tv-app-send-form" class="tv-send-layout">
      ${opts.idempotencyKey ? `<input type="hidden" name="idempotency_key" value="${escapeHtml(opts.idempotencyKey)}" />` : ""}
      <input type="hidden" name="send_mode" id="tv-send-mode" value="${escapeHtml(activeMode)}" />
      <textarea name="bulk_recipients" id="tv-bulk-recipients" hidden aria-hidden="true"></textarea>
      <input type="hidden" name="bulk_rows_json" id="tv-bulk-rows-json" value="" />
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
                <input id="sender_id" class="tv-input-full" name="sender_id" value="${escapeHtml(suggestedSenderId)}" placeholder="${escapeHtml(suggestedSenderId)}" required maxlength="11" pattern="[A-Za-z0-9]+" title="Solo letras y números, máximo 11 caracteres" ${disabledAttr} />
                <p class="field-hint">Sugerencia según tu empresa registrada: <strong>${escapeHtml(ctx.company.name)}</strong></p>
              </div>
            </div>
            <div data-tv-single-fields${activeMode === "single" || activeMode === "template" ? "" : " hidden"}>
              <div class="form-group">
                <label for="tv-send-to">Número destinatario</label>
                <input class="tv-input-full" name="to" id="tv-send-to" placeholder="56912345678" inputmode="numeric" autocomplete="tel" ${activeMode === "single" || activeMode === "template" ? "required" : ""} ${disabledAttr} />
                <p class="field-hint">Formato Chile: 569XXXXXXXX (sin signo +)</p>
              </div>
            </div>
            <div data-tv-mass-fields${activeMode === "mass" || activeMode === "scheduled" ? "" : " hidden"}>
              <div class="form-group">
                <label for="contact_list">Lista de contactos</label>
                <select id="contact_list" name="contact_list" class="tv-input-full" ${disabledAttr}>
                  ${renderContactListOptions(false)}
                </select>
              </div>
              <div class="form-group">
                <label for="csv_file">Cargar CSV</label>
                <input id="csv_file" type="file" accept=".csv,text/csv" class="tv-input-full" ${disabledAttr} />
                <p class="field-hint">Columnas <code>numero</code> y <code>mensaje</code> (o solo números + mensaje común abajo). Separador coma o punto y coma.</p>
              </div>
              <p class="field-hint tv-mass-summary" id="tv-mass-summary">Selecciona una lista o sube un CSV para previsualizar la campaña.</p>
              <div class="tv-mass-table-wrap" id="tv-mass-table-wrap" hidden>
                <div class="table-wrap tv-panel" style="padding:0;margin-top:0.5rem">
                  <table class="tv-table tv-table--dense" id="tv-mass-preview-table">
                    <thead><tr>
                      <th>Número</th><th>Mensaje</th><th>Seg.</th><th>SMS</th>
                    </tr></thead>
                    <tbody id="tv-mass-preview-body"></tbody>
                  </table>
                </div>
                <p class="field-hint" id="tv-mass-preview-more" hidden></p>
              </div>
            </div>
            <div data-tv-template-fields${activeMode === "template" ? "" : " hidden"}>
              <div class="form-group">
                <label for="template_id">Plantilla</label>
                <select id="template_id" name="template_id" class="tv-input-full" ${disabledAttr}>
                  ${renderTemplateOptions(false)}
                </select>
              </div>
            </div>
            <div data-tv-schedule-fields${activeMode === "scheduled" ? "" : " hidden"}>
              <div class="tv-form-grid">
                <div class="form-group">
                  <label for="schedule_date">Fecha programada</label>
                  <input id="schedule_date" name="schedule_date" type="date" class="tv-input-full" ${disabledAttr} />
                </div>
                <div class="form-group">
                  <label for="schedule_time">Hora</label>
                  <input id="schedule_time" name="schedule_time" type="time" class="tv-input-full" ${disabledAttr} />
                </div>
              </div>
              <p class="field-hint">Hora de Chile (America/Santiago). Puedes programar un CSV masivo o una lista; el despacho será a esa hora para todos los destinatarios.</p>
            </div>
            <div class="form-group" data-tv-message-group>
              <label for="tv-sms-message">Mensaje SMS <span class="field-hint" id="tv-mass-msg-hint" style="font-weight:400"></span></label>
              <textarea id="tv-sms-message" class="tv-input-full" name="message" rows="5"${activeMode === "mass" || activeMode === "scheduled" ? "" : " required"} placeholder="Escribe tu mensaje…" ${disabledAttr}></textarea>
              <div class="tv-var-row">
                <button type="button" class="tv-var-chip tv-template-btn" data-template="qa">QA pre-campaña</button>
                <button type="button" class="tv-var-chip tv-template-btn" data-template="dlr">Test DLR</button>
                ${varChips}
              </div>
            </div>
            <p class="field-hint tv-live-segment-warn" id="tv-live-segment-warn" hidden>El mensaje supera el máximo de segmentos permitido.</p>
            <p class="field-hint tv-live-number-warn" id="tv-live-number-warn" hidden>El número destino no está autorizado.</p>
            <p class="field-hint tv-mass-warn" id="tv-mass-warn" hidden>Agrega al menos un destinatario válido (lista o CSV).</p>
            ${submitBlockAlert}
            <button type="submit" class="btn btn-primary tv-send-submit" id="tv-send-submit" ${submitDisabled}>Enviar SMS</button>
          </div>
        </section>
        ${sendOutcomeBlock}
      </div>
      <aside class="tv-send-aside">
        <div id="tv-send-preview-phone" class="tv-send-preview-phone">
          ${renderHeroPhonePreview({
            senderLabel: suggestedSenderId,
            senderSub: companyDisplayName,
            message: "Hola, tu mensaje aparecerá aquí.",
            bubbleId: "tv-send-preview-bubble",
          })}
        </div>
        <div class="tv-send-validation">
          <div class="tv-stat-chips tv-stat-chips--send-aside tv-validation-chips">
            ${renderStatChip("Caracteres", "0", "default")}
            ${renderStatChip("Segmentos", "0", "primary")}
            ${renderStatChip("Costo est.", "0 SMS", "primary")}
            ${renderStatChip("Codificación", "GSM-7", "default")}
          </div>
        </div>
      </aside>
    </form>`;

  const body = `
    <div class="tv-app-send-page">
    ${renderPageHeader({
      title: "Enviar SMS",
      subtitle: "Individual, campaña masiva, programación o plantillas preaprobadas.",
      actions: panel ? headerActions : undefined,
    })}
    ${errorBlock}
    ${opsChips}
    ${sendForm}
    </div>
    <script>
    (function(){
      var ta = document.getElementById('tv-sms-message');
      var senderInput = document.getElementById('sender_id');
      var toInput = document.getElementById('tv-send-to');
      var sendModeInput = document.getElementById('tv-send-mode');
      var bulkHidden = document.getElementById('tv-bulk-recipients');
      var contactList = document.getElementById('contact_list');
      var csvInput = document.getElementById('csv_file');
      var templateSelect = document.getElementById('template_id');
      var scheduleDate = document.getElementById('schedule_date');
      var scheduleTime = document.getElementById('schedule_time');
      var avail = ${avail};
      var maxLiveSegments = ${lt?.maxSegments ?? 3};
      var canSubmit = ${canSubmit ? "true" : "false"};
      var numbersRestricted = ${lt?.authorizedNumbersConfigured ? "true" : "false"};
      var allowedLiveNumbers = ${JSON.stringify(allowedLiveNumbers)};
      var defaultVerifyMsg = ${JSON.stringify(defaultVerifyMsg)};
      var initialMode = ${JSON.stringify(activeMode)};
      var suggestedSenderId = ${JSON.stringify(suggestedSenderId)};
      var templateQa = defaultVerifyMsg;
      var templateDlr = '[Telvoice DLR] Test entrega ' + new Date().toISOString().slice(0,16).replace('T',' ') + '.';
      var bulkRowsJson = document.getElementById('tv-bulk-rows-json');
      var massSummary = document.getElementById('tv-mass-summary');
      var massTableWrap = document.getElementById('tv-mass-table-wrap');
      var massPreviewBody = document.getElementById('tv-mass-preview-body');
      var massPreviewMore = document.getElementById('tv-mass-preview-more');
      var massMsgHint = document.getElementById('tv-mass-msg-hint');
      var csvParsedRows = [];
      var massPreviewRows = [];
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
      function isValidClMobile(digits){
        if(!digits) return false;
        var d = digits.replace(/^\\+/,'');
        if(d.length===11 && d.indexOf('56')===0) return /^56[29]\\d{8}$/.test(d);
        if(d.length===9 && d.charAt(0)==='9') return true;
        return false;
      }
      function splitRecipients(raw){
        return (raw || '').split(/[\\n,;]+/).map(function(s){ return s.trim(); }).filter(Boolean);
      }
      function escHtml(s){
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }
      function parseCsvLine(line){
        var out = [], cur = '', q = false;
        for(var i=0;i<line.length;i++){
          var ch = line.charAt(i);
          if(ch === '"'){ q = !q; continue; }
          if((ch === ',' || ch === ';') && !q){ out.push(cur.trim()); cur = ''; continue; }
          cur += ch;
        }
        out.push(cur.trim());
        return out;
      }
      function isPhoneHeaderCell(c){
        return /^(numero|numeros|telefono|phone|destino|celular|movil|to)$/i.test((c||'').toLowerCase().replace(/[áéíóú]/g,function(m){ return {'á':'a','é':'e','í':'i','ó':'o','ú':'u'}[m]||m; }));
      }
      function isMessageHeaderCell(c){
        return /^(mensaje|mensajes|message|texto|sms)$/i.test((c||'').toLowerCase().replace(/[áéíóú]/g,function(m){ return {'á':'a','é':'e','í':'i','ó':'o','ú':'u'}[m]||m; }));
      }
      function parseCsvText(text){
        var lines = (text||'').split(/\\r?\\n/).map(function(l){ return l.trim(); }).filter(Boolean);
        if(!lines.length) return [];
        var start = 0;
        var first = parseCsvLine(lines[0]);
        if(first.length >= 2 && (isPhoneHeaderCell(first[0]) || isMessageHeaderCell(first[1]))) start = 1;
        var rows = [];
        for(var i=start;i<lines.length;i++){
          var cols = parseCsvLine(lines[i]);
          if(!cols.length) continue;
          var phone = (cols[0]||'').trim();
          if(!phone) continue;
          var message = cols.length >= 2 ? cols.slice(1).join(',').trim() : '';
          rows.push({ phone: phone, message: message });
        }
        return rows;
      }
      function rebuildMassPreviewRows(){
        var fallback = ta ? (ta.value || '').trim() : '';
        var combined = [];
        if(contactList && contactList.value){
          var opt = contactList.options[contactList.selectedIndex];
          var sample = opt ? (opt.getAttribute('data-sample') || '') : '';
          splitRecipients(sample).forEach(function(p){
            combined.push({ phone: p, message: fallback });
          });
        }
        csvParsedRows.forEach(function(r){ combined.push({ phone: r.phone, message: r.message || fallback }); });
        var seen = {};
        massPreviewRows = [];
        combined.forEach(function(r){
          var key = normalizePhoneDigits(r.phone);
          if(!key || seen[key]) return;
          seen[key] = true;
          var msg = (r.message || fallback).trim();
          var valid = isValidClMobile(key);
          var seg = msg ? calc(msg) : { seg: 0, cost: 0 };
          var hasMsg = !!msg;
          var rowOk = valid && hasMsg;
          massPreviewRows.push({
            phone: r.phone,
            message: msg || '—',
            valid: valid,
            ok: rowOk,
            seg: seg.seg,
            cost: seg.cost
          });
        });
      }
      function countMassStats(){
        rebuildMassPreviewRows();
        var valid = 0, invalid = 0, totalSms = 0, withCsvMsg = false;
        massPreviewRows.forEach(function(r){
          if(r.ok){ valid++; totalSms += r.cost; }
          else invalid++;
          if(csvParsedRows.length && r.message && r.message !== '—') withCsvMsg = true;
        });
        if(csvParsedRows.length){
          withCsvMsg = csvParsedRows.some(function(r){ return !!(r.message && r.message.trim()); });
        }
        return {
          total: massPreviewRows.length,
          valid: valid,
          invalid: invalid,
          totalSms: totalSms,
          hasPerRowMessages: withCsvMsg,
          rows: massPreviewRows
        };
      }
      function syncBulkPayload(){
        rebuildMassPreviewRows();
        var stats = countMassStats();
        if(bulkHidden) bulkHidden.value = massPreviewRows.map(function(r){ return r.phone; }).join('\\n');
        if(bulkRowsJson){
          var payload = massPreviewRows.filter(function(r){ return r.ok; }).map(function(r){
            return { phone: r.phone, message: r.message === '—' ? '' : r.message };
          });
          bulkRowsJson.value = JSON.stringify(payload);
        }
        return stats;
      }
      function updateMessageRequired(){
        if(!ta) return;
        var mode = getSendMode();
        var stats = countMassStats();
        if(isBulkMode(mode)){
          if(stats.hasPerRowMessages && stats.valid > 0){
            ta.removeAttribute('required');
            if(massMsgHint) massMsgHint.textContent = '(opcional: el CSV ya incluye mensaje por fila)';
          } else {
            ta.setAttribute('required','');
            if(massMsgHint) massMsgHint.textContent = mode === 'scheduled'
              ? '(mensaje común si el CSV solo trae números)'
              : '(mensaje común para todos los números)';
          }
        } else {
          ta.setAttribute('required','');
          if(massMsgHint) massMsgHint.textContent = '';
        }
      }
      function renderMassPreview(){
        var stats = syncBulkPayload();
        updateMessageRequired();
        if(massSummary){
          var bulk = isBulkMode(getSendMode());
          if(!stats.total){
            massSummary.textContent = bulk && getSendMode() === 'scheduled'
              ? 'Sube un CSV o elige una lista para programar el envío masivo.'
              : 'Selecciona una lista o sube un CSV para previsualizar la campaña.';
          } else {
            var prefix = getSendMode() === 'scheduled' ? 'A programar: ' : '';
            massSummary.textContent = prefix + stats.valid + ' listos · ' + stats.invalid + ' con error · ' + stats.totalSms + ' SMS estimados · ' + stats.total + ' filas';
          }
        }
        if(massTableWrap && massPreviewBody){
          var show = stats.total > 0;
          massTableWrap.hidden = !show;
          if(show){
            var maxShow = 8;
            var html = stats.rows.slice(0, maxShow).map(function(r){
              var cls = r.ok ? '' : ' style="opacity:0.65"';
              var msgShort = r.message.length > 48 ? r.message.slice(0,48) + '…' : r.message;
              return '<tr'+cls+'><td><code>'+escHtml(r.phone)+'</code></td><td>'+escHtml(msgShort)+'</td><td>'+r.seg+'</td><td>'+r.cost+'</td></tr>';
            }).join('');
            massPreviewBody.innerHTML = html || '<tr><td colspan="4">Sin filas</td></tr>';
            if(massPreviewMore){
              if(stats.rows.length > maxShow){
                massPreviewMore.hidden = false;
                massPreviewMore.textContent = 'Y ' + (stats.rows.length - maxShow) + ' filas más…';
              } else {
                massPreviewMore.hidden = true;
              }
            }
            var firstOk = stats.rows.filter(function(r){ return r.ok; })[0];
            var bubble = document.querySelector('.tv-phone__bubble');
            if(bubble && firstOk) bubble.textContent = firstOk.message;
          }
        }
        return stats;
      }
      function getSendMode(){
        return sendModeInput ? sendModeInput.value : 'single';
      }
      function isBulkMode(mode){
        return mode === 'mass' || mode === 'scheduled';
      }
      function isRecipientAllowed(){
        var mode = getSendMode();
        if(isBulkMode(mode)){
          var ms = countMassStats();
          return ms.valid > 0 && (ms.hasPerRowMessages || (ta && (ta.value || '').trim()));
        }
        if(!numbersRestricted && allowedLiveNumbers.length === 0) return true;
        if(!toInput) return true;
        var v = (toInput.value || '').trim();
        if(!v) return false;
        if(!allowedLiveNumbers.length && !numbersRestricted) return true;
        var digits = normalizePhoneDigits(v);
        return allowedLiveNumbers.some(function(n){
          var a = normalizePhoneDigits(n);
          return a === digits || a === digits.replace(/^\\+/,'');
        });
      }
      function updateSubmitLabel(mode){
        var btn = document.getElementById('tv-send-submit');
        var headerBtn = document.getElementById('tv-header-send-btn');
        var labels = { single: 'Enviar SMS', mass: 'Enviar campaña', scheduled: 'Programar envío', template: 'Enviar SMS' };
        var label = labels[mode] || 'Enviar SMS';
        if(btn) btn.textContent = label;
        if(headerBtn){
          var icon = headerBtn.querySelector('.material-symbols-outlined');
          headerBtn.innerHTML = (icon ? icon.outerHTML : '<span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">send</span>') + ' ' + label;
        }
      }
      function applySendMode(mode){
        if(sendModeInput) sendModeInput.value = mode;
        var single = document.querySelector('[data-tv-single-fields]');
        var mass = document.querySelector('[data-tv-mass-fields]');
        var tpl = document.querySelector('[data-tv-template-fields]');
        var sched = document.querySelector('[data-tv-schedule-fields]');
        if(single) single.hidden = mode !== 'single' && mode !== 'template';
        if(mass) mass.hidden = !isBulkMode(mode);
        if(tpl) tpl.hidden = mode !== 'template';
        if(sched) sched.hidden = mode !== 'scheduled';
        if(toInput){
          toInput.required = mode === 'single' || mode === 'template';
          if(isBulkMode(mode)) toInput.removeAttribute('required');
        }
        updateSubmitLabel(mode);
        updateMessageRequired();
        if(isBulkMode(mode)) renderMassPreview();
        refresh();
      }
      function setChip(label, value){
        document.querySelectorAll('.tv-validation-chips .tv-stat-chip').forEach(function(chip){
          var l = chip.querySelector('.tv-stat-chip__label');
          var val = chip.querySelector('.tv-stat-chip__value');
          if(l && val && l.textContent === label) val.textContent = value;
        });
      }
      function refresh(){
        if(!ta) return;
        var mode = getSendMode();
        var t = ta.value || '';
        var c = calc(t);
        var massStats = null;
        if(isBulkMode(mode)){
          massStats = renderMassPreview();
          setChip('Caracteres', String(massStats.total) + ' filas');
          setChip('Segmentos', String(massStats.totalSms) + ' SMS');
          setChip('Costo est.', String(massStats.valid) + ' válidos');
          setChip('Codificación', String(massStats.invalid) + ' err.');
        } else {
          var costEst = c.cost + ' SMS';
          setChip('Caracteres', String(c.chars));
          setChip('Segmentos', String(c.seg));
          setChip('Costo est.', costEst);
          setChip('Codificación', c.enc);
        }
        var bubble = document.getElementById('tv-send-preview-bubble');
        var phoneTitle = document.querySelector('#tv-send-preview-phone .tv-hero-phone__app-title');
        var phoneAvatar = document.querySelector('#tv-send-preview-phone .tv-hero-phone__avatar');
        if(!isBulkMode(mode) && bubble) bubble.textContent = t || 'Hola, tu mensaje aparecerá aquí.';
        if(senderInput) {
          var sid = (senderInput.value || '').trim() || suggestedSenderId;
          if(phoneTitle) phoneTitle.textContent = sid;
          if(phoneAvatar) phoneAvatar.textContent = (sid.charAt(0) || 'E').toUpperCase();
        }
        var overSeg = false;
        if(isBulkMode(mode) && massStats){
          massStats.rows.forEach(function(r){ if(r.ok && r.seg > maxLiveSegments) overSeg = true; });
        } else if(mode !== 'scheduled') {
          overSeg = c.seg > maxLiveSegments;
        }
        var numOk = isRecipientAllowed();
        var schedOk = mode !== 'scheduled' || (scheduleDate && scheduleDate.value && scheduleTime && scheduleTime.value);
        var bulkOk = !isBulkMode(mode) || (massStats && massStats.valid > 0 && (massStats.hasPerRowMessages || (ta && (ta.value || '').trim())));
        var segWarn = document.getElementById('tv-live-segment-warn');
        var numWarn = document.getElementById('tv-live-number-warn');
        var massWarn = document.getElementById('tv-mass-warn');
        var submitBtn = document.getElementById('tv-send-submit');
        var headerBtn = document.getElementById('tv-header-send-btn');
        if(segWarn) segWarn.hidden = !overSeg;
        if(numWarn) numWarn.hidden = isBulkMode(mode) || numOk || (!numbersRestricted && allowedLiveNumbers.length === 0);
        if(massWarn) massWarn.hidden = bulkOk || !isBulkMode(mode);
        var disabled = overSeg || !numOk || !schedOk || !bulkOk;
        if(submitBtn) submitBtn.disabled = !canSubmit || disabled;
        if(headerBtn) headerBtn.disabled = !canSubmit || disabled;
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
      var modeRoot = document.querySelector('[data-tv-send-mode-root]');
      if(modeRoot){
        modeRoot.querySelectorAll('[data-tv-send-mode]').forEach(function(btn){
          btn.addEventListener('click', function(){
            var id = btn.getAttribute('data-tv-send-mode');
            modeRoot.querySelectorAll('[data-tv-send-mode]').forEach(function(b){
              b.classList.toggle('tv-mode-card--active', b === btn);
            });
            applySendMode(id || 'single');
          });
        });
      }
      if(contactList){
        contactList.addEventListener('change', function(){ renderMassPreview(); refresh(); });
      }
      if(csvInput){
        csvInput.addEventListener('change', function(){
          var file = csvInput.files && csvInput.files[0];
          if(!file){ csvParsedRows = []; renderMassPreview(); refresh(); return; }
          var reader = new FileReader();
          reader.onload = function(ev){
            csvParsedRows = parseCsvText(String(ev.target && ev.target.result || ''));
            renderMassPreview();
            refresh();
          };
          reader.readAsText(file);
        });
      }
      var sendForm = document.getElementById('tv-app-send-form');
      var sendSubmit = document.getElementById('tv-send-submit');
      var headerSendBtn = document.getElementById('tv-header-send-btn');
      if(sendForm){
        sendForm.addEventListener('submit', function(ev){
          if(isBulkMode(getSendMode())) renderMassPreview();
          if(sendForm.getAttribute('data-tv-submitting') === '1'){
            ev.preventDefault();
            return;
          }
          sendForm.setAttribute('data-tv-submitting', '1');
          [sendSubmit, headerSendBtn].forEach(function(btn){
            if(!btn) return;
            btn.setAttribute('disabled', 'disabled');
            if(btn === sendSubmit) btn.textContent = 'Enviando…';
          });
        });
      }
      if(templateSelect){
        templateSelect.addEventListener('change', function(){
          var opt = templateSelect.options[templateSelect.selectedIndex];
          var msg = opt ? opt.getAttribute('data-message') : '';
          if(msg && ta){ ta.value = msg; ta.focus(); refresh(); }
        });
      }
      if(scheduleDate) scheduleDate.addEventListener('change', refresh);
      if(scheduleTime) scheduleTime.addEventListener('change', refresh);
      if(senderInput) senderInput.addEventListener('input', refresh);
      if(toInput) toInput.addEventListener('input', refresh);
      if(ta){ ta.addEventListener('input', refresh); }
      applySendMode(initialMode || 'single');
    })();
    </script>`;

  return wrapAppPage(
    { ...ctx, flash: undefined, error: undefined },
    "send-sms",
    "Enviar SMS",
    body,
  );
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
