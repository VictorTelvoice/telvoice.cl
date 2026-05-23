import type { AdminSessionUser } from "../../../types/admin.js";
import { escapeHtml } from "../../../utils/html.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import { MOCK_CHAT_TICKETS } from "../mock-data-stage3.js";
import {
  renderAdminUiScript,
  renderBtn,
  renderPageHeader,
} from "../page-kit.js";
import { renderSuperadminBanner } from "../superadmin-kit.js";

function ticketStatusBadge(status: string): string {
  const map: Record<string, [string, string]> = {
    abierto: ["warn", "Abierto"],
    en_revision: ["ok", "En revisión"],
    resuelto: ["ok", "Resuelto"],
    cerrado: ["muted", "Cerrado"],
  };
  const [cls, label] = map[status] ?? ["muted", status];
  return `<span class="badge badge-${cls}">${label}</span>`;
}

function priorityBadge(p: string): string {
  const map: Record<string, string> = {
    baja: "muted",
    media: "ok",
    alta: "warn",
    critica: "err",
  };
  return `<span class="badge badge-${map[p] ?? "muted"}">${escapeHtml(p)}</span>`;
}

function renderChatMessages(ticketId: string): string {
  if (ticketId === "tk3") {
    return `
      <div class="tv-chat-msg tv-chat-msg--bot">
        <span class="tv-chat-msg__avatar">TV</span>
        <div class="tv-chat-msg__bubble">Soporte Telvoice: Hola, estamos revisando tu solicitud. Indícanos el ID de campaña o el número afectado.</div>
      </div>
      <div class="tv-chat-msg tv-chat-msg--user">
        <div class="tv-chat-msg__bubble">Campaña Retail Mayo — muchos fallidos en WOM.</div>
      </div>
      <div class="tv-chat-msg tv-chat-msg--bot">
        <span class="tv-chat-msg__avatar">TV</span>
        <div class="tv-chat-msg__bubble">Gracias. Revisaremos DLR y números inválidos. ID referencia: CMP-RETAIL-MAYO.</div>
      </div>`;
  }
  return `
    <div class="tv-chat-msg tv-chat-msg--bot">
      <span class="tv-chat-msg__avatar">TV</span>
      <div class="tv-chat-msg__bubble">Soporte Telvoice: Hola, estamos revisando tu solicitud. Indícanos el ID de campaña o el número afectado para ayudarte más rápido.</div>
    </div>
    <div class="tv-chat-msg tv-chat-msg--user">
      <div class="tv-chat-msg__bubble">Necesito ayuda con este ticket.</div>
    </div>`;
}

function renderChatMeta(
  t: (typeof MOCK_CHAT_TICKETS)[0],
  requesterName: string,
): string {
  return `<dl class="tv-detail-list">
    <div><dt>ID ticket</dt><dd><code>TV-${escapeHtml(t.id.toUpperCase())}</code></dd></div>
    <div><dt>Estado</dt><dd>${ticketStatusBadge(t.status)}</dd></div>
    <div><dt>Prioridad</dt><dd>${priorityBadge(t.priority)}</dd></div>
    <div><dt>Área</dt><dd>${escapeHtml(t.area)}</dd></div>
    <div><dt>Creado</dt><dd>20 may 2026</dd></div>
    <div><dt>Actualización</dt><dd>${escapeHtml(t.updated)}</dd></div>
    <div><dt>Solicitante</dt><dd>${escapeHtml(requesterName)}</dd></div>
  </dl>`;
}

export function renderChatPage(options: {
  admin: AdminSessionUser;
  smsBalance?: string;
}): string {
  const active = MOCK_CHAT_TICKETS[2]!;

  const ticketList = MOCK_CHAT_TICKETS.map(
    (t, i) => `<button type="button" class="tv-chat-ticket${i === 2 ? " tv-inbox-row--active" : ""}" data-tv-chat-ticket="${escapeHtml(t.id)}">
      <span class="tv-chat-ticket__subject">${escapeHtml(t.subject)}</span>
      <span class="tv-chat-ticket__meta">${ticketStatusBadge(t.status)} ${priorityBadge(t.priority)}</span>
      <span class="tv-chat-ticket__time">${escapeHtml(t.updated)}</span>
    </button>`,
  ).join("");

  const msgTemplates = MOCK_CHAT_TICKETS.map(
    (t) => `<template id="tv-chat-msgs-${escapeHtml(t.id)}">${renderChatMessages(t.id)}</template>`,
  ).join("");

  const requester = options.admin.name;
  const metaTemplates = MOCK_CHAT_TICKETS.map(
    (t) => `<template id="tv-chat-meta-${escapeHtml(t.id)}">${renderChatMeta(t, requester)}</template>`,
  ).join("");

  const quick = [
    { label: "Problema de entrega", icon: "error" },
    { label: "Activación API", icon: "api" },
    { label: "Consultar factura", icon: "receipt" },
    { label: "Alto volumen", icon: "trending_up" },
    { label: "Hablar comercial", icon: "support_agent" },
  ]
    .map(
      (q) => `<button type="button" class="tv-bot-chip" disabled title="Próximamente">
        <span class="material-symbols-outlined">${escapeHtml(q.icon)}</span>${escapeHtml(q.label)}
      </button>`,
    )
    .join("");

  const body = `
    ${renderSuperadminBanner()}
    ${renderPageHeader({
      title: "Chat soporte",
      subtitle:
        "Atiende tickets de clientes empresariales: facturación, integración API, rutas y operación SMS.",
      actions: `
        ${renderBtn("Crear ticket", { variant: "primary", icon: "add", disabled: true })}
        ${renderBtn("Marcar resuelto", { variant: "secondary", disabled: true })}
        <a href="/admin/telegram/diagnostics" class="btn btn-ghost btn-sm">Ir al Bot →</a>
        <a href="/admin/web-agent/sessions" class="btn btn-ghost btn-sm">Sesiones web agent →</a>
      `,
    })}
    <div class="tv-chat-layout">
      <aside class="tv-panel tv-chat-list">
        <header class="tv-section-head"><h2 class="tv-section-head__title">Tickets</h2></header>
        <div class="tv-panel__body tv-panel__body--flush">${ticketList}</div>
      </aside>
      <section class="tv-panel tv-chat-main">
        <header class="tv-section-head">
          <h2 class="tv-section-head__title">${escapeHtml(active.subject)}</h2>
          <p class="tv-section-head__sub">Soporte humano Telvoice</p>
        </header>
        <div class="tv-panel__body tv-chat-messages" data-tv-chat-messages>
          ${renderChatMessages(active.id)}
        </div>
        <div class="tv-bot-quick">${quick}</div>
        <form class="tv-bot-compose" onsubmit="return false">
          <input type="text" placeholder="Escribe tu mensaje…" disabled />
          <button type="button" class="btn btn-ghost" disabled title="Próximamente">Adjuntar</button>
          <button type="button" class="btn btn-primary" disabled>Enviar</button>
        </form>
      </section>
      <aside class="tv-panel tv-chat-meta-panel">
        <header class="tv-section-head"><h2 class="tv-section-head__title">Detalle</h2></header>
        <div class="tv-panel__body" data-tv-chat-meta>
          ${renderChatMeta(active, requester)}
          <p class="field-hint">Campaña relacionada: Retail Mayo (mock)</p>
        </div>
      </aside>
    </div>
    ${msgTemplates}
    ${metaTemplates}
    ${renderAdminUiScript()}`;

  return wrapAdminPage({
    admin: options.admin,
    title: "Chat de soporte",
    activeNav: "chat",
    body,
    topbar: options.smsBalance ? { smsBalance: options.smsBalance } : undefined,
  });
}
