import type { SmsOrderWithDetails } from "../../types/wallet.js";
import type {
  AppSupportPageData,
  SupportTicket,
} from "../../types/support-tickets.js";
import { SUPPORT_CATEGORIES } from "../../types/support-tickets.js";
import { escapeHtml } from "../../utils/html.js";
import { renderKpiCard } from "../admin-ui/components.js";
import { renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";
import { renderOrderShortIdCell } from "./app-order-ui.js";

export type {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketReply,
  SupportTicketStatus,
} from "../../types/support-tickets.js";
export { SUPPORT_CATEGORIES } from "../../types/support-tickets.js";

const T0 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
const T1 = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
const T2 = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

export const DEFAULT_SUPPORT_TICKETS: SupportTicket[] = [
  {
    id: "tkt_1001",
    code: "TLV-1001",
    subject: "Consulta por saldo SMS disponible",
    category: "Saldo SMS",
    priority: "medium",
    status: "in_review",
    message:
      "Hola, necesito confirmar si mi saldo SMS ya fue actualizado después de la última compra.",
    createdAt: T0,
    updatedAt: T1,
    replies: [
      {
        id: "rep_1",
        author: "support",
        message:
          "Estamos revisando tu acreditación. Te confirmaremos en breve por este mismo ticket.",
        createdAt: T1,
      },
    ],
  },
  {
    id: "tkt_1002",
    code: "TLV-1002",
    subject: "Configuración de webhook DLR",
    category: "API / Webhook",
    priority: "high",
    status: "open",
    message:
      "Necesito ayuda para revisar la URL del webhook de reportes de entrega.",
    createdAt: T1,
    updatedAt: T1,
    replies: [],
  },
  {
    id: "tkt_1003",
    code: "TLV-1003",
    subject: "Consulta por alto volumen SMS",
    category: "SMPP / Alto volumen",
    priority: "medium",
    status: "resolved",
    message:
      "Quiero evaluar una integración SMPP para mayor volumen de envíos.",
    createdAt: T2,
    updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    replies: [
      {
        id: "rep_2",
        author: "support",
        message:
          "Te contactaremos para una evaluación comercial y técnica de alto volumen.",
        createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
];

function supportPageStyles(): string {
  return `<style>
    .tv-support-page .tv-support-layout {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .tv-support-page .tv-support-main {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      min-width: 0;
    }
    .tv-support-ticket-cards { display: none; flex-direction: column; gap: 0.75rem; }
    .tv-support-ticket-card {
      border: 1px solid var(--tv-border);
      border-radius: var(--tv-radius);
      padding: 1rem;
      background: var(--tv-surface);
    }
    .tv-support-ticket-card__head {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 0.5rem;
    }
    .tv-support-ticket-card__meta {
      font-size: 0.78rem;
      color: var(--tv-muted);
      margin: 0.35rem 0;
    }
    .tv-support-table-wrap { overflow-x: auto; }
    .tv-support-help-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 0.75rem;
    }
    .tv-support-help-card {
      padding: 1rem;
      border: 1px solid var(--tv-border);
      border-radius: var(--tv-radius);
      background: var(--tv-surface);
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      height: 100%;
    }
    .tv-support-help-card p {
      margin: 0;
      font-size: 0.85rem;
      color: var(--tv-muted);
      line-height: 1.45;
      flex: 1;
    }
    .tv-support-empty {
      text-align: center;
      padding: 2.5rem 1.5rem;
    }
    .tv-support-empty .material-symbols-outlined {
      font-size: 2.5rem;
      color: var(--tv-primary);
      opacity: 0.75;
    }
    .tv-support-attach-zone {
      border: 1px dashed var(--tv-border);
      border-radius: var(--tv-radius);
      padding: 1rem;
      text-align: center;
      color: var(--tv-muted);
      font-size: 0.85rem;
      background: var(--tv-bg);
    }
    .tv-support-reply {
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--tv-border);
    }
    .tv-support-reply:last-child { border-bottom: none; }
    .tv-support-reply__meta {
      font-size: 0.75rem;
      color: var(--tv-muted);
      margin-bottom: 0.35rem;
    }
    .tv-support-drawer {
      position: fixed;
      inset: 0;
      z-index: 250;
      display: none;
      justify-content: flex-end;
    }
    .tv-support-drawer[aria-hidden="false"] { display: flex; }
    .tv-support-drawer__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
    }
    .tv-support-drawer__panel {
      position: relative;
      width: min(480px, 100%);
      max-height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: var(--tv-surface);
      box-shadow: var(--tv-shadow-lg);
    }
    .tv-support-drawer__head {
      padding: 1.25rem;
      border-bottom: 1px solid var(--tv-border);
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
    }
    .tv-support-drawer__body {
      padding: 1rem 1.25rem;
      overflow-y: auto;
      flex: 1;
    }
    .tv-support-drawer__foot {
      padding: 1rem 1.25rem;
      border-top: 1px solid var(--tv-border);
    }
    .tv-support-modal {
      position: fixed;
      inset: 0;
      z-index: 260;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .tv-support-modal[aria-hidden="false"] { display: flex; }
    .tv-support-modal__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
    }
    .tv-support-modal__panel {
      position: relative;
      width: min(520px, 100%);
      max-height: 92vh;
      overflow-y: auto;
      background: var(--tv-surface);
      border-radius: var(--tv-radius);
      box-shadow: var(--tv-shadow-lg);
      padding: 1.25rem;
    }
    .tv-support-toast {
      position: fixed;
      bottom: 1.25rem;
      right: 1.25rem;
      left: 1.25rem;
      max-width: 380px;
      margin-left: auto;
      padding: 0.85rem 1rem;
      background: #0f172a;
      color: #f8fafc;
      border-radius: var(--tv-radius);
      box-shadow: var(--tv-shadow-lg);
      font-size: 0.88rem;
      z-index: 300;
      display: none;
    }
    .tv-support-toast[aria-hidden="false"] { display: block; }
    @media (max-width: 768px) {
      .tv-support-table-wrap { display: none; }
      .tv-support-ticket-cards { display: flex; }
    }
  </style>`;
}

function renderRelatedOrderCard(relatedOrder: SmsOrderWithDetails): string {
  return `<section class="tv-panel tv-panel--hint" style="margin-bottom:1rem" id="tv-support-related-order">
    <div class="tv-panel__body">
      <p style="margin:0"><strong>Consulta relacionada a la orden:</strong>
        <code>${escapeHtml(relatedOrder.payment_reference ?? "—")}</code>
        · ${renderOrderShortIdCell(relatedOrder.id)}
        · <a href="/app/orders/${escapeHtml(relatedOrder.id)}">Ver detalle</a>
      </p>
      <p class="field-hint" style="margin:0.5rem 0 0">Puedes crear un ticket y mencionar esta referencia en el mensaje.</p>
    </div>
  </section>`;
}

function renderQuickHelpSection(): string {
  const items = [
    {
      id: "purchase",
      title: "¿Mi compra ya fue acreditada?",
      text: "Revisa el estado de tu orden y los mensajes SMS disponibles en Mi saldo.",
      link: "/app/wallet",
      linkLabel: "Ir a Mi saldo",
    },
    {
      id: "deliverability",
      title: "Problemas de entregabilidad",
      text: "Podemos revisar ruta, operador, formato de número, contenido y estado DLR.",
      link: "/app/reports",
      linkLabel: "Ver reportes",
    },
    {
      id: "api",
      title: "Integración API",
      text: "Consulta endpoints, API Key, ejemplos de envío y webhooks desde la sección API.",
      link: "/app/api",
      linkLabel: "Ir a API",
    },
    {
      id: "smpp",
      title: "Alto volumen / SMPP",
      text: "Solicita evaluación técnica y comercial para tráfico de alto volumen.",
      link: "/app/api",
      linkLabel: "Ver SMPP",
    },
  ];

  const cards = items
    .map(
      (i) => `<article class="tv-support-help-card">
      <strong>${escapeHtml(i.title)}</strong>
      <p>${escapeHtml(i.text)}</p>
      <button type="button" class="btn btn-secondary btn-sm" data-help-id="${escapeHtml(i.id)}">Ver ayuda</button>
    </article>`,
    )
    .join("");

  return `<section class="tv-panel">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Ayuda rápida</h2>
      <p class="tv-section-head__sub">Respuestas orientativas para los temas más frecuentes</p>
    </header>
    <div class="tv-panel__body">
      <div class="tv-support-help-grid">${cards}</div>
    </div>
  </section>`;
}

function renderNewTicketModal(
  suggestedSubject?: string,
  relatedOrderId?: string | null,
): string {
  const catOpts = SUPPORT_CATEGORIES.map(
    (c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`,
  ).join("");
  const subjectValue = suggestedSubject ? escapeHtml(suggestedSubject) : "";
  const orderHidden = relatedOrderId
    ? `<input type="hidden" id="tv-support-related-order-id" value="${escapeHtml(relatedOrderId)}" />`
    : "";

  return `<div class="tv-support-modal" id="tv-support-new-modal" role="dialog" aria-modal="true" aria-labelledby="tv-support-new-title" aria-hidden="true">
    <div class="tv-support-modal__backdrop" data-tv-support-close tabindex="-1"></div>
    <div class="tv-support-modal__panel">
      <h2 class="tv-section-head__title" id="tv-support-new-title" style="margin:0 0 0.25rem">Crear solicitud</h2>
      <p class="tv-page-sub" style="margin:0 0 1rem">Describe tu consulta y el equipo Telvoice te responderá por este ticket.</p>
      <form id="tv-support-new-form">
        ${orderHidden}
        <div class="form-group">
          <label for="tv-support-subject">Asunto</label>
          <input type="text" id="tv-support-subject" class="tv-input-full" required maxlength="160"
            placeholder="Ej: Problema con saldo SMS después de una compra" value="${subjectValue}" />
        </div>
        <div class="form-group">
          <label for="tv-support-category">Categoría</label>
          <select id="tv-support-category" class="tv-input-full" required>${catOpts}</select>
        </div>
        <div class="form-group">
          <label for="tv-support-priority">Prioridad</label>
          <select id="tv-support-priority" class="tv-input-full" required>
            <option value="low">Baja</option>
            <option value="medium" selected>Media</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>
        <div class="form-group">
          <label for="tv-support-message">Mensaje</label>
          <textarea id="tv-support-message" class="tv-input-full" rows="4" required maxlength="4000"
            placeholder="Describe brevemente qué ocurrió, cuándo ocurrió y qué necesitas revisar."></textarea>
        </div>
        <div class="form-group">
          <label>Adjuntar captura</label>
          <div class="tv-support-attach-zone">
            <span class="material-symbols-outlined" aria-hidden="true">attach_file</span>
            <p style="margin:0.35rem 0 0">Arrastra una imagen o selecciona un archivo (solo vista previa local).</p>
            <input type="file" accept="image/*,.pdf" style="margin-top:0.5rem;font-size:0.8rem" disabled title="Próximamente" />
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;flex-wrap:wrap;margin-top:1rem">
          <button type="button" class="btn btn-ghost" data-tv-support-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">Crear ticket</button>
        </div>
      </form>
    </div>
  </div>`;
}

function renderDetailDrawer(): string {
  return `<div class="tv-support-drawer" id="tv-support-detail-drawer" role="dialog" aria-modal="true" aria-hidden="true">
    <div class="tv-support-drawer__backdrop" data-tv-support-close tabindex="-1"></div>
    <div class="tv-support-drawer__panel">
      <header class="tv-support-drawer__head">
        <div>
          <p class="field-hint" style="margin:0" id="tv-support-detail-code">—</p>
          <h2 class="tv-section-head__title" id="tv-support-detail-subject" style="margin:0.25rem 0 0">—</h2>
          <div style="display:flex;flex-wrap:wrap;gap:0.35rem;margin-top:0.5rem" id="tv-support-detail-badges"></div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-tv-support-close aria-label="Cerrar">✕</button>
      </header>
      <div class="tv-support-drawer__body">
        <p class="field-hint" style="margin:0 0 0.75rem" id="tv-support-detail-dates">—</p>
        <h3 class="tv-section-head__title" style="font-size:0.95rem;margin:0 0 0.35rem">Mensaje original</h3>
        <p id="tv-support-detail-message" style="margin:0 0 1rem;line-height:1.5;white-space:pre-wrap">—</p>
        <h3 class="tv-section-head__title" style="font-size:0.95rem;margin:0 0 0.5rem">Historial</h3>
        <div id="tv-support-detail-replies"></div>
        <div class="form-group" style="margin-top:1.25rem">
          <label for="tv-support-reply-input">Responder al ticket</label>
          <textarea id="tv-support-reply-input" class="tv-input-full" rows="3" placeholder="Escribe tu respuesta…"></textarea>
        </div>
      </div>
      <footer class="tv-support-drawer__foot" style="display:flex;gap:0.5rem;flex-wrap:wrap">
        <button type="button" class="btn btn-primary btn-sm" id="tv-support-send-reply">Enviar respuesta</button>
        <button type="button" class="btn btn-secondary btn-sm" id="tv-support-resolve-btn">Marcar como resuelto</button>
      </footer>
    </div>
  </div>`;
}

function renderHelpInfoModal(): string {
  return `<div class="tv-support-modal" id="tv-support-help-modal" role="dialog" aria-modal="true" aria-hidden="true">
    <div class="tv-support-modal__backdrop" data-tv-support-close tabindex="-1"></div>
    <div class="tv-support-modal__panel">
      <h2 class="tv-section-head__title" id="tv-support-help-title" style="margin:0 0 0.5rem">Ayuda</h2>
      <p class="tv-page-sub" id="tv-support-help-body" style="margin:0 0 1rem">—</p>
      <a href="#" class="btn btn-secondary btn-sm" id="tv-support-help-link" style="margin-right:0.5rem">Ir a la sección</a>
      <button type="button" class="btn btn-ghost btn-sm" data-tv-support-close>Cerrar</button>
    </div>
  </div>`;
}

function renderInitialKpis(seedTickets: SupportTicket[]): string {
  const open = seedTickets.filter((t) => t.status !== "resolved").length;
  const resolved = seedTickets.filter((t) => t.status === "resolved").length;
  const last = seedTickets.reduce(
    (a, t) => (t.updatedAt > a.updatedAt ? t : a),
    seedTickets[0] ?? DEFAULT_SUPPORT_TICKETS[0]!,
  );

  return `<div class="tv-kpi-grid tv-kpi-grid--client tv-kpi-grid--report" id="tv-support-kpis">
    ${renderKpiCard({
      label: "Tickets abiertos",
      value: String(open),
      hint: "Incluye en revisión y espera",
      icon: "confirmation_number",
      variant: "warn",
    })}
    ${renderKpiCard({
      label: "Tickets resueltos",
      value: String(resolved),
      hint: "Histórico cerrado",
      icon: "task_alt",
      variant: "success",
    })}
    ${renderKpiCard({
      label: "Tiempo estimado",
      value: "1-4 h",
      hint: "Horas hábiles Chile",
      icon: "schedule",
      variant: "default",
    })}
    ${renderKpiCard({
      label: "Último ticket",
      value: last.category,
      hint: last.code,
      icon: "forum",
      variant: "primary",
    })}
  </div>`;
}

function renderSupportScript(
  companyId: string,
  pageData: AppSupportPageData,
): string {
  const initialJson = JSON.stringify(DEFAULT_SUPPORT_TICKETS).replace(/</g, "\\u003c");
  const serverJson = JSON.stringify(pageData.tickets).replace(/</g, "\\u003c");
  const helpData = JSON.stringify({
    purchase: {
      title: "¿Mi compra ya fue acreditada?",
      body: "Revisa Mis órdenes para ver el estado del pago. Si está acreditada, el saldo SMS aparecerá en Mi saldo en unos minutos.",
      href: "/app/wallet",
    },
    deliverability: {
      title: "Problemas de entregabilidad",
      body: "En Reportes puedes ver DLR y estados de entrega. Incluye ejemplos de número y hora en tu ticket.",
      href: "/app/reports",
    },
    api: {
      title: "Integración API",
      body: "En la sección API encontrarás credenciales mock, endpoints y configuración de webhook DLR.",
      href: "/app/api",
    },
    smpp: {
      title: "Alto volumen / SMPP",
      body: "Desde API puedes solicitar evaluación SMPP. También puedes abrir un ticket en categoría SMPP / Alto volumen.",
      href: "/app/api",
    },
  }).replace(/</g, "\\u003c");

  const dbAvailable = pageData.module.available && companyId !== "default";
  const listSubtitle = dbAvailable
    ? "Tickets sincronizados con tu empresa."
    : "Los tickets se guardan en este navegador hasta conectar el backend.";

  return `<script>
(function () {
  var STORAGE_KEY = "telvoice_client_support_tickets_${escapeHtml(companyId)}";
  var INITIAL = ${initialJson};
  var SERVER_TICKETS = ${serverJson};
  var DB_AVAILABLE = ${dbAvailable ? "true" : "false"};
  var HELP = ${helpData};
  var LIST_SUBTITLE = ${JSON.stringify(listSubtitle)};

  var STATUS_LABELS = { open: "Abierto", in_review: "En revisión", waiting: "Esperando respuesta", resolved: "Resuelto" };
  var PRIORITY_LABELS = { low: "Baja", medium: "Media", high: "Alta", urgent: "Urgente" };

  var tickets = [];
  var activeTicketId = null;
  var toast = document.getElementById("tv-support-toast");
  var kpiRoot = document.getElementById("tv-support-kpis");
  var tbody = document.getElementById("tv-support-tbody");
  var cardsRoot = document.getElementById("tv-support-cards");
  var emptyEl = document.getElementById("tv-support-empty");
  var listBlock = document.getElementById("tv-support-list-block");
  var listSubEl = document.getElementById("tv-support-list-sub");

  if (listSubEl) listSubEl.textContent = LIST_SUBTITLE;

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.setAttribute("aria-hidden", "false");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.setAttribute("aria-hidden", "true"); }, 4200);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtDate(iso) {
    try {
      return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
    } catch (e) { return iso; }
  }

  function statusBadge(s) {
    var cls = { open: "badge-warn", in_review: "badge-muted", waiting: "badge-warn", resolved: "badge-ok" }[s] || "badge-muted";
    return '<span class="badge ' + cls + '">' + escapeHtml(STATUS_LABELS[s] || s) + "</span>";
  }

  function priorityBadge(p) {
    var cls = { low: "badge-muted", medium: "badge-muted", high: "badge-warn", urgent: "badge-err" }[p] || "badge-muted";
    return '<span class="badge ' + cls + '">' + escapeHtml(PRIORITY_LABELS[p] || p) + "</span>";
  }

  function loadLocalTickets() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (Array.isArray(p) && p.length) return p;
      }
    } catch (e) {}
    return null;
  }

  function loadTickets() {
    if (DB_AVAILABLE && SERVER_TICKETS.length) {
      return SERVER_TICKETS.slice();
    }
    var local = loadLocalTickets();
    if (local) return local;
    if (DB_AVAILABLE) return [];
    return INITIAL.slice();
  }

  function saveTicketsLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets)); } catch (e) {}
  }

  function isRemoteTicket(t) {
    return DB_AVAILABLE && t && t.id && String(t.id).indexOf("tkt_") !== 0;
  }

  function createLocalTicket(payload) {
    var now = new Date().toISOString();
    var ticket = {
      id: "tkt_" + Date.now().toString(36),
      code: nextCode(),
      subject: payload.subject,
      category: payload.category,
      priority: payload.priority,
      status: "open",
      message: payload.message,
      createdAt: now,
      updatedAt: now,
      replies: [],
    };
    tickets.unshift(ticket);
    saveTicketsLocal();
    return ticket;
  }

  function postJson(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().then(function (j) {
        return { ok: r.ok, body: j };
      });
    });
  }

  function replaceTicket(updated) {
    var idx = tickets.findIndex(function (t) { return t.id === updated.id; });
    if (idx >= 0) tickets[idx] = updated;
    else tickets.unshift(updated);
  }

  function nextCode() {
    var max = 1000;
    tickets.forEach(function (t) {
      var m = /^TLV-(\\d+)$/.exec(t.code || "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return "TLV-" + String(max + 1);
  }

  function summary() {
    var open = tickets.filter(function (t) { return t.status !== "resolved"; }).length;
    var resolved = tickets.filter(function (t) { return t.status === "resolved"; }).length;
    var last = tickets[0];
    tickets.forEach(function (t) {
      if (!last || t.updatedAt > last.updatedAt) last = t;
    });
    return { open: open, resolved: resolved, last: last };
  }

  function kpiCard(label, value, hint, icon, variant) {
    return '<article class="tv-kpi tv-kpi--' + variant + '">' +
      '<div class="tv-kpi__head"><span class="material-symbols-outlined tv-kpi__icon">' + icon + "</span>" +
      '<span class="tv-kpi__label">' + escapeHtml(label) + "</span></div>" +
      '<div class="tv-kpi__value">' + escapeHtml(value) + "</div>" +
      (hint ? '<p class="tv-kpi__hint">' + escapeHtml(hint) + "</p>" : "") +
      "</article>";
  }

  function renderKpis() {
    var s = summary();
    var lastVal = s.last ? s.last.category : "—";
    var lastHint = s.last ? s.last.code : "Sin tickets";
    kpiRoot.innerHTML =
      kpiCard("Tickets abiertos", String(s.open), "Incluye en revisión y espera", "confirmation_number", "warn") +
      kpiCard("Tickets resueltos", String(s.resolved), "Histórico cerrado", "task_alt", "success") +
      kpiCard("Tiempo estimado", "1-4 h", "Horas hábiles Chile", "schedule", "default") +
      kpiCard("Último ticket", lastVal, lastHint, "forum", "primary");
  }

  function sortedTickets() {
    return tickets.slice().sort(function (a, b) {
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }

  function renderList() {
    var rows = sortedTickets();
    var has = rows.length > 0;
    if (emptyEl) emptyEl.hidden = has;
    if (listBlock) listBlock.hidden = !has;
    if (!has) {
      if (tbody) tbody.innerHTML = "";
      if (cardsRoot) cardsRoot.innerHTML = "";
      return;
    }

    if (tbody) {
      tbody.innerHTML = rows.map(function (t) {
        return "<tr>" +
          "<td><code>" + escapeHtml(t.code) + "</code></td>" +
          "<td><strong>" + escapeHtml(t.subject) + "</strong></td>" +
          "<td>" + escapeHtml(t.category) + "</td>" +
          "<td>" + priorityBadge(t.priority) + "</td>" +
          "<td>" + statusBadge(t.status) + "</td>" +
          "<td class=\\"tv-contacts-date\\">" + escapeHtml(fmtDate(t.createdAt)) + "</td>" +
          "<td class=\\"tv-contacts-date\\">" + escapeHtml(fmtDate(t.updatedAt)) + "</td>" +
          '<td><button type="button" class="btn btn-ghost btn-sm" data-view-id="' + escapeHtml(t.id) + '">Ver detalle</button></td>' +
          "</tr>";
      }).join("");
    }

    if (cardsRoot) {
      cardsRoot.innerHTML = rows.map(function (t) {
        return '<article class="tv-support-ticket-card">' +
          '<div class="tv-support-ticket-card__head"><code>' + escapeHtml(t.code) + "</code>" + statusBadge(t.status) + "</div>" +
          "<strong>" + escapeHtml(t.subject) + "</strong>" +
          '<p class="tv-support-ticket-card__meta">' + escapeHtml(t.category) + " · " + PRIORITY_LABELS[t.priority] + "</p>" +
          '<p class="tv-support-ticket-card__meta">Actualizado: ' + escapeHtml(fmtDate(t.updatedAt)) + "</p>" +
          '<button type="button" class="btn btn-secondary btn-sm" data-view-id="' + escapeHtml(t.id) + '">Ver detalle</button>' +
          "</article>";
      }).join("");
    }
  }

  function renderAll() {
    renderKpis();
    renderList();
  }

  function openModal(id) {
    var el = document.getElementById(id);
    if (el) {
      el.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }
  }

  function closeModals() {
    document.querySelectorAll(".tv-support-modal, .tv-support-drawer").forEach(function (el) {
      el.setAttribute("aria-hidden", "true");
    });
    document.body.style.overflow = "";
    activeTicketId = null;
  }

  function findTicket(id) {
    return tickets.find(function (t) { return t.id === id; });
  }

  function openDetail(id) {
    var t = findTicket(id);
    if (!t) return;
    activeTicketId = id;
    document.getElementById("tv-support-detail-code").textContent = t.code;
    document.getElementById("tv-support-detail-subject").textContent = t.subject;
    document.getElementById("tv-support-detail-badges").innerHTML =
      statusBadge(t.status) + priorityBadge(t.priority) +
      '<span class="tv-tag tv-tag--muted">' + escapeHtml(t.category) + "</span>";
    document.getElementById("tv-support-detail-dates").textContent =
      "Creado: " + fmtDate(t.createdAt) + " · Actualizado: " + fmtDate(t.updatedAt);
    document.getElementById("tv-support-detail-message").textContent = t.message;
    var repliesEl = document.getElementById("tv-support-detail-replies");
    var replies = (t.replies || []).filter(function (r) { return !r.internal; });
    repliesEl.innerHTML = replies.length
      ? replies.map(function (r) {
          var who = r.author === "support" ? "Telvoice" : "Tú";
          return '<div class="tv-support-reply"><p class="tv-support-reply__meta"><strong>' + escapeHtml(who) +
            "</strong> · " + escapeHtml(fmtDate(r.createdAt)) + "</p><p style=\\"margin:0\\">" + escapeHtml(r.message) + "</p></div>";
        }).join("")
      : '<p class="field-hint" style="margin:0">Sin respuestas adicionales aún.</p>';
    document.getElementById("tv-support-reply-input").value = "";
    var resolveBtn = document.getElementById("tv-support-resolve-btn");
    if (resolveBtn) resolveBtn.disabled = t.status === "resolved";
    openModal("tv-support-detail-drawer");
  }

  document.getElementById("tv-support-new-btn")?.addEventListener("click", function () {
    openModal("tv-support-new-modal");
  });
  document.getElementById("tv-support-empty-create")?.addEventListener("click", function () {
    openModal("tv-support-new-modal");
  });

  document.querySelectorAll("[data-tv-support-close]").forEach(function (el) {
    el.addEventListener("click", closeModals);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModals();
  });

  document.getElementById("tv-support-new-form")?.addEventListener("submit", function (e) {
    e.preventDefault();
    var subject = document.getElementById("tv-support-subject").value.trim();
    var category = document.getElementById("tv-support-category").value;
    var priority = document.getElementById("tv-support-priority").value;
    var message = document.getElementById("tv-support-message").value.trim();
    var orderEl = document.getElementById("tv-support-related-order-id");
    var relatedOrderId = orderEl ? orderEl.value.trim() : "";
    if (!subject || !message) return;

    var payload = {
      subject: subject,
      category: category,
      priority: priority,
      message: message,
      relatedOrderId: relatedOrderId || null,
    };

    if (DB_AVAILABLE) {
      postJson("/app/support/tickets", payload).then(function (res) {
        if (res.ok && res.body && res.body.ok && res.body.ticket) {
          tickets.unshift(res.body.ticket);
          closeModals();
          e.target.reset();
          renderAll();
          showToast("Ticket creado correctamente. El equipo Telvoice revisará tu solicitud.");
          return;
        }
        createLocalTicket(payload);
        closeModals();
        e.target.reset();
        renderAll();
        showToast("Ticket guardado localmente. Se sincronizará cuando la conexión esté disponible.");
      }).catch(function () {
        createLocalTicket(payload);
        closeModals();
        e.target.reset();
        renderAll();
        showToast("Ticket guardado localmente. Se sincronizará cuando la conexión esté disponible.");
      });
      return;
    }

    createLocalTicket(payload);
    closeModals();
    e.target.reset();
    renderAll();
    showToast("Ticket creado correctamente. El equipo Telvoice revisará tu solicitud.");
  });

  function bindViewButtons(root) {
    if (!root) return;
    root.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-view-id]");
      if (btn) openDetail(btn.getAttribute("data-view-id"));
    });
  }
  bindViewButtons(tbody);
  bindViewButtons(cardsRoot);

  document.getElementById("tv-support-send-reply")?.addEventListener("click", function () {
    if (!activeTicketId) return;
    var t = findTicket(activeTicketId);
    var text = document.getElementById("tv-support-reply-input").value.trim();
    if (!t || !text) return;

    if (isRemoteTicket(t)) {
      postJson("/app/support/tickets/" + encodeURIComponent(t.id) + "/reply", { message: text })
        .then(function (res) {
          if (res.ok && res.body && res.body.ok && res.body.ticket) {
            replaceTicket(res.body.ticket);
            openDetail(activeTicketId);
            renderAll();
            showToast("Respuesta enviada.");
            return;
          }
          t.replies = t.replies || [];
          t.replies.push({
            id: "rep_" + Date.now(),
            author: "client",
            message: text,
            createdAt: new Date().toISOString(),
          });
          t.status = "waiting";
          t.updatedAt = new Date().toISOString();
          saveTicketsLocal();
          openDetail(activeTicketId);
          renderAll();
          showToast("Respuesta guardada localmente.");
        })
        .catch(function () {
          t.replies = t.replies || [];
          t.replies.push({
            id: "rep_" + Date.now(),
            author: "client",
            message: text,
            createdAt: new Date().toISOString(),
          });
          t.status = "waiting";
          t.updatedAt = new Date().toISOString();
          saveTicketsLocal();
          openDetail(activeTicketId);
          renderAll();
          showToast("Respuesta guardada localmente.");
        });
      return;
    }

    t.replies = t.replies || [];
    t.replies.push({
      id: "rep_" + Date.now(),
      author: "client",
      message: text,
      createdAt: new Date().toISOString(),
    });
    t.status = "waiting";
    t.updatedAt = new Date().toISOString();
    saveTicketsLocal();
    openDetail(activeTicketId);
    renderAll();
    showToast("Respuesta enviada.");
  });

  document.getElementById("tv-support-resolve-btn")?.addEventListener("click", function () {
    if (!activeTicketId) return;
    var t = findTicket(activeTicketId);
    if (!t) return;

    if (isRemoteTicket(t)) {
      postJson("/app/support/tickets/" + encodeURIComponent(t.id) + "/resolve", {})
        .then(function (res) {
          if (res.ok && res.body && res.body.ok && res.body.ticket) {
            replaceTicket(res.body.ticket);
            closeModals();
            renderAll();
            showToast("Ticket marcado como resuelto.");
            return;
          }
          t.status = "resolved";
          t.updatedAt = new Date().toISOString();
          saveTicketsLocal();
          closeModals();
          renderAll();
          showToast("Estado guardado localmente.");
        })
        .catch(function () {
          t.status = "resolved";
          t.updatedAt = new Date().toISOString();
          saveTicketsLocal();
          closeModals();
          renderAll();
          showToast("Estado guardado localmente.");
        });
      return;
    }

    t.status = "resolved";
    t.updatedAt = new Date().toISOString();
    saveTicketsLocal();
    closeModals();
    renderAll();
    showToast("Ticket marcado como resuelto.");
  });

  document.querySelectorAll("[data-help-id]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-help-id");
      var h = HELP[id];
      if (!h) return;
      document.getElementById("tv-support-help-title").textContent = h.title;
      document.getElementById("tv-support-help-body").textContent = h.body;
      var link = document.getElementById("tv-support-help-link");
      link.href = h.href;
      link.textContent = "Ir a la sección";
      openModal("tv-support-help-modal");
    });
  });

  tickets = loadTickets();
  if (DB_AVAILABLE && !SERVER_TICKETS.length && loadLocalTickets()) {
    if (listSubEl) {
      listSubEl.textContent = "Mostrando tickets guardados en este navegador. Los nuevos se sincronizarán con Supabase.";
    }
  }
  renderAll();
})();
</script>`;
}

export function renderAppSupportPage(
  ctx: AppPageContext,
  relatedOrder?: SmsOrderWithDetails | null,
  pageData?: AppSupportPageData,
): string {
  const data: AppSupportPageData = pageData ?? {
    module: { available: false, migrationPending: true },
    tickets: [],
    relatedOrderId: relatedOrder?.id ?? null,
  };
  const suggestedSubject = data.suggestedSubject
    ?? (relatedOrder
      ? `Consulta sobre orden ${relatedOrder.payment_reference ?? relatedOrder.id.slice(0, 8)}`
      : undefined);
  const companyId = ctx.company.id || "default";
  const seedTickets =
    data.module.available && data.tickets.length
      ? data.tickets
      : data.module.available
        ? []
        : DEFAULT_SUPPORT_TICKETS;
  const orderCard = relatedOrder ? renderRelatedOrderCard(relatedOrder) : "";
  const listSubtitle = data.module.available && companyId !== "default"
    ? "Tickets sincronizados con tu empresa."
    : "Los tickets se guardan en este navegador hasta conectar el backend.";

  const body = `
    ${supportPageStyles()}
    <div class="tv-support-page">
    ${renderPageHeader({
      title: "Soporte",
      subtitle:
        "Recibe ayuda del equipo Telvoice para compras, saldo SMS, campañas, API, entregabilidad y configuración de tu cuenta.",
      actions: `
        <button type="button" class="btn btn-primary" id="tv-support-new-btn">
          <span class="material-symbols-outlined" style="font-size:1.1rem" aria-hidden="true">add</span>
          Nuevo ticket
        </button>
      `,
    })}
    ${orderCard}
    ${renderInitialKpis(seedTickets)}
    <div class="tv-support-layout">
      <div class="tv-support-main">
        <div id="tv-support-empty" class="tv-panel tv-support-empty" hidden>
          <span class="material-symbols-outlined" aria-hidden="true">support_agent</span>
          <h2 style="margin:1rem 0 0.5rem;font-size:1.15rem">Aún no tienes tickets de soporte</h2>
          <p class="tv-page-sub" style="max-width:420px;margin:0 auto 1.25rem">
            Cuando necesites ayuda con compras, saldo, campañas, API o entregabilidad SMS, podrás crear una solicitud desde aquí.
          </p>
          <button type="button" class="btn btn-primary" id="tv-support-empty-create">Crear primer ticket</button>
        </div>
        <div id="tv-support-list-block">
          <section class="tv-panel">
            <header class="tv-section-head" style="padding:1rem 1.25rem 0">
              <h2 class="tv-section-head__title">Mis tickets</h2>
              <p class="tv-section-head__sub" id="tv-support-list-sub">${escapeHtml(listSubtitle)}</p>
            </header>
            <div class="tv-panel__body">
              <div class="tv-support-table-wrap">
                <table class="tv-table tv-table--dense">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Asunto</th>
                      <th>Categoría</th>
                      <th>Prioridad</th>
                      <th>Estado</th>
                      <th>Creación</th>
                      <th>Actualización</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody id="tv-support-tbody"></tbody>
                </table>
              </div>
              <div class="tv-support-ticket-cards" id="tv-support-cards"></div>
            </div>
          </section>
        </div>
        ${renderQuickHelpSection()}
      </div>
    </div>
    </div>
    ${renderNewTicketModal(suggestedSubject, data.relatedOrderId ?? relatedOrder?.id ?? null)}
    ${renderDetailDrawer()}
    ${renderHelpInfoModal()}
    <div class="tv-support-toast" id="tv-support-toast" role="status" aria-live="polite" aria-hidden="true"></div>
    ${renderSupportScript(companyId, data)}`;

  return wrapAppPage(ctx, "support", "Soporte", body);
}
