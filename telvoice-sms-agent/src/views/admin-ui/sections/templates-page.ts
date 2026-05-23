import type { AdminSessionUser } from "../../../types/admin.js";
import { escapeHtml } from "../../../utils/html.js";
import { wrapAdminPage } from "../admin-page-wrap.js";
import { MOCK_TEMPLATES } from "../mock-data-stage3.js";
import {
  renderAdminUiScript,
  renderBtn,
  renderMobilePreview,
  renderPageHeader,
  renderTabs,
} from "../page-kit.js";

export function renderTemplatesPage(options: {
  admin: AdminSessionUser;
  smsBalance?: string;
}): string {
  const tabs = renderTabs(
    [
      { id: "all", label: "Todas", count: MOCK_TEMPLATES.length },
      { id: "otp", label: "OTP / Validación" },
      { id: "reminders", label: "Recordatorios" },
      { id: "promo", label: "Promociones" },
      { id: "alerts", label: "Alertas" },
      { id: "collections", label: "Cobranzas" },
      { id: "logistics", label: "Despacho" },
      { id: "health", label: "Salud" },
      { id: "retail", label: "Retail" },
      { id: "finance", label: "Finanzas" },
    ],
    "all",
    "templates",
  );

  const cards = MOCK_TEMPLATES.map(
    (t, i) => `<article class="tv-template-card${i === 0 ? " tv-template-card--active" : ""}" data-tv-template-card="${escapeHtml(t.id)}" tabindex="0">
      <div class="tv-template-card__head">
        <h3>${escapeHtml(t.name)}</h3>
        <span class="tv-tag tv-tag--ok">${escapeHtml(t.status)}</span>
      </div>
      <p class="tv-template-card__cat">${escapeHtml(t.category)}</p>
      <p class="tv-template-card__msg">${escapeHtml(t.message)}</p>
      <p class="tv-template-card__meta">Variables: ${escapeHtml(t.vars)} · Último uso: ${escapeHtml(t.lastUse)}</p>
      <div class="tv-template-card__actions">
        <a href="/admin/sms/send-test" class="btn btn-primary btn-sm">Usar</a>
        <a href="/admin/knowledge" class="btn btn-ghost btn-sm">Editar</a>
        <button type="button" class="btn btn-ghost btn-sm" disabled>Duplicar</button>
      </div>
    </article>`,
  ).join("");

  const editorTemplates = MOCK_TEMPLATES.map(
    (t) => `<template id="tv-template-editor-${escapeHtml(t.id)}">
      <div class="tv-template-editor">
        <div class="form-group">
          <label>Nombre de plantilla</label>
          <input type="text" value="${escapeHtml(t.name)}" disabled class="tv-input-full" />
        </div>
        <div class="form-group">
          <label>Categoría</label>
          <input type="text" value="${escapeHtml(t.category)}" disabled class="tv-input-full" />
        </div>
        <div class="form-group">
          <label>Mensaje</label>
          <textarea rows="4" disabled class="tv-input-full">${escapeHtml(t.message)}</textarea>
        </div>
        <p class="field-hint">Variables: {nombre} {codigo} {empresa} {fecha} {monto} {link}</p>
        <div class="tv-stat-chips">
          <div class="tv-stat-chip"><span class="tv-stat-chip__label">Caracteres</span><span class="tv-stat-chip__value">${escapeHtml(String(t.message.length))}</span></div>
          <div class="tv-stat-chip"><span class="tv-stat-chip__label">Segmentos est.</span><span class="tv-stat-chip__value">${escapeHtml(String(Math.max(1, Math.ceil(t.message.length / 160))))}</span></div>
        </div>
        <div class="tv-panel__body--center" style="margin-top:1rem">${renderMobilePreview("Telvoice", t.message)}</div>
      </div>
    </template>`,
  ).join("");

  const first = MOCK_TEMPLATES[0]!;

  const body = `
    ${renderPageHeader({
      title: "Plantillas SMS",
      subtitle:
        "Crea, organiza y reutiliza mensajes para campañas, notificaciones, OTP, cobranzas y alertas transaccionales.",
      actions: `
        <a href="/admin/knowledge/new" class="btn btn-primary">Crear plantilla</a>
        ${renderBtn("Importar", { variant: "secondary", disabled: true })}
        ${renderBtn("Duplicar", { variant: "ghost", disabled: true })}
        <a href="/admin/sms/send-test" class="btn btn-secondary">Usar en campaña</a>
        <a href="/admin/knowledge" class="btn btn-ghost btn-sm">Base conocimiento →</a>
      `,
    })}
    ${tabs}
    <div class="tv-templates-layout" data-tv-tab-panel="templates" data-tv-tab-id="all">
      <div class="tv-templates-grid">${cards}</div>
      <aside class="tv-panel tv-template-editor-panel">
        <header class="tv-section-head"><h2 class="tv-section-head__title">Editor</h2></header>
        <div class="tv-panel__body" data-tv-template-editor>
          <div class="tv-template-editor">
            <div class="form-group">
              <label>Nombre</label>
              <input type="text" value="${escapeHtml(first.name)}" disabled class="tv-input-full" />
            </div>
            <div class="form-group">
              <label>Mensaje</label>
              <textarea rows="4" disabled class="tv-input-full">${escapeHtml(first.message)}</textarea>
            </div>
            ${renderMobilePreview("Telvoice", first.message)}
          </div>
        </div>
      </aside>
    </div>
    ${editorTemplates}
    ${renderAdminUiScript()}`;

  return wrapAdminPage({
    admin: options.admin,
    title: "Plantillas SMS",
    activeNav: "templates",
    body,
    topbar: options.smsBalance ? { smsBalance: options.smsBalance } : undefined,
  });
}
