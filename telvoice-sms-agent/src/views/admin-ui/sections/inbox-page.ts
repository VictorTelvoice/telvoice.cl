import { escapeHtml } from "../../../utils/html.js";
import type { AdminSessionUser } from "../../../types/admin.js";
import type { SmsMessageRow } from "../../../types/database.js";
import { formatDate } from "../../../utils/html.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import {
  MOCK_INBOX_MESSAGES,
  type InboxMessageMock,
} from "../mock-data.js";
import {
  renderAdminUiScript,
  renderInboxStatusBadge,
  renderPageHeader,
  renderTabs,
} from "../page-kit.js";

function mapRowToMock(m: SmsMessageRow): InboxMessageMock {
  const status = (m.status ?? "pending").toLowerCase();
  return {
    id: m.id,
    phone: m.phonenumber,
    message: "Ver detalle del mensaje en panel lateral.",
    campaign: m.uid.slice(0, 12),
    date: formatDate(m.created_at),
    operator: "Chile",
    status: status === "delivered" ? "entregado" : status,
    cost: m.client_cost ? `${m.client_cost} u.` : "1 SMS",
    direction: "out",
    messageId: m.uid,
    deliveredAt: m.dlr_status === "delivered" ? formatDate(m.updated_at) : undefined,
  };
}

function renderDetailTemplates(messages: InboxMessageMock[]): string {
  return messages
    .map(
      (m) => `<template id="tv-inbox-detail-${escapeHtml(m.id)}">
      <h3 class="tv-detail__title">${escapeHtml(m.phone)}</h3>
      <dl class="tv-detail-list">
        <div><dt>Contenido</dt><dd>${escapeHtml(m.message)}</dd></div>
        <div><dt>Estado DLR</dt><dd>${renderInboxStatusBadge(m.status)}</dd></div>
        <div><dt>ID mensaje</dt><dd><code>${escapeHtml(m.messageId)}</code></dd></div>
        <div><dt>Operador</dt><dd>${escapeHtml(m.operator)}</dd></div>
        <div><dt>Enviado</dt><dd>${escapeHtml(m.date)}</dd></div>
        <div><dt>Entrega</dt><dd>${escapeHtml(m.deliveredAt ?? "—")}</dd></div>
        <div><dt>Costo</dt><dd>${escapeHtml(m.cost)}</dd></div>
        <div><dt>Campaña</dt><dd>${escapeHtml(m.campaign)}</dd></div>
      </dl>
      <a href="/admin/messages/${escapeHtml(m.id)}" class="btn btn-primary btn-sm" style="margin-top:0.75rem">Abrir ficha técnica</a>
    </template>`,
    )
    .join("");
}

function renderConversation(messages: InboxMessageMock[]): string {
  const conv = messages.filter(
    (m) => m.direction === "in" || m.status === "respondido",
  );
  if (conv.length === 0) {
    return `<p class="tv-page-sub">Sin conversaciones activas en datos mock.</p>`;
  }
  return `<div class="tv-sms-thread">
    ${conv
      .map(
        (m) => `<div class="tv-sms-thread__msg tv-sms-thread__msg--${m.direction}">
          <span class="tv-sms-thread__meta">${escapeHtml(m.phone)} · ${escapeHtml(m.date)}</span>
          <div class="tv-sms-thread__bubble">${escapeHtml(m.message)}</div>
        </div>`,
      )
      .join("")}
  </div>`;
}

export function renderInboxPageBody(options: {
  messages?: SmsMessageRow[];
}): string {
  const fromDb = (options.messages ?? []).slice(0, 20).map(mapRowToMock);
  const messages =
    fromDb.length > 0
      ? [...fromDb, ...MOCK_INBOX_MESSAGES.slice(0, 3)]
      : MOCK_INBOX_MESSAGES;

  const tabs = renderTabs(
    [
      { id: "all", label: "Todos", count: messages.length },
      { id: "sent", label: "Enviados" },
      { id: "received", label: "Recibidos" },
      { id: "pending", label: "Pendientes" },
      { id: "failed", label: "Fallidos" },
      { id: "threads", label: "Conversaciones" },
      { id: "optout", label: "Opt-out" },
    ],
    "all",
    "inbox",
  );

  const filters = `
    <div class="tv-filters">
      <input type="search" class="tv-filter-input" placeholder="Buscar número o contenido…" />
      <input type="date" class="tv-filter-input" aria-label="Desde" />
      <input type="date" class="tv-filter-input" aria-label="Hasta" />
      <select class="tv-filter-input" disabled><option>Estado</option></select>
      <select class="tv-filter-input" disabled><option>Operador</option></select>
      <select class="tv-filter-input" disabled><option>Campaña</option></select>
      <select class="tv-filter-input" disabled><option>Tipo</option></select>
    </div>`;

  const rows = messages
    .map(
      (m, i) => `<tr class="tv-inbox-row${i === 0 ? " tv-inbox-row--active" : ""}" data-tv-inbox-row="${escapeHtml(m.id)}" tabindex="0">
        <td>${escapeHtml(m.phone)}</td>
        <td class="tv-inbox-msg">${escapeHtml(m.message.slice(0, 60))}${m.message.length > 60 ? "…" : ""}</td>
        <td>${escapeHtml(m.campaign)}</td>
        <td>${escapeHtml(m.date)}</td>
        <td>${escapeHtml(m.operator)}</td>
        <td>${renderInboxStatusBadge(m.status)}</td>
        <td>${escapeHtml(m.cost)}</td>
        <td><span class="row-link">Ver</span></td>
      </tr>`,
    )
    .join("");

  const first = messages[0]!;

  return `
    ${renderPageHeader({
      title: "Bandeja SMS",
      subtitle:
        "Revisa el historial de mensajes enviados, recibidos, estados DLR y conversaciones con destinatarios.",
    })}
    ${tabs}
    <div data-tv-tab-panel="inbox" data-tv-tab-id="all">
      ${filters}
      <div class="tv-inbox-layout">
        <div class="tv-panel tv-inbox-table-panel">
          <div class="tv-panel__body table-wrap" style="padding:0">
            <table class="tv-table tv-inbox-table">
              <thead>
                <tr>
                  <th>Número</th><th>Mensaje</th><th>Campaña</th><th>Fecha</th>
                  <th>Operador</th><th>Estado</th><th>Costo</th><th></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
        <aside class="tv-panel tv-inbox-detail-panel" data-tv-inbox-detail>
          <header class="tv-section-head"><h2 class="tv-section-head__title">Detalle</h2></header>
          <div class="tv-panel__body">
            <h3 class="tv-detail__title">${escapeHtml(first.phone)}</h3>
            <dl class="tv-detail-list">
              <div><dt>Contenido</dt><dd>${escapeHtml(first.message)}</dd></div>
              <div><dt>Estado DLR</dt><dd>${renderInboxStatusBadge(first.status)}</dd></div>
              <div><dt>ID mensaje</dt><dd><code>${escapeHtml(first.messageId)}</code></dd></div>
              <div><dt>Operador</dt><dd>${escapeHtml(first.operator)}</dd></div>
              <div><dt>Enviado</dt><dd>${escapeHtml(first.date)}</dd></div>
              <div><dt>Entrega</dt><dd>${escapeHtml(first.deliveredAt ?? "—")}</dd></div>
              <div><dt>Costo</dt><dd>${escapeHtml(first.cost)}</dd></div>
              <div><dt>Campaña</dt><dd>${escapeHtml(first.campaign)}</dd></div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
    <div data-tv-tab-panel="inbox" data-tv-tab-id="threads" hidden>
      <div class="tv-panel"><div class="tv-panel__body">${renderConversation(messages)}</div></div>
    </div>
  ${renderDetailTemplates(messages)}
  ${renderAdminUiScript()}
  <p class="field-hint tv-mock-tag">Datos mock + últimos envíos reales de Supabase cuando existan.</p>`;
}

export function renderInboxPage(options: {
  admin: AdminSessionUser;
  messages?: SmsMessageRow[];
  smsBalance?: string;
}): string {
  return wrapAdminPage({
    admin: options.admin,
    title: "Bandeja SMS",
    activeNav: "inbox",
    body: renderInboxPageBody({ messages: options.messages }),
    topbar: { smsBalance: options.smsBalance },
  });
}
