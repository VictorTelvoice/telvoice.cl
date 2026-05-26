import type { ContactImportPreview } from "../../types/contacts.js";
import { escapeHtml } from "../../utils/html.js";
import { renderBtn, renderFilterField, renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";

export type AppContactsImportPageData = {
  preview?: ContactImportPreview;
  showForm: boolean;
};

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    valid: "Válida",
    invalid: "Inválida",
    duplicate: "Duplicado",
    imported: "Importada",
    skipped: "Omitida",
    pending: "Pendiente",
  };
  return map[status] ?? status;
}

function statusBadge(status: string): string {
  const cls =
    status === "valid"
      ? "ok"
      : status === "duplicate"
        ? "warn"
        : status === "invalid"
          ? "err"
          : "muted";
  return `<span class="badge badge-${cls}">${escapeHtml(statusLabel(status))}</span>`;
}

function importForm(): string {
  return `<section class="tv-panel">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Pegar o subir CSV</h2>
      <p class="tv-section-head__sub">Columnas: nombre, teléfono, email, agenda, tags, notas (cabecera opcional)</p>
    </header>
    <div class="tv-panel__body">
      <form method="post" action="/app/contacts/import/preview" class="tv-dlr-report__filters-form">
        <div class="tv-dlr-report__filters-grid" style="grid-template-columns:1fr">
          ${renderFilterField(
            "Contenido CSV",
            `<textarea name="csv_text" class="tv-filter-input" rows="12" placeholder="nombre,telefono,email,tags&#10;Juan Pérez,+56912345678,juan@ejemplo.cl,vip" required></textarea>`,
          )}
          ${renderFilterField(
            "Nombre archivo (opcional)",
            `<input type="text" name="filename" class="tv-filter-input" placeholder="contactos.csv" />`,
          )}
          <label class="tv-filter-field" style="display:flex;align-items:center;gap:0.5rem">
            <input type="checkbox" name="create_tags" value="1" />
            <span>Crear tags automáticamente si no existen</span>
          </label>
          <div class="tv-dlr-report__filter-actions">
            <button type="submit" class="btn btn-primary btn-sm">Previsualizar importación</button>
            <a class="btn btn-ghost btn-sm" href="/app/contacts">Volver a contactos</a>
          </div>
        </div>
      </form>
    </div>
  </section>`;
}

function previewPanel(preview: ContactImportPreview): string {
  const { job, rows, summary } = preview;
  const sample = rows.slice(0, 50);
  const more = rows.length > 50 ? rows.length - 50 : 0;

  const tableRows = sample
    .map(
      (r) => `<tr>
        <td>${r.row_number}</td>
        <td>${escapeHtml(r.display_name)}</td>
        <td><code>${escapeHtml(r.phone)}</code></td>
        <td>${statusBadge(r.status)}</td>
        <td class="field-hint">${escapeHtml(r.error_message ?? "—")}</td>
      </tr>`,
    )
    .join("");

  return `<section class="tv-panel">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Resumen de previsualización</h2>
      <p class="tv-section-head__sub">Revisa antes de confirmar. Solo se importan filas válidas.</p>
    </header>
    <div class="tv-panel__body">
      <div class="tv-kpi-grid tv-kpi-grid--client" style="margin-bottom:1rem">
        <div class="tv-kpi-card"><span class="field-hint">Total filas</span><strong>${summary.total}</strong></div>
        <div class="tv-kpi-card"><span class="field-hint">Válidas</span><strong style="color:var(--tv-success)">${summary.valid}</strong></div>
        <div class="tv-kpi-card"><span class="field-hint">Inválidas</span><strong style="color:var(--tv-danger)">${summary.invalid}</strong></div>
        <div class="tv-kpi-card"><span class="field-hint">Duplicadas</span><strong style="color:var(--tv-warn)">${summary.duplicate}</strong></div>
      </div>
      ${summary.invalid > 0 || summary.duplicate > 0 ? `<p class="alert alert-warn">Algunas filas fueron omitidas por errores o duplicados. Solo se importarán ${summary.valid} contacto(s) válido(s).</p>` : ""}
      <div class="table-wrap">
        <table class="tv-table tv-table--dash">
          <thead><tr><th>#</th><th>Nombre</th><th>Teléfono</th><th>Estado</th><th>Detalle</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      ${more > 0 ? `<p class="field-hint" style="margin-top:0.5rem">… y ${more} fila(s) más</p>` : ""}
      <form method="post" action="/app/contacts/import/confirm" style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap">
        <input type="hidden" name="job_id" value="${escapeHtml(job.id)}" />
        <button type="submit" class="btn btn-primary btn-sm">Confirmar importación (${summary.valid})</button>
        <a class="btn btn-ghost btn-sm" href="/app/contacts/import">Cancelar</a>
      </form>
    </div>
  </section>`;
}

export function renderAppContactsImportPage(
  ctx: AppPageContext,
  data: AppContactsImportPageData,
): string {
  const body = `
    <div class="tv-contacts tv-client-dashboard tv-dlr-report">
    ${renderPageHeader({
      title: "Importar contactos",
      subtitle: "Carga audiencias desde CSV con validación y vista previa.",
      actions: renderBtn("Volver", { href: "/app/contacts", variant: "ghost", icon: "arrow_back" }),
    })}
    ${data.preview ? previewPanel(data.preview) : ""}
    ${data.showForm ? importForm() : ""}
    </div>`;

  return wrapAppPage(ctx, "contacts", "Importar contactos", body);
}
