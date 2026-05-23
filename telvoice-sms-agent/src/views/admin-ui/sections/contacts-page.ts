import type { AdminSessionUser } from "../../../types/admin.js";
import { escapeHtml } from "../../../utils/html.js";
import { renderKpiCard } from "../components.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import { MOCK_CONTACTS, MOCK_CONTACT_LISTS } from "../mock-data-stage3.js";
import {
  renderAdminUiScript,
  renderBtn,
  renderFilterBar,
  renderFilterField,
  renderPageHeader,
  renderPanel,
} from "../page-kit.js";

function contactStatusBadge(status: string): string {
  const map: Record<string, [string, string]> = {
    activo: ["ok", "Activo"],
    invalido: ["err", "Inválido"],
    duplicado: ["warn", "Duplicado"],
    optout: ["muted", "Opt-out"],
    sin_validar: ["warn", "Sin validar"],
  };
  const [cls, label] = map[status] ?? ["muted", status];
  return `<span class="badge badge-${cls}">${label}</span>`;
}

export function renderContactsPage(options: {
  admin: AdminSessionUser;
  smsBalance?: string;
}): string {
  const headerActions = `
    ${renderBtn("Crear contacto", { variant: "primary", icon: "person_add", disabled: true })}
    ${renderBtn("Importar CSV", { variant: "secondary", icon: "upload", disabled: true })}
    ${renderBtn("Exportar", { variant: "ghost", disabled: true })}
    ${renderBtn("Crear lista", { variant: "secondary", disabled: true })}
    ${renderBtn("Validar números", { variant: "secondary", icon: "fact_check", disabled: true })}
    <a href="/admin/leads" class="btn btn-ghost btn-sm">Leads comerciales →</a>
  `;

  const kpis = `<div class="tv-kpi-grid">
    ${renderKpiCard({ label: "Total contactos", value: "8.420", icon: "contacts", variant: "primary" })}
    ${renderKpiCard({ label: "Válidos", value: "8.102", icon: "check", variant: "success" })}
    ${renderKpiCard({ label: "Inválidos", value: "214", icon: "block", variant: "danger" })}
    ${renderKpiCard({ label: "Duplicados", value: "38", icon: "content_copy", variant: "warn" })}
    ${renderKpiCard({ label: "Opt-out", value: "66", icon: "do_not_disturb", variant: "default" })}
    ${renderKpiCard({ label: "Listas activas", value: "7", icon: "folder", variant: "default" })}
  </div>`;

  const filters = renderFilterBar(`
    <input type="search" class="tv-filter-input tv-filter-input--grow" placeholder="Buscar nombre, teléfono o empresa…" />
    ${renderFilterField("Lista", '<select class="tv-filter-input" disabled><option>Todas</option></select>')}
    ${renderFilterField("Estado", '<select class="tv-filter-input" disabled><option>Todos</option></select>')}
    ${renderFilterField("Consentimiento", '<select class="tv-filter-input" disabled><option>Opt-in / Opt-out</option></select>')}
  `);

  const rows = MOCK_CONTACTS.map(
    (c, i) => `<tr class="tv-inbox-row${i === 0 ? " tv-inbox-row--active" : ""}" data-tv-contact-row="${escapeHtml(c.id)}" tabindex="0">
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.phone)}</td>
      <td>${escapeHtml(c.company)}</td>
      <td>${escapeHtml(c.email)}</td>
      <td>${escapeHtml(c.list)}</td>
      <td><span class="tv-tag tv-tag--muted">${escapeHtml(c.tags)}</span></td>
      <td>${contactStatusBadge(c.status)}</td>
      <td>${escapeHtml(c.lastSms)}</td>
      <td><span class="row-link">Ver</span></td>
    </tr>`,
  ).join("");

  const detailTemplates = MOCK_CONTACTS.map(
    (c) => `<template id="tv-contact-detail-${escapeHtml(c.id)}">
      <h3 class="tv-detail__title">${escapeHtml(c.name)}</h3>
      <dl class="tv-detail-list">
        <div><dt>Teléfono</dt><dd>${escapeHtml(c.phone)}</dd></div>
        <div><dt>Empresa</dt><dd>${escapeHtml(c.company)}</dd></div>
        <div><dt>Email</dt><dd>${escapeHtml(c.email)}</dd></div>
        <div><dt>Lista</dt><dd>${escapeHtml(c.list)}</dd></div>
        <div><dt>Consentimiento</dt><dd>${contactStatusBadge(c.status)}</dd></div>
        <div><dt>Etiquetas</dt><dd>${escapeHtml(c.tags)}</dd></div>
      </dl>
      <p class="field-hint"><strong>Historial:</strong> ${escapeHtml(c.lastSms)}</p>
      <p class="field-hint"><strong>Notas:</strong> Sin notas internas (mock).</p>
      <a href="/admin/sms/send-test" class="btn btn-primary btn-sm">Enviar campaña</a>
    </template>`,
  ).join("");

  const first = MOCK_CONTACTS[0]!;
  const listCards = MOCK_CONTACT_LISTS.map(
    (l) => `<div class="tv-list-card">
      <div><strong>${escapeHtml(l.name)}</strong><span class="tv-list-card__count">${escapeHtml(String(l.count))} contactos</span></div>
      <span class="tv-list-card__meta">Actualizado ${escapeHtml(l.updated)}</span>
      <div class="tv-list-card__actions">
        <button type="button" class="btn btn-ghost btn-sm" disabled>Editar</button>
        <a href="/admin/sms/send-test" class="btn btn-secondary btn-sm">Enviar campaña</a>
      </div>
    </div>`,
  ).join("");

  const body = `
    ${renderPageHeader({
      title: "Contactos",
      subtitle:
        "Administra tus bases de destinatarios, listas, segmentos y estados de opt-in/opt-out.",
      actions: headerActions,
    })}
    ${kpis}
    ${filters}
    <div class="tv-inbox-layout">
      <div class="tv-panel tv-inbox-table-panel">
        <div class="tv-panel__body table-wrap" style="padding:0">
          <table class="tv-table">
            <thead><tr>
              <th>Nombre</th><th>Teléfono</th><th>Empresa</th><th>Email</th><th>Lista</th>
              <th>Etiquetas</th><th>Estado</th><th>Último SMS</th><th></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
      <aside class="tv-panel tv-inbox-detail-panel" data-tv-contact-detail>
        <header class="tv-section-head"><h2 class="tv-section-head__title">Ficha contacto</h2></header>
        <div class="tv-panel__body">
          <h3 class="tv-detail__title">${escapeHtml(first.name)}</h3>
          <dl class="tv-detail-list">
            <div><dt>Teléfono</dt><dd>${escapeHtml(first.phone)}</dd></div>
            <div><dt>Empresa</dt><dd>${escapeHtml(first.company)}</dd></div>
            <div><dt>Lista</dt><dd>${escapeHtml(first.list)}</dd></div>
          </dl>
        </div>
      </aside>
    </div>
    ${detailTemplates}
    ${renderPanel("Listas y segmentos", `<div class="tv-list-grid">${listCards}</div>`)}
    ${renderAdminUiScript()}`;

  return wrapAdminPage({
    admin: options.admin,
    title: "Contactos",
    activeNav: "contacts",
    body,
    topbar: options.smsBalance ? { smsBalance: options.smsBalance } : undefined,
  });
}
