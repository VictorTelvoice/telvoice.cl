/** Script cliente compartido: parseo CSV, tabla previa y validación antes del POST. */
export type MassCampaignCsvPreviewScriptOptions = {
  initialMode?: string;
  suggestedSenderId?: string;
  maxLiveSegments?: number;
  maxPreviewRows?: number;
  allowedLiveNumbers?: string[];
  numbersRestricted?: boolean;
  availSms?: number;
};

export function renderMassCampaignCsvPreviewScript(
  opts: MassCampaignCsvPreviewScriptOptions,
): string {
  const initialMode = opts.initialMode ?? "mass";
  const suggestedSenderId = opts.suggestedSenderId ?? "EMPRESA";
  const maxLiveSegments = opts.maxLiveSegments ?? 10;
  const maxPreviewRows = opts.maxPreviewRows ?? 12;
  const allowedLiveNumbers = opts.allowedLiveNumbers ?? [];
  const numbersRestricted = opts.numbersRestricted ?? false;
  const avail = opts.availSms ?? 0;

  return `<script>
(function(){
  var ta = document.getElementById('tv-sms-message');
  var senderInput = document.getElementById('sender_id');
  var sendModeInput = document.getElementById('tv-send-mode');
  var bulkRowsJson = document.getElementById('tv-bulk-rows-json');
  var csvInput = document.getElementById('csv_file');
  var scheduleDate = document.getElementById('schedule_date');
  var scheduleTime = document.getElementById('schedule_time');
  var massSummary = document.getElementById('tv-mass-summary');
  var massTableWrap = document.getElementById('tv-mass-table-wrap');
  var massPreviewBody = document.getElementById('tv-mass-preview-body');
  var massPreviewMore = document.getElementById('tv-mass-preview-more');
  var massMsgHint = document.getElementById('tv-mass-msg-hint');
  var dispatchBtn = document.getElementById('tv-campaign-dispatch-btn');
  var avail = ${avail};
  var maxLiveSegments = ${maxLiveSegments};
  var numbersRestricted = ${numbersRestricted};
  var allowedLiveNumbers = ${JSON.stringify(allowedLiveNumbers)};
  var initialMode = ${JSON.stringify(initialMode)};
  var suggestedSenderId = ${JSON.stringify(suggestedSenderId)};
  var maxShow = ${maxPreviewRows};
  var csvParsedRows = [];
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
  function escHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
    return /^(numero|numeros|telefono|phone|destino|celular|movil|to)$/i.test((c||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,''));
  }
  function isMessageHeaderCell(c){
    return /^(mensaje|mensajes|message|texto|sms)$/i.test((c||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,''));
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
      rows.push({ phone: phone, message: cols.length >= 2 ? cols.slice(1).join(',').trim() : '' });
    }
    return rows;
  }
  function getSendMode(){ return sendModeInput ? sendModeInput.value : 'mass'; }
  function isBulkMode(m){ return m === 'mass' || m === 'scheduled'; }
  function rebuildMassPreviewRows(){
    var fallback = ta ? (ta.value || '').trim() : '';
    var seen = {}, massPreviewRows = [];
    csvParsedRows.forEach(function(r){
      var key = normalizePhoneDigits(r.phone);
      if(!key || seen[key]) return;
      seen[key] = true;
      var msg = (r.message || fallback).trim();
      var valid = isValidClMobile(key);
      var seg = msg ? calc(msg) : { seg: 0, cost: 0 };
      var rowOk = valid && !!msg;
      massPreviewRows.push({ phone: r.phone, message: msg || '—', valid: valid, ok: rowOk, seg: seg.seg, cost: seg.cost });
    });
    return massPreviewRows;
  }
  function countMassStats(){
    var rows = rebuildMassPreviewRows();
    var valid = 0, invalid = 0, totalSms = 0;
    var hasPerRowMessages = csvParsedRows.some(function(r){ return !!(r.message && r.message.trim()); });
    rows.forEach(function(r){
      if(r.ok){ valid++; totalSms += r.cost; } else invalid++;
    });
    return { total: rows.length, valid: valid, invalid: invalid, totalSms: totalSms, hasPerRowMessages: hasPerRowMessages, rows: rows };
  }
  function syncBulkPayload(){
    var stats = countMassStats();
    if(bulkRowsJson){
      bulkRowsJson.value = JSON.stringify(stats.rows.filter(function(r){ return r.ok; }).map(function(r){
        return { phone: r.phone, message: r.message === '—' ? '' : r.message };
      }));
    }
    return stats;
  }
  function syncMassMessageFieldLock(stats){
    if(!ta) return;
    var mode = getSendMode();
    var locked = isBulkMode(mode) && stats && stats.hasPerRowMessages && stats.valid > 0;
    var grp = document.querySelector('[data-tv-message-group]');
    if(grp) grp.classList.toggle('tv-message-locked', locked);
    if(locked){
      ta.readOnly = true;
      ta.setAttribute('readonly','readonly');
      ta.classList.add('tv-input-readonly-locked');
      ta.value = '';
      ta.placeholder = 'Texto definido en la planilla (columna mensaje). Este cuadro está bloqueado para no duplicar un mensaje manual.';
    } else {
      ta.readOnly = false;
      ta.removeAttribute('readonly');
      ta.classList.remove('tv-input-readonly-locked');
      if((ta.placeholder || '').indexOf('planilla') >= 0) ta.placeholder = 'Escribe tu mensaje…';
    }
  }
  function updateMessageRequired(){
    if(!ta) return;
    var stats = countMassStats();
    var mode = getSendMode();
    if(isBulkMode(mode) && stats.hasPerRowMessages && stats.valid > 0){
      ta.removeAttribute('required');
      if(massMsgHint) massMsgHint.textContent = '(mensajes por fila en la planilla — cuadro bloqueado)';
    } else {
      ta.setAttribute('required','');
      if(massMsgHint) massMsgHint.textContent = mode === 'scheduled' ? '(mensaje común si el CSV solo trae números)' : '(mensaje común para todos)';
    }
    syncMassMessageFieldLock(stats);
  }
  function renderMassPreview(){
    var stats = syncBulkPayload();
    updateMessageRequired();
    var mode = getSendMode();
    if(massSummary){
      if(!stats.total){
        massSummary.textContent = mode === 'scheduled'
          ? 'Sube un CSV para programar el envío masivo.'
          : 'Sube un CSV para previsualizar antes del despacho.';
      } else {
        var prefix = mode === 'scheduled' ? 'A programar: ' : 'Listos para despacho: ';
        massSummary.textContent = prefix + stats.valid + ' válidos · ' + stats.invalid + ' errores · ~' + stats.totalSms + ' SMS · ' + stats.total + ' filas';
      }
    }
    if(massTableWrap && massPreviewBody){
      var show = stats.total > 0;
      massTableWrap.hidden = !show;
      if(show){
        massPreviewBody.innerHTML = stats.rows.slice(0, maxShow).map(function(r){
          var st = r.ok ? 'ok' : 'err';
          var msgShort = r.message.length > 40 ? r.message.slice(0,40) + '…' : r.message;
          return '<tr class="tv-csv-row--'+st+'"><td><code>'+escHtml(r.phone)+'</code></td><td>'+escHtml(msgShort)+'</td><td>'+r.seg+'</td><td>'+r.cost+'</td></tr>';
        }).join('') || '<tr><td colspan="4">Sin filas</td></tr>';
        if(massPreviewMore){
          if(stats.rows.length > maxShow){
            massPreviewMore.hidden = false;
            massPreviewMore.textContent = 'Y ' + (stats.rows.length - maxShow) + ' filas más en el archivo…';
          } else massPreviewMore.hidden = true;
        }
      }
    }
    refreshValidation(stats);
    return stats;
  }
  function refreshValidation(stats){
    if(!stats) stats = countMassStats();
    var mode = getSendMode();
    var schedOk = mode !== 'scheduled' || (scheduleDate && scheduleDate.value && scheduleTime && scheduleTime.value);
    var bulkOk = stats.valid > 0 && (stats.hasPerRowMessages || (ta && (ta.value || '').trim()));
    var balanceOk = avail <= 0 || stats.totalSms <= avail;
    var canDispatch = bulkOk && schedOk && balanceOk;
    if(dispatchBtn){
      dispatchBtn.disabled = !canDispatch;
      dispatchBtn.title = canDispatch ? '' : 'Revisa CSV, mensaje, programación o saldo';
    }
    document.querySelectorAll('[data-tv-val-valid]').forEach(function(el){ el.textContent = String(stats.valid); });
    document.querySelectorAll('[data-tv-val-invalid]').forEach(function(el){ el.textContent = String(stats.invalid); });
    document.querySelectorAll('[data-tv-val-sms]').forEach(function(el){ el.textContent = String(stats.totalSms); });
    document.querySelectorAll('[data-tv-val-balance]').forEach(function(el){
      el.textContent = avail > 0 ? String(Math.max(0, avail - stats.totalSms)) : '—';
    });
  }
  function applySendMode(mode){
    if(sendModeInput) sendModeInput.value = mode;
    var mass = document.querySelector('[data-tv-mass-fields]');
    var sched = document.querySelector('[data-tv-schedule-fields]');
    if(mass) mass.hidden = !isBulkMode(mode);
    if(sched) sched.hidden = mode !== 'scheduled';
    if(dispatchBtn){
      dispatchBtn.textContent = mode === 'scheduled' ? 'Confirmar y programar campaña' : 'Confirmar y despachar campaña';
    }
    renderMassPreview();
  }
  document.querySelectorAll('[data-tv-send-mode]').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('[data-tv-send-mode]').forEach(function(b){
        b.classList.toggle('tv-mode-card--active', b === btn);
      });
      applySendMode(btn.getAttribute('data-tv-send-mode') || 'mass');
    });
  });
  if(csvInput){
    csvInput.addEventListener('change', function(){
      var f = csvInput.files && csvInput.files[0];
      if(!f){ csvParsedRows = []; renderMassPreview(); return; }
      var reader = new FileReader();
      reader.onload = function(){
        csvParsedRows = parseCsvText(reader.result || '');
        renderMassPreview();
      };
      reader.readAsText(f, 'UTF-8');
    });
  }
  if(ta) ta.addEventListener('input', function(){ if(isBulkMode(getSendMode())) renderMassPreview(); });
  if(scheduleDate) scheduleDate.addEventListener('change', function(){ renderMassPreview(); });
  if(scheduleTime) scheduleTime.addEventListener('change', function(){ renderMassPreview(); });
  var companySelect = document.getElementById('company_id');
  if(companySelect) companySelect.addEventListener('change', function(){ /* recarga página con ?company= */ });
  applySendMode(initialMode);
})();
</script>`;
}
