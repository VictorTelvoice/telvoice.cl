import { calculateSmsSegments } from "../../services/smsSegmentService.js";
import { escapeHtml, formatDateShort } from "../../utils/html.js";
import { renderKpiCard } from "../admin-ui/components.js";
import { renderFilterField, renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";

export type SmsTemplateCategory =
  | "OTP"
  | "Transaccional"
  | "Marketing"
  | "Recordatorio"
  | "Interno"
  | "Soporte";

export type SmsTemplateStatus = "active" | "draft";

export type ClientSmsTemplate = {
  id: string;
  name: string;
  category: SmsTemplateCategory;
  message: string;
  status: SmsTemplateStatus;
  updatedAt: string;
};

export const SMS_TEMPLATE_CATEGORIES: SmsTemplateCategory[] = [
  "OTP",
  "Transaccional",
  "Marketing",
  "Recordatorio",
  "Interno",
  "Soporte",
];

const NOW = new Date().toISOString();

export const DEFAULT_CLIENT_SMS_TEMPLATES: ClientSmsTemplate[] = [
  {
    id: "tpl_otp_verify",
    name: "Código de verificación",
    category: "OTP",
    message:
      "Tu código de verificación Telvoice es {{codigo}}. No lo compartas con nadie.",
    status: "active",
    updatedAt: NOW,
  },
  {
    id: "tpl_purchase_confirm",
    name: "Confirmación de compra",
    category: "Transaccional",
    message:
      "Hola {{nombre}}, tu compra fue confirmada correctamente. Gracias por preferirnos.",
    status: "active",
    updatedAt: NOW,
  },
  {
    id: "tpl_payment_reminder",
    name: "Recordatorio de pago",
    category: "Recordatorio",
    message:
      "Hola {{nombre}}, te recordamos que tienes un pago pendiente por {{monto}}.",
    status: "draft",
    updatedAt: NOW,
  },
  {
    id: "tpl_promo_clients",
    name: "Promoción clientes",
    category: "Marketing",
    message:
      "Hola {{nombre}}, tenemos una promoción especial disponible por tiempo limitado.",
    status: "active",
    updatedAt: NOW,
  },
  {
    id: "tpl_internal_comms",
    name: "Comunicación interna",
    category: "Interno",
    message:
      "Equipo, favor confirmar recepción de esta instrucción por canal seguro.",
    status: "active",
    updatedAt: NOW,
  },
];

function templatesPageStyles(): string {
  return `<style>
    .tv-templates-page .tv-templates-examples {
      display: none;
      margin-bottom: 1.25rem;
    }
    .tv-templates-page.tv-templates-page--examples-open .tv-templates-examples {
      display: block;
    }
    .tv-templates-examples__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 0.75rem;
    }
    .tv-templates-example-card {
      padding: 0.85rem 1rem;
      border: 1px solid var(--tv-border);
      border-radius: var(--tv-radius);
      background: var(--tv-surface);
      font-size: 0.85rem;
    }
    .tv-templates-example-card__msg {
      margin: 0.5rem 0 0;
      color: var(--tv-muted);
      line-height: 1.4;
      font-size: 0.8rem;
    }
    .tv-templates-table-wrap {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .tv-templates-table .tv-templates-preview {
      max-width: 280px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--tv-muted);
      font-size: 0.82rem;
    }
    .tv-templates-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      justify-content: flex-end;
    }
    .tv-templates-empty {
      text-align: center;
      padding: 2.5rem 1.5rem;
    }
    .tv-templates-empty .material-symbols-outlined {
      font-size: 2.5rem;
      color: var(--tv-primary);
      opacity: 0.75;
    }
    .tv-templates-modal {
      position: fixed;
      inset: 0;
      z-index: 200;
      display: none;
      align-items: stretch;
      justify-content: flex-end;
    }
    .tv-templates-modal[aria-hidden="false"] {
      display: flex;
    }
    .tv-templates-modal__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
    }
    .tv-templates-modal__panel {
      position: relative;
      width: min(420px, 100%);
      max-width: 100%;
      background: var(--tv-surface);
      box-shadow: var(--tv-shadow-lg);
      display: flex;
      flex-direction: column;
      max-height: 100vh;
      overflow: hidden;
    }
    .tv-templates-modal__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 1.25rem 1.25rem 0.75rem;
      border-bottom: 1px solid var(--tv-border);
    }
    .tv-templates-modal__body {
      padding: 1rem 1.25rem;
      overflow-y: auto;
      flex: 1;
    }
    .tv-templates-modal__foot {
      padding: 1rem 1.25rem;
      border-top: 1px solid var(--tv-border);
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .tv-templates-segment-hint {
      margin: 0.5rem 0 0;
      font-size: 0.8rem;
      color: var(--tv-muted);
    }
    .tv-templates-segment-hint--warn {
      color: #b45309;
    }
    @media (max-width: 640px) {
      .tv-templates-modal {
        align-items: flex-end;
      }
      .tv-templates-modal__panel {
        width: 100%;
        border-radius: var(--tv-radius) var(--tv-radius) 0 0;
        max-height: 92vh;
      }
      .tv-templates-table .tv-templates-actions .btn {
        padding: 0.2rem 0.4rem;
        font-size: 0.72rem;
      }
    }
  </style>`;
}

function renderExamplesSection(): string {
  const cards = DEFAULT_CLIENT_SMS_TEMPLATES.map(
    (t) => `<article class="tv-templates-example-card">
      <strong>${escapeHtml(t.name)}</strong>
      <span class="tv-tag tv-tag--muted" style="margin-left:0.35rem">${escapeHtml(t.category)}</span>
      <p class="tv-templates-example-card__msg">${escapeHtml(t.message)}</p>
    </article>`,
  ).join("");

  return `<section class="tv-panel tv-templates-examples" id="tv-templates-examples" aria-label="Ejemplos de plantillas">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Ejemplos de referencia</h2>
      <p class="tv-section-head__sub">Inspírate en estos mensajes; puedes duplicarlos y adaptarlos a tu marca.</p>
    </header>
    <div class="tv-panel__body">
      <div class="tv-templates-examples__grid">${cards}</div>
    </div>
  </section>`;
}

function renderModalShell(): string {
  const categoryOpts = SMS_TEMPLATE_CATEGORIES.map(
    (c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`,
  ).join("");

  return `<div class="tv-templates-modal" id="tv-templates-modal" role="dialog" aria-modal="true" aria-labelledby="tv-templates-modal-title" aria-hidden="true">
    <div class="tv-templates-modal__backdrop" data-tv-templates-close tabindex="-1"></div>
    <div class="tv-templates-modal__panel">
      <header class="tv-templates-modal__head">
        <div>
          <h2 class="tv-section-head__title" id="tv-templates-modal-title">Nueva plantilla</h2>
          <p class="tv-section-head__sub" id="tv-templates-modal-sub">Completa los campos para guardar el mensaje.</p>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-tv-templates-close aria-label="Cerrar">✕</button>
      </header>
      <div class="tv-templates-modal__body">
        <form id="tv-templates-form" novalidate>
          <input type="hidden" name="id" id="tv-tpl-id" value="" />
          <div class="form-group">
            <label for="tv-tpl-name">Nombre de plantilla</label>
            <input type="text" id="tv-tpl-name" name="name" class="tv-input-full" required maxlength="120" placeholder="Ej. Código de verificación" />
          </div>
          <div class="form-group">
            <label for="tv-tpl-category">Categoría</label>
            <select id="tv-tpl-category" name="category" class="tv-input-full" required>${categoryOpts}</select>
          </div>
          <div class="form-group">
            <label for="tv-tpl-status">Estado</label>
            <select id="tv-tpl-status" name="status" class="tv-input-full" required>
              <option value="active">Activa</option>
              <option value="draft">Borrador</option>
            </select>
          </div>
          <div class="form-group">
            <label for="tv-tpl-message">Mensaje SMS</label>
            <textarea id="tv-tpl-message" name="message" class="tv-input-full" rows="5" required maxlength="1000" placeholder="Escribe el texto del SMS. Usa {{nombre}}, {{codigo}}, etc."></textarea>
            <p class="field-hint">Variables sugeridas: {{nombre}} {{codigo}} {{monto}} {{empresa}}</p>
            <div class="tv-stat-chips" style="margin-top:0.65rem">
              <div class="tv-stat-chip"><span class="tv-stat-chip__label">Caracteres</span><span class="tv-stat-chip__value" id="tv-tpl-chars">0</span></div>
              <div class="tv-stat-chip"><span class="tv-stat-chip__label">SMS est.</span><span class="tv-stat-chip__value" id="tv-tpl-segments">0</span></div>
              <div class="tv-stat-chip"><span class="tv-stat-chip__label">Codificación</span><span class="tv-stat-chip__value" id="tv-tpl-encoding">GSM-7</span></div>
            </div>
            <p class="tv-templates-segment-hint" id="tv-tpl-segment-warn" hidden></p>
          </div>
        </form>
      </div>
      <footer class="tv-templates-modal__foot">
        <button type="button" class="btn btn-ghost" data-tv-templates-close>Cancelar</button>
        <button type="submit" form="tv-templates-form" class="btn btn-primary" id="tv-tpl-save-btn">Guardar plantilla</button>
      </footer>
    </div>
  </div>`;
}

function renderTemplatesScript(companyId: string): string {
  const initialJson = JSON.stringify(DEFAULT_CLIENT_SMS_TEMPLATES).replace(
    /</g,
    "\\u003c",
  );
  const categoriesJson = JSON.stringify(SMS_TEMPLATE_CATEGORIES).replace(
    /</g,
    "\\u003c",
  );

  return `<script>
(function () {
  var STORAGE_KEY = "telvoice_client_sms_templates_${escapeHtml(companyId)}";
  var INITIAL = ${initialJson};
  var CATEGORIES = ${categoriesJson};

  var GSM_BASIC = /^[@£$¥èéùìòÇ\\nØø\\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\\-./0-9:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\\\\\[\\~\\]|€]*$/;
  function isGsm7(text) { return GSM_BASIC.test(text || ""); }
  function calcSegments(message) {
    var text = message || "";
    var chars = Array.from(text).length;
    if (!chars) return { characters: 0, encoding: "GSM-7", segments: 0 };
    if (isGsm7(text)) {
      if (chars <= 160) return { characters: chars, encoding: "GSM-7", segments: 1 };
      return { characters: chars, encoding: "GSM-7", segments: Math.ceil(chars / 153) };
    }
    if (chars <= 70) return { characters: chars, encoding: "UCS-2", segments: 1 };
    return { characters: chars, encoding: "UCS-2", segments: Math.ceil(chars / 67) };
  }

  var root = document.querySelector(".tv-templates-page");
  var kpiRoot = document.getElementById("tv-templates-kpis");
  var tableBody = document.getElementById("tv-templates-tbody");
  var emptyEl = document.getElementById("tv-templates-empty");
  var tableBlock = document.getElementById("tv-templates-table-block");
  var modal = document.getElementById("tv-templates-modal");
  var form = document.getElementById("tv-templates-form");
  var searchInput = document.getElementById("tv-tpl-search");
  var catFilter = document.getElementById("tv-tpl-filter-category");
  var statusFilter = document.getElementById("tv-tpl-filter-status");

  var state = { templates: [], filter: { q: "", category: "", status: "" } };

  function loadTemplates() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (e) {}
    return INITIAL.slice();
  }

  function saveTemplates() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.templates)); } catch (e) {}
  }

  function newId() {
    return "tpl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function fmtDate(iso) {
    try {
      return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
    } catch (e) { return "—"; }
  }

  function statusLabel(s) { return s === "active" ? "Activa" : "Borrador"; }
  function statusBadge(s) {
    return s === "active"
      ? '<span class="badge badge-ok">Activa</span>'
      : '<span class="badge badge-warn">Borrador</span>';
  }
  function categoryTag(c) {
    return '<span class="tv-tag">' + escapeHtml(c) + "</span>";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function smsLabel(n) {
    if (!n) return "—";
    return n === 1 ? "1 SMS" : n + " SMS";
  }

  function filtered() {
    var q = (state.filter.q || "").toLowerCase().trim();
    var cat = state.filter.category || "";
    var st = state.filter.status || "";
    return state.templates.filter(function (t) {
      if (cat && t.category !== cat) return false;
      if (st && t.status !== st) return false;
      if (!q) return true;
      var hay = (t.name + " " + t.message + " " + t.category).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function summary() {
    var all = state.templates;
    var cats = {};
    var last = null;
    all.forEach(function (t) {
      cats[t.category] = true;
      if (!last || t.updatedAt > last) last = t.updatedAt;
    });
    return {
      total: all.length,
      active: all.filter(function (t) { return t.status === "active"; }).length,
      categories: Object.keys(cats).length,
      lastUpdated: last,
    };
  }

  function renderKpis() {
    var s = summary();
    kpiRoot.innerHTML =
      kpiCard("Total plantillas", String(s.total), "En tu biblioteca", "description", "primary") +
      kpiCard("Plantillas activas", String(s.active), "Listas para usar", "check_circle", "success") +
      kpiCard("Categorías usadas", String(s.categories), "De " + CATEGORIES.length + " disponibles", "category", "default") +
      kpiCard("Última actualización", s.lastUpdated ? fmtDate(s.lastUpdated) : "—", "Cambio más reciente", "update", "default");
  }

  function kpiCard(label, value, hint, icon, variant) {
    return '<article class="tv-kpi tv-kpi--' + variant + '">' +
      '<div class="tv-kpi__head"><span class="material-symbols-outlined tv-kpi__icon" aria-hidden="true">' + icon + "</span>" +
      '<span class="tv-kpi__label">' + escapeHtml(label) + "</span></div>" +
      '<div class="tv-kpi__value">' + escapeHtml(value) + "</div>" +
      (hint ? '<p class="tv-kpi__hint">' + escapeHtml(hint) + "</p>" : "") +
      "</article>";
  }

  function renderTable() {
    var rows = filtered();
    var hasAny = state.templates.length > 0;
    emptyEl.hidden = hasAny;
    tableBlock.hidden = !hasAny;
    if (!hasAny) {
      tableBody.innerHTML = "";
      return;
    }
    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="8" class="tv-table-empty">No hay plantillas con los filtros aplicados.</td></tr>';
      return;
    }
    tableBody.innerHTML = rows.map(function (t) {
      var seg = calcSegments(t.message);
      return "<tr data-id=\\"" + escapeHtml(t.id) + "\\">" +
        "<td><strong>" + escapeHtml(t.name) + "</strong></td>" +
        "<td>" + categoryTag(t.category) + "</td>" +
        "<td class=\\"tv-templates-preview\\" title=\\"" + escapeHtml(t.message) + "\\">" + escapeHtml(t.message) + "</td>" +
        "<td>" + seg.characters + "</td>" +
        "<td>" + smsLabel(seg.segments) + "</td>" +
        "<td>" + statusBadge(t.status) + "</td>" +
        "<td class=\\"tv-contacts-date\\">" + escapeHtml(fmtDate(t.updatedAt)) + "</td>" +
        '<td class="tv-templates-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-id="' + escapeHtml(t.id) + '">Editar</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-action="dup" data-id="' + escapeHtml(t.id) + '">Duplicar</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-action="del" data-id="' + escapeHtml(t.id) + '">Eliminar</button>' +
        "</td></tr>";
    }).join("");
  }

  function renderAll() {
    renderKpis();
    renderTable();
  }

  function openModal(mode, tpl) {
    document.getElementById("tv-templates-modal-title").textContent =
      mode === "edit" ? "Editar plantilla" : "Nueva plantilla";
    document.getElementById("tv-templates-modal-sub").textContent =
      mode === "edit" ? "Actualiza el mensaje y guarda los cambios." : "Completa los campos para guardar el mensaje.";
    document.getElementById("tv-tpl-id").value = tpl ? tpl.id : "";
    document.getElementById("tv-tpl-name").value = tpl ? tpl.name : "";
    document.getElementById("tv-tpl-category").value = tpl ? tpl.category : "OTP";
    document.getElementById("tv-tpl-status").value = tpl ? tpl.status : "active";
    document.getElementById("tv-tpl-message").value = tpl ? tpl.message : "";
    updateMessageStats();
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    document.getElementById("tv-tpl-name").focus();
  }

  function closeModal() {
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function updateMessageStats() {
    var msg = document.getElementById("tv-tpl-message").value;
    var info = calcSegments(msg);
    document.getElementById("tv-tpl-chars").textContent = String(info.characters);
    document.getElementById("tv-tpl-segments").textContent = String(info.segments || 0);
    document.getElementById("tv-tpl-encoding").textContent = info.encoding;
    var warn = document.getElementById("tv-tpl-segment-warn");
    if (info.segments > 1) {
      warn.hidden = false;
      warn.className = "tv-templates-segment-hint tv-templates-segment-hint--warn";
      warn.textContent = "Este mensaje puede consumir más de 1 SMS por destinatario.";
    } else {
      warn.hidden = true;
      warn.textContent = "";
    }
  }

  function findById(id) {
    return state.templates.find(function (t) { return t.id === id; });
  }

  document.getElementById("tv-tpl-new-btn").addEventListener("click", function () {
    openModal("new", null);
  });
  document.getElementById("tv-tpl-empty-create").addEventListener("click", function () {
    openModal("new", null);
  });
  document.getElementById("tv-tpl-examples-btn").addEventListener("click", function () {
    if (root) root.classList.toggle("tv-templates-page--examples-open");
    var el = document.getElementById("tv-templates-examples");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  modal.querySelectorAll("[data-tv-templates-close]").forEach(function (btn) {
    btn.addEventListener("click", closeModal);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.getAttribute("aria-hidden") === "false") closeModal();
  });

  document.getElementById("tv-tpl-message").addEventListener("input", updateMessageStats);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = document.getElementById("tv-tpl-id").value.trim();
    var name = document.getElementById("tv-tpl-name").value.trim();
    var category = document.getElementById("tv-tpl-category").value;
    var status = document.getElementById("tv-tpl-status").value;
    var message = document.getElementById("tv-tpl-message").value.trim();
    if (!name || !message) return;
    var now = new Date().toISOString();
    if (id) {
      var idx = state.templates.findIndex(function (t) { return t.id === id; });
      if (idx >= 0) {
        state.templates[idx] = { id: id, name: name, category: category, message: message, status: status, updatedAt: now };
      }
    } else {
      state.templates.unshift({
        id: newId(),
        name: name,
        category: category,
        message: message,
        status: status,
        updatedAt: now,
      });
    }
    saveTemplates();
    closeModal();
    renderAll();
  });

  tableBody.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    var action = btn.getAttribute("data-action");
    var tpl = findById(id);
    if (!tpl) return;
    if (action === "edit") {
      openModal("edit", tpl);
    } else if (action === "dup") {
      state.templates.unshift({
        id: newId(),
        name: tpl.name + " (copia)",
        category: tpl.category,
        message: tpl.message,
        status: "draft",
        updatedAt: new Date().toISOString(),
      });
      saveTemplates();
      renderAll();
    } else if (action === "del") {
      if (!confirm("¿Eliminar la plantilla \\"" + tpl.name + "\\"? Esta acción no se puede deshacer.")) return;
      state.templates = state.templates.filter(function (t) { return t.id !== id; });
      saveTemplates();
      renderAll();
    }
  });

  function applyFiltersFromUi() {
    state.filter.q = searchInput.value;
    state.filter.category = catFilter.value;
    state.filter.status = statusFilter.value;
    renderTable();
  }

  searchInput.addEventListener("input", applyFiltersFromUi);
  catFilter.addEventListener("change", applyFiltersFromUi);
  statusFilter.addEventListener("change", applyFiltersFromUi);

  var catOpts = ['<option value="">Todas las categorías</option>']
    .concat(CATEGORIES.map(function (c) {
      return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + "</option>";
    }))
    .join("");
  catFilter.innerHTML = catOpts;

  state.templates = loadTemplates();
  renderAll();
})();
</script>`;
}

/** KPIs iniciales en servidor (antes de hidratar con localStorage). */
function renderInitialKpis(): string {
  const cats = new Set(DEFAULT_CLIENT_SMS_TEMPLATES.map((t) => t.category));
  const active = DEFAULT_CLIENT_SMS_TEMPLATES.filter((t) => t.status === "active").length;
  const last = DEFAULT_CLIENT_SMS_TEMPLATES.reduce(
    (a, t) => (t.updatedAt > a ? t.updatedAt : a),
    "",
  );

  return `<div class="tv-kpi-grid tv-kpi-grid--client tv-kpi-grid--report" id="tv-templates-kpis">
    ${renderKpiCard({
      label: "Total plantillas",
      value: String(DEFAULT_CLIENT_SMS_TEMPLATES.length),
      hint: "En tu biblioteca",
      icon: "description",
      variant: "primary",
    })}
    ${renderKpiCard({
      label: "Plantillas activas",
      value: String(active),
      hint: "Listas para usar",
      icon: "check_circle",
      variant: "success",
    })}
    ${renderKpiCard({
      label: "Categorías usadas",
      value: String(cats.size),
      hint: `De ${SMS_TEMPLATE_CATEGORIES.length} disponibles`,
      icon: "category",
      variant: "default",
    })}
    ${renderKpiCard({
      label: "Última actualización",
      value: last ? formatDateShort(last) : "—",
      hint: "Cambio más reciente",
      icon: "update",
      variant: "default",
    })}
  </div>`;
}

function renderInitialTableRows(): string {
  return DEFAULT_CLIENT_SMS_TEMPLATES.map((t) => {
    const seg = calculateSmsSegments(t.message);
    const statusHtml =
      t.status === "active"
        ? `<span class="badge badge-ok">Activa</span>`
        : `<span class="badge badge-warn">Borrador</span>`;
    const smsLabel =
      seg.segments === 1 ? "1 SMS" : `${seg.segments} SMS`;
    return `<tr data-id="${escapeHtml(t.id)}">
      <td><strong>${escapeHtml(t.name)}</strong></td>
      <td><span class="tv-tag">${escapeHtml(t.category)}</span></td>
      <td class="tv-templates-preview" title="${escapeHtml(t.message)}">${escapeHtml(t.message)}</td>
      <td>${seg.characters}</td>
      <td>${escapeHtml(smsLabel)}</td>
      <td>${statusHtml}</td>
      <td class="tv-contacts-date">${escapeHtml(formatDateShort(t.updatedAt))}</td>
      <td class="tv-templates-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-id="${escapeHtml(t.id)}">Editar</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="dup" data-id="${escapeHtml(t.id)}">Duplicar</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="del" data-id="${escapeHtml(t.id)}">Eliminar</button>
      </td>
    </tr>`;
  }).join("");
}

export function renderAppTemplatesPage(ctx: AppPageContext): string {
  const categoryFilterOpts = [
    `<option value="">Todas las categorías</option>`,
    ...SMS_TEMPLATE_CATEGORIES.map(
      (c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`,
    ),
  ].join("");

  const body = `
    ${templatesPageStyles()}
    <div class="tv-templates-page">
    ${renderPageHeader({
      title: "Plantillas SMS",
      subtitle:
        "Crea y organiza mensajes reutilizables para campañas, validaciones, recordatorios y comunicaciones transaccionales.",
      actions: `
        <button type="button" class="btn btn-primary" id="tv-tpl-new-btn">
          <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">add</span>
          Nueva plantilla
        </button>
        <button type="button" class="btn btn-secondary" id="tv-tpl-examples-btn">
          <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">lightbulb</span>
          Ver ejemplos
        </button>
      `,
    })}
    ${renderInitialKpis()}
    ${renderExamplesSection()}
    <section class="tv-panel tv-dlr-report__filters-panel">
      <header class="tv-section-head tv-dlr-report__filters-head">
        <h2 class="tv-section-head__title">Buscar y filtrar</h2>
      </header>
      <div class="tv-panel__body tv-dlr-report__filters-body">
        <div class="tv-dlr-report__filters-grid tv-contacts__filters-grid">
          ${renderFilterField(
            "Buscar",
            `<input type="search" id="tv-tpl-search" class="tv-filter-input" placeholder="Buscar plantilla..." autocomplete="off" />`,
          )}
          ${renderFilterField(
            "Categoría",
            `<select id="tv-tpl-filter-category" class="tv-filter-input">${categoryFilterOpts}</select>`,
          )}
          ${renderFilterField(
            "Estado",
            `<select id="tv-tpl-filter-status" class="tv-filter-input">
              <option value="">Todos</option>
              <option value="active">Activa</option>
              <option value="draft">Borrador</option>
            </select>`,
          )}
        </div>
      </div>
    </section>
    <div id="tv-templates-empty" class="tv-panel tv-templates-empty" hidden>
      <span class="material-symbols-outlined" aria-hidden="true">description</span>
      <h2 style="margin:1rem 0 0.5rem;font-size:1.15rem">Aún no tienes plantillas creadas</h2>
      <p class="tv-page-sub" style="max-width:420px;margin:0 auto 1.25rem">
        Crea tu primera plantilla SMS para ahorrar tiempo y mantener una comunicación consistente con tus clientes.
      </p>
      <button type="button" class="btn btn-primary" id="tv-tpl-empty-create">Crear plantilla</button>
    </div>
    <div class="tv-dash-block tv-dlr-report__table-block" id="tv-templates-table-block">
      <div class="tv-dash-block__head">
        <h2 class="tv-section-head__title">Tus plantillas</h2>
        <p class="tv-section-head__sub">Los cambios se guardan en este navegador hasta conectar Supabase.</p>
      </div>
      <div class="tv-templates-table-wrap">
        <table class="tv-table tv-table--dense tv-templates-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Vista previa</th>
              <th>Caracteres</th>
              <th>SMS est.</th>
              <th>Estado</th>
              <th>Actualización</th>
              <th style="text-align:right">Acciones</th>
            </tr>
          </thead>
          <tbody id="tv-templates-tbody">${renderInitialTableRows()}</tbody>
        </table>
      </div>
    </div>
    </div>
    ${renderModalShell()}
    ${renderTemplatesScript(ctx.company.id || "default")}`;

  return wrapAppPage(ctx, "templates", "Plantillas SMS", body);
}
