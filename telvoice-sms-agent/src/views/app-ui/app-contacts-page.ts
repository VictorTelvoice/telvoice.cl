import type {
  ContactImportPreview,
  ContactListWithCount,
  ContactSource,
  ContactStatus,
  ContactSummary,
  ContactWithListsAndTags,
  ContactsModuleState,
} from "../../types/contacts.js";
import { escapeHtml } from "../../utils/html.js";
import { renderBtn, renderFilterField, renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";

export type ContactsPageFilters = {
  q?: string;
  agenda?: string;
  tag?: string;
  status?: ContactStatus | "";
  source?: ContactSource | "";
  startDate?: string;
  endDate?: string;
};

export type ContactsQuickModalTab = "contact" | "agenda" | "import";
export type ContactsWizardStep = "agenda" | "choose" | "contact" | "import";

export type ContactsWizardState = {
  step: ContactsWizardStep;
  listId?: string;
};

export type AppContactsPageData = {
  module: ContactsModuleState;
  filters: ContactsPageFilters;
  contacts: ContactWithListsAndTags[];
  lists: ContactListWithCount[];
  summary: ContactSummary;
  wizardState?: ContactsWizardState;
  importPreview?: ContactImportPreview;
};


function parseIsoDateOnly(v: string | undefined): string | undefined {
  const s = (v ?? "").trim();
  if (!s) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

export function parseContactsQuickModalTab(
  query: Record<string, string | string[] | undefined>,
): ContactsQuickModalTab | undefined {
  const v = typeof query.new === "string" ? query.new : undefined;
  if (v === "contact" || v === "agenda" || v === "import") return v;
  if (typeof query.import_job === "string" && query.import_job.trim()) return "import";
  return undefined;
}

export function parseContactsWizardState(
  query: Record<string, string | string[] | undefined>,
): ContactsWizardState | undefined {
  const listId =
    typeof query.list_id === "string" && query.list_id.trim()
      ? query.list_id.trim()
      : undefined;
  const stepRaw =
    typeof query.quick_wizard === "string" ? query.quick_wizard.trim() : "";
  if (
    stepRaw === "agenda" ||
    stepRaw === "choose" ||
    stepRaw === "contact" ||
    stepRaw === "import"
  ) {
    return { step: stepRaw, listId };
  }
  if (typeof query.import_job === "string" && query.import_job.trim()) {
    return { step: "import", listId };
  }
  const legacy = parseContactsQuickModalTab(query);
  if (legacy === "agenda") return { step: "agenda" };
  if (legacy === "contact") return { step: "contact", listId };
  if (legacy === "import") return { step: "import", listId };
  return undefined;
}

export function parseContactsPageFilters(
  query: Record<string, string | string[] | undefined>,
): ContactsPageFilters {
  const str = (key: string): string | undefined => {
    const v = query[key];
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t ? t : undefined;
  };

  const status = str("status") as ContactStatus | undefined;
  const allowedStatus: ContactStatus[] = [
    "active",
    "incomplete",
    "blocked",
    "duplicate",
    "opt_out",
  ];
  const safeStatus = status && allowedStatus.includes(status) ? status : undefined;

  const source = str("source") as ContactSource | undefined;
  const allowedSource: ContactSource[] = ["manual", "import", "api", "web"];
  const safeSource = source && allowedSource.includes(source) ? source : undefined;

  return {
    q: str("q"),
    agenda: str("agenda"),
    tag: str("tag"),
    status: safeStatus ?? "",
    source: safeSource ?? "",
    startDate: parseIsoDateOnly(str("start_date")),
    endDate: parseIsoDateOnly(str("end_date")),
  };
}

function queryStringFromFilters(filters: ContactsPageFilters): string {
  const p = new URLSearchParams();
  if (filters.q) p.set("q", filters.q);
  if (filters.agenda) p.set("agenda", filters.agenda);
  if (filters.tag) p.set("tag", filters.tag);
  if (filters.status) p.set("status", filters.status);
  if (filters.source) p.set("source", filters.source);
  if (filters.startDate) p.set("start_date", filters.startDate);
  if (filters.endDate) p.set("end_date", filters.endDate);
  const s = p.toString();
  return s ? `?${s}` : "";
}


function migrationBanner(): string {
  return `<div class="alert alert-warn" role="status">
    <strong>Módulo Contactos pendiente de migración.</strong>
    Aplica <code>supabase/migrations/023_contacts.sql</code> en tu entorno para habilitar datos reales.
  </div>`;
}

function contactsPageStyles(): string {
  return `<style>
    .tv-contacts-modal {
      position: fixed;
      inset: 0;
      z-index: 200;
      display: none;
      align-items: stretch;
      justify-content: flex-end;
    }
    .tv-contacts-modal[aria-hidden="false"] { display: flex; }
    .tv-contacts-modal__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
    }
    .tv-contacts-modal__panel {
      position: relative;
      width: min(480px, 100%);
      max-width: 100%;
      background: var(--tv-surface);
      box-shadow: var(--tv-shadow-lg);
      display: flex;
      flex-direction: column;
      max-height: 100vh;
      overflow: hidden;
    }
    .tv-contacts-modal__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 1.25rem 1.25rem 0.75rem;
      border-bottom: 1px solid var(--tv-border);
    }
    .tv-contacts-modal__body {
      padding: 1rem 1.25rem 1.25rem;
      overflow-y: auto;
      flex: 1;
    }
    .tv-contacts-modal__pane[hidden] { display: none; }
    .tv-contacts-wizard-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-top: 1rem;
    }
    .tv-contacts-wizard-choose__lead {
      margin: 0 0 1rem;
      font-size: 0.9rem;
      color: var(--tv-muted);
    }
    .tv-contacts-wizard-choose__grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.65rem;
    }
    .tv-contacts-wizard-choice {
      appearance: none;
      border: 1px solid var(--tv-border);
      border-radius: var(--tv-radius);
      background: var(--tv-surface);
      padding: 1rem 0.85rem;
      text-align: left;
      cursor: pointer;
      font: inherit;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .tv-contacts-wizard-choice:hover {
      border-color: var(--tv-primary);
      box-shadow: 0 0 0 1px rgba(0, 82, 204, 0.12);
    }
    .tv-contacts-wizard-choice strong {
      display: block;
      font-size: 0.92rem;
      margin-bottom: 0.25rem;
    }
    .tv-contacts-wizard-choice span {
      display: block;
      font-size: 0.78rem;
      color: var(--tv-muted);
    }
    .tv-contacts-import-drop {
      border: 2px dashed var(--tv-border);
      border-radius: var(--tv-radius);
      padding: 1.25rem 1rem;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .tv-contacts-import-drop:hover,
    .tv-contacts-import-drop--drag {
      border-color: var(--tv-primary);
      background: rgba(0, 82, 204, 0.04);
    }
    .tv-contacts-import-drop .material-symbols-outlined {
      font-size: 2rem;
      color: var(--tv-primary);
      opacity: 0.85;
    }
    .tv-contacts-import-drop__title {
      margin: 0.5rem 0 0.25rem;
      font-weight: 600;
      font-size: 0.9rem;
    }
    .tv-contacts-import-drop__hint {
      margin: 0;
      font-size: 0.78rem;
      color: var(--tv-muted);
    }
    .tv-contacts-import-preview-stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
      margin-bottom: 0.85rem;
    }
    .tv-contacts-import-preview-stats > div {
      padding: 0.65rem 0.75rem;
      border: 1px solid var(--tv-border);
      border-radius: var(--tv-radius);
      font-size: 0.82rem;
    }
    .tv-contacts-import-preview-stats strong {
      display: block;
      font-size: 1.1rem;
      margin-top: 0.15rem;
    }
    @media (max-width: 640px) {
      .tv-contacts-modal { align-items: flex-end; }
      .tv-contacts-modal__panel {
        width: 100%;
        border-radius: var(--tv-radius) var(--tv-radius) 0 0;
        max-height: 92vh;
      }
      .tv-contacts-wizard-choose__grid { grid-template-columns: 1fr; }
    }
    .tv-contacts-search__form {
      display: grid;
      grid-template-columns: 1fr minmax(10rem, 14rem) auto;
      gap: 0.5rem;
      align-items: end;
    }
    @media (max-width: 720px) {
      .tv-contacts-search__form { grid-template-columns: 1fr; }
    }
  </style>`;
}

function importStatusBadge(status: string): string {
  const map: Record<string, [string, string]> = {
    valid: ["ok", "Válida"],
    invalid: ["err", "Inválida"],
    duplicate: ["warn", "Duplicado"],
    imported: ["ok", "Importada"],
    skipped: ["muted", "Omitida"],
    pending: ["muted", "Pendiente"],
  };
  const [cls, label] = map[status] ?? ["muted", status];
  return `<span class="badge badge-${cls}">${escapeHtml(label)}</span>`;
}

function importPreviewInModal(preview: ContactImportPreview): string {
  const { job, rows, summary } = preview;
  const sample = rows.slice(0, 20);
  const more = rows.length > 20 ? rows.length - 20 : 0;

  const tableRows = sample
    .map(
      (r) => `<tr>
        <td>${r.row_number}</td>
        <td>${escapeHtml(r.display_name)}</td>
        <td><code>${escapeHtml(r.phone)}</code></td>
        <td>${importStatusBadge(r.status)}</td>
      </tr>`,
    )
    .join("");

  return `<div class="tv-contacts-import-preview">
    <p class="tv-section-head__sub" style="margin:0 0 0.75rem">Revisa antes de confirmar. Solo se importan filas válidas.</p>
    <div class="tv-contacts-import-preview-stats">
      <div><span class="field-hint">Total filas</span><strong>${summary.total}</strong></div>
      <div><span class="field-hint">Válidas</span><strong style="color:var(--tv-success)">${summary.valid}</strong></div>
      <div><span class="field-hint">Inválidas</span><strong style="color:var(--tv-danger)">${summary.invalid}</strong></div>
      <div><span class="field-hint">Duplicadas</span><strong style="color:var(--tv-warn)">${summary.duplicate}</strong></div>
    </div>
    ${summary.invalid > 0 || summary.duplicate > 0 ? `<p class="alert alert-warn" style="margin-bottom:0.75rem">Algunas filas fueron omitidas. Se importarán ${summary.valid} contacto(s) válido(s).</p>` : ""}
    <div class="table-wrap" style="max-height:220px;overflow:auto">
      <table class="tv-table tv-table--dash">
        <thead><tr><th>#</th><th>Nombre</th><th>Teléfono</th><th>Estado</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    ${more > 0 ? `<p class="field-hint" style="margin:0.5rem 0 0">… y ${more} fila(s) más</p>` : ""}
    <form method="post" action="/app/contacts/import/confirm" style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap">
      <input type="hidden" name="job_id" value="${escapeHtml(job.id)}" />
      <button type="submit" class="btn btn-primary btn-sm">Finalizar importación (${summary.valid})</button>
      <button type="button" class="btn btn-ghost btn-sm" data-tv-contacts-import-reset>Importar otro archivo</button>
    </form>
  </div>`;
}

function wizardStepSubtitle(step: ContactsWizardStep, listName?: string): string {
  switch (step) {
    case "agenda":
      return "Paso 1 · Crea la agenda para organizar tus contactos";
    case "choose":
      return `Paso 2 · Agrega contactos a ${listName ?? "tu agenda"}`;
    case "contact":
      return `Paso 3 · Contacto manual en ${listName ?? "la agenda"}`;
    case "import":
      return listName
        ? `Paso 3 · Importar contactos a ${listName}`
        : "Paso 3 · Importar contactos desde planilla";
  }
}

function contactsWizardModal(
  lists: ContactListWithCount[],
  wizard: ContactsWizardState | undefined,
  importPreview?: ContactImportPreview,
): string {
  const step = wizard?.step ?? "agenda";
  const listId = wizard?.listId ?? "";
  const selectedList = listId ? lists.find((l) => l.id === listId) : undefined;
  const listName = selectedList?.name;

  const listOpts = [
    `<option value="">Sin agenda (opcional)</option>`,
    ...lists.map((a) => {
      const sel = listId && a.id === listId ? " selected" : "";
      return `<option value="${escapeHtml(a.id)}"${sel}>${escapeHtml(a.name)}</option>`;
    }),
  ].join("");

  const importHiddenFields = listId
    ? `<input type="hidden" name="wizard_list_id" value="${escapeHtml(listId)}" />
       <input type="hidden" name="default_list_name" value="${escapeHtml(listName ?? "")}" />`
    : "";

  const importPane = importPreview
    ? importPreviewInModal(importPreview)
    : `<form method="post" action="/app/contacts/import/preview" id="tv-contacts-import-form">
        ${importHiddenFields}
        <div class="tv-contacts-import-drop" id="tv-contacts-import-drop" tabindex="0" role="button" aria-label="Subir archivo CSV o Excel">
          <span class="material-symbols-outlined" aria-hidden="true">upload_file</span>
          <p class="tv-contacts-import-drop__title">Arrastra o selecciona un archivo</p>
          <p class="tv-contacts-import-drop__hint">CSV, TXT o Excel (.xlsx, .xls)</p>
          <input type="file" id="tv-contacts-import-file" accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden />
        </div>
        <p class="field-hint" id="tv-contacts-import-filename" style="margin:0.5rem 0 0.75rem" hidden></p>
        <div class="form-group" style="margin-top:0.75rem">
          ${renderFilterField(
            "Contenido",
            `<textarea name="csv_text" id="tv-contacts-import-text" class="tv-filter-input" rows="8" placeholder="nombre,telefono&#10;Juan Pérez,+56912345678" required></textarea>`,
          )}
        </div>
        <input type="hidden" name="filename" id="tv-contacts-import-filename-input" value="" />
        <div class="tv-contacts-wizard-actions">
          <button type="submit" class="btn btn-primary btn-sm">Previsualizar importación</button>
        </div>
      </form>`;

  return `<div class="tv-contacts-modal" id="tv-contacts-quick-modal" role="dialog" aria-modal="true" aria-labelledby="tv-contacts-modal-title" aria-hidden="true">
    <div class="tv-contacts-modal__backdrop" data-tv-contacts-close tabindex="-1"></div>
    <div class="tv-contacts-modal__panel">
      <header class="tv-contacts-modal__head">
        <div>
          <h2 class="tv-section-head__title" id="tv-contacts-modal-title">Gestión rápida</h2>
          <p class="tv-section-head__sub" id="tv-contacts-modal-sub">${escapeHtml(wizardStepSubtitle(step, listName))}</p>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-tv-contacts-close aria-label="Cerrar">✕</button>
      </header>
      <div class="tv-contacts-modal__body">
        <div class="tv-contacts-modal__pane" id="tv-contacts-pane-agenda" role="region"${step === "agenda" ? "" : " hidden"}>
          <form method="post" action="/app/contacts/lists" id="tv-contacts-form-agenda">
            ${renderFilterField("Nombre de la agenda", `<input type="text" name="name" class="tv-filter-input" placeholder="Ej. Clientes VIP" required />`)}
            ${renderFilterField("Descripción", `<input type="text" name="description" class="tv-filter-input" placeholder="opcional" />`)}
            ${renderFilterField("Color", `<input type="text" name="color" class="tv-filter-input" placeholder="#0052CC opcional" />`)}
            <div class="tv-contacts-wizard-actions">
              <button type="submit" name="wizard_next" value="1" class="btn btn-primary">Siguiente</button>
            </div>
          </form>
        </div>
        <div class="tv-contacts-modal__pane" id="tv-contacts-pane-choose" role="region"${step === "choose" ? "" : " hidden"}>
          <p class="tv-contacts-wizard-choose__lead">Elige cómo quieres agregar contactos${listName ? ` a <strong>${escapeHtml(listName)}</strong>` : ""}.</p>
          <div class="tv-contacts-wizard-choose__grid">
            <button type="button" class="tv-contacts-wizard-choice" data-tv-wizard-go="contact">
              <strong>Contacto manual</strong>
              <span>Agrega uno a uno con nombre y teléfono</span>
            </button>
            <button type="button" class="tv-contacts-wizard-choice" data-tv-wizard-go="import">
              <strong>Importar planilla</strong>
              <span>Sube CSV o Excel con varios contactos</span>
            </button>
          </div>
        </div>
        <div class="tv-contacts-modal__pane" id="tv-contacts-pane-contact" role="region"${step === "contact" ? "" : " hidden"}>
          <form method="post" action="/app/contacts" id="tv-contacts-form-contact">
            ${renderFilterField("Nombre visible", `<input type="text" name="display_name" class="tv-filter-input" placeholder="Ej. Juan Pérez" required />`)}
            ${renderFilterField("Teléfono", `<input type="tel" name="phone" class="tv-filter-input" placeholder="+56912345678" required />`)}
            ${renderFilterField("Email", `<input type="email" name="email" class="tv-filter-input" placeholder="opcional" />`)}
            ${listId
              ? `<input type="hidden" name="list_id" value="${escapeHtml(listId)}" />`
              : renderFilterField("Agenda", `<select name="list_id" class="tv-filter-input">${listOpts}</select>`)}
            ${renderFilterField("Notas", `<input type="text" name="notes" class="tv-filter-input" placeholder="opcional" />`)}
            <div class="tv-contacts-wizard-actions">
              <button type="submit" class="btn btn-primary">Finalizar</button>
            </div>
          </form>
        </div>
        <div class="tv-contacts-modal__pane" id="tv-contacts-pane-import" role="region"${step === "import" ? "" : " hidden"}>
          ${importPane}
        </div>
      </div>
    </div>
  </div>`;
}

function simpleSearchBar(
  lists: ContactListWithCount[],
  filters: ContactsPageFilters,
): string {
  const agendaOpts = [
    `<option value="">Todas las agendas</option>`,
    ...lists.map((a) => {
      const on = filters.agenda === a.id;
      return `<option value="${escapeHtml(a.id)}"${on ? " selected" : ""}>${escapeHtml(a.name)}</option>`;
    }),
  ].join("");

  return `<section class="tv-panel tv-contacts-search">
    <div class="tv-panel__body">
      <form method="get" action="/app/contacts" class="tv-contacts-search__form">
        ${renderFilterField("Buscar", `<input type="text" name="q" class="tv-filter-input" placeholder="Nombre o teléfono" value="${escapeHtml(filters.q ?? "")}" />`)}
        ${renderFilterField("Agenda", `<select name="agenda" class="tv-filter-input">${agendaOpts}</select>`)}
        <div class="tv-dlr-report__filter-actions">
          <button type="submit" class="btn btn-primary btn-sm">Buscar</button>
          ${(filters.q ?? filters.agenda) ? `<a class="btn btn-ghost btn-sm" href="/app/contacts">Limpiar</a>` : ""}
        </div>
      </form>
    </div>
  </section>`;
}

function agendaPanel(lists: ContactListWithCount[], selectedAgenda?: string): string {
  const cards = lists
    .map((a) => {
      const active = selectedAgenda === a.id;
      const href = `/app/contacts?agenda=${encodeURIComponent(a.id)}`;
      return `<div class="tv-contacts-agenda${active ? " tv-contacts-agenda--active" : ""}">
        <a href="${href}" class="tv-contacts-agenda__main">
          <div class="tv-contacts-agenda__head">
            <strong class="tv-contacts-agenda__name">${escapeHtml(a.name)}</strong>
            <span class="badge badge-muted">${a.contacts_count} contacto${a.contacts_count === 1 ? "" : "s"}</span>
          </div>
          ${a.description ? `<p class="tv-contacts-agenda__desc">${escapeHtml(a.description)}</p>` : ""}
        </a>
        <div class="tv-contacts-agenda__actions">
          <form method="post" action="/app/contacts/lists/${escapeHtml(a.id)}/duplicate">
            <button type="submit" class="btn btn-ghost btn-sm">Duplicar</button>
          </form>
          <form method="post" action="/app/contacts/lists/${escapeHtml(a.id)}/delete" onsubmit="return confirm('¿Eliminar esta agenda? Los contactos no se borran.');">
            <button type="submit" class="btn btn-ghost btn-sm" style="color:var(--tv-danger)">Eliminar</button>
          </form>
        </div>
      </div>`;
    })
    .join("");

  const emptyLists =
    lists.length === 0
      ? `<p class="field-hint" style="margin:0 0 0.75rem">Crea tu primera agenda para organizar contactos.</p>`
      : "";

  return `<section class="tv-panel tv-contacts-agendas">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Agendas</h2>
      <p class="tv-section-head__sub">Agrupa contactos por audiencia</p>
    </header>
    <div class="tv-panel__body">
      ${emptyLists}
      <div class="tv-contacts-agendas__list">${cards}</div>
      <div class="tv-contacts-agendas__cta">
        <button type="button" class="btn btn-secondary btn-sm" data-tv-contacts-open data-tv-wizard-step="agenda">
          <span class="material-symbols-outlined" aria-hidden="true">create_new_folder</span>
          Nueva agenda
        </button>
      </div>
    </div>
  </section>`;
}

function listsCell(listNames: string[]): string {
  if (!listNames.length) return `<span class="field-hint">—</span>`;
  return escapeHtml(listNames.join(", "));
}

function contactsTable(
  rows: ContactWithListsAndTags[],
  filters: ContactsPageFilters,
): string {
  const empty =
    rows.length === 0
      ? `<tr><td colspan="3" class="tv-table-empty">No hay contactos con los filtros aplicados.</td></tr>`
      : rows
          .map((c) => {
            return `<tr>
              <td><strong>${escapeHtml(c.display_name)}</strong></td>
              <td><code>${escapeHtml(c.phone)}</code></td>
              <td>${listsCell(c.list_names)}</td>
            </tr>`;
          })
          .join("");

  const anyFilter = Boolean((filters.q ?? "").trim() || (filters.agenda ?? "").trim());
  const qs = queryStringFromFilters(filters);

  return `<div class="tv-dash-block tv-contacts-table-block">
    <div class="tv-dash-block__head">
      <h2 class="tv-dash-block__title">Contactos</h2>
      <span class="tv-contacts-table-block__meta">
        ${rows.length} registro${rows.length === 1 ? "" : "s"} ·
        ${anyFilter ? `<a href="/app/contacts" class="tv-dash-block__link">Quitar filtros</a>` : `<a href="/app/contacts${qs}" class="tv-dash-block__link">Actualizar</a>`}
      </span>
    </div>
    <section class="tv-panel tv-client-dash-table-panel">
      <div class="tv-client-dash-table-inner">
        <div class="table-wrap tv-contacts-table-wrap">
          <table class="tv-table tv-table--dash tv-contacts-table">
            <thead><tr>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th>Agenda</th>
            </tr></thead>
            <tbody>${empty}</tbody>
          </table>
        </div>
      </div>
    </section>
  </div>`;
}

function emptyStateReal(): string {
  return `<section class="tv-panel">
    <div class="tv-panel__body tv-coming-soon">
      <span class="material-symbols-outlined" aria-hidden="true">contacts</span>
      <h2 style="margin-top:1rem">Todavía no tienes contactos</h2>
      <p class="tv-page-sub">Crea tu primer contacto o agenda para comenzar a preparar campañas SMS.</p>
      <div class="tv-quick-actions">
        <button type="button" class="btn btn-primary" data-tv-contacts-open data-tv-wizard-step="contact">Nuevo contacto</button>
        <button type="button" class="btn btn-secondary" data-tv-contacts-open data-tv-wizard-step="agenda">Nueva agenda</button>
        <button type="button" class="btn btn-ghost" data-tv-contacts-open data-tv-wizard-step="import">Importar planilla</button>
      </div>
    </div>
  </section>`;
}

function noResultsState(): string {
  return `<section class="tv-panel">
    <div class="tv-panel__body">
      <p style="margin:0"><strong>No hay resultados</strong> con los filtros aplicados.</p>
      <p class="field-hint" style="margin:0.35rem 0 0">Prueba limpiando filtros o seleccionando otra agenda.</p>
      <div class="tv-quick-actions" style="margin-top:0.75rem">
        ${renderBtn("Limpiar filtros", { href: "/app/contacts", variant: "primary" })}
        <button type="button" class="btn btn-secondary btn-sm" data-tv-contacts-open data-tv-wizard-step="contact">Crear contacto</button>
      </div>
    </div>
  </section>`;
}

export function renderAppContactsPage(
  ctx: AppPageContext,
  data: AppContactsPageData,
): string {
  const { module, filters, contacts, lists, summary } = data;
  const wizard = data.wizardState;
  const wizardStep = wizard?.step ?? "agenda";
  const wizardListId = wizard?.listId ?? "";
  const defaultOpenListId =
    wizardListId || filters.agenda || (lists[0]?.id ?? "");

  const anyFilter = Boolean((filters.q ?? "").trim() || (filters.agenda ?? "").trim());

  const showTable = module.available && (contacts.length > 0 || anyFilter);
  const showEmptyReal =
    module.available && summary.totalContacts === 0 && !anyFilter;
  const showNoResults =
    module.available && summary.totalContacts > 0 && contacts.length === 0 && anyFilter;

  const body = `
    ${contactsPageStyles()}
    <div class="tv-contacts tv-client-dashboard tv-dlr-report">
    ${module.migrationPending ? migrationBanner() : ""}
    ${renderPageHeader({
      title: "Contactos",
      subtitle: "Crea agendas y agrega contactos de forma simple y rápida.",
      actions: module.available
        ? `<button type="button" class="btn btn-primary" data-tv-contacts-open data-tv-wizard-step="agenda">
            <span class="material-symbols-outlined" aria-hidden="true">bolt</span>
            Gestión rápida
          </button>`
        : "",
    })}
    ${module.available ? agendaPanel(lists, filters.agenda) : ""}
    ${module.available ? simpleSearchBar(lists, filters) : ""}
    <div>
      ${showEmptyReal ? emptyStateReal() : ""}
      ${showNoResults ? noResultsState() : ""}
      ${showTable ? contactsTable(contacts, filters) : ""}
    </div>
    </div>
    ${module.available ? contactsWizardModal(lists, wizard, data.importPreview) : ""}
    <script>
      (function(){
        var modal = document.getElementById("tv-contacts-quick-modal");
        var panes = {
          agenda: document.getElementById("tv-contacts-pane-agenda"),
          choose: document.getElementById("tv-contacts-pane-choose"),
          contact: document.getElementById("tv-contacts-pane-contact"),
          import: document.getElementById("tv-contacts-pane-import")
        };
        var modalSub = document.getElementById("tv-contacts-modal-sub");
        var activeStep = ${JSON.stringify(wizardStep)};
        var wizardListId = ${JSON.stringify(wizardListId)};
        var defaultListId = ${JSON.stringify(defaultOpenListId)};
        var hasLists = ${JSON.stringify(lists.length > 0)};

        var stepSubtitles = {
          agenda: "Paso 1 · Crea la agenda para organizar tus contactos",
          choose: "Paso 2 · Agrega contactos a tu agenda",
          contact: "Paso 3 · Contacto manual",
          import: "Paso 3 · Importar contactos desde planilla"
        };

        function switchStep(name){
          activeStep = name;
          Object.keys(panes).forEach(function(k){
            if(panes[k]) panes[k].hidden = k !== name;
          });
          if(modalSub && stepSubtitles[name]) modalSub.textContent = stepSubtitles[name];
        }

        function openModal(step){
          if(!modal) return;
          var resolved = step || "agenda";
          if(resolved === "contact" && !wizardListId && defaultListId) {
            goWizard("contact", defaultListId);
            return;
          }
          if(resolved === "import" && !wizardListId && defaultListId && hasLists) {
            goWizard("import", defaultListId);
            return;
          }
          switchStep(resolved);
          modal.setAttribute("aria-hidden", "false");
          document.body.style.overflow = "hidden";
        }

        function closeModal(){
          if(!modal) return;
          modal.setAttribute("aria-hidden", "true");
          document.body.style.overflow = "";
        }

        function goWizard(step, listId){
          var qs = new URLSearchParams();
          qs.set("quick_wizard", step);
          if(listId) qs.set("list_id", listId);
          window.location.href = "/app/contacts?" + qs.toString();
        }

        document.querySelectorAll("[data-tv-contacts-open]").forEach(function(btn){
          btn.addEventListener("click", function(){
            openModal(btn.getAttribute("data-tv-wizard-step") || "agenda");
          });
        });
        modal && modal.querySelectorAll("[data-tv-contacts-close]").forEach(function(btn){
          btn.addEventListener("click", closeModal);
        });
        document.querySelectorAll("[data-tv-wizard-go]").forEach(function(btn){
          btn.addEventListener("click", function(){
            var target = btn.getAttribute("data-tv-wizard-go") || "contact";
            goWizard(target, wizardListId || defaultListId);
          });
        });
        document.addEventListener("keydown", function(e){
          if(e.key === "Escape" && modal && modal.getAttribute("aria-hidden") === "false") closeModal();
        });

        var drop = document.getElementById("tv-contacts-import-drop");
        var fileInput = document.getElementById("tv-contacts-import-file");
        var textArea = document.getElementById("tv-contacts-import-text");
        var fileLabel = document.getElementById("tv-contacts-import-filename");
        var fileHidden = document.getElementById("tv-contacts-import-filename-input");
        var xlsxReady = false;

        function setCsvContent(text, filename){
          if(textArea) textArea.value = text;
          if(fileHidden) fileHidden.value = filename || "";
          if(fileLabel){
            fileLabel.hidden = !filename;
            fileLabel.textContent = filename ? "Archivo: " + filename : "";
          }
        }

        function loadXlsx(cb){
          if(window.XLSX){ cb(); return; }
          if(xlsxReady){ return; }
          xlsxReady = true;
          var s = document.createElement("script");
          s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
          s.onload = cb;
          s.onerror = function(){ alert("No se pudo cargar el lector de Excel. Guarda la planilla como CSV e inténtalo de nuevo."); };
          document.head.appendChild(s);
        }

        function sheetToCsv(wb){
          var sheet = wb.Sheets[wb.SheetNames[0]];
          return window.XLSX.utils.sheet_to_csv(sheet);
        }

        function handleFile(file){
          if(!file) return;
          var name = file.name || "";
          var lower = name.toLowerCase();
          if(lower.endsWith(".csv") || lower.endsWith(".txt")){
            var reader = new FileReader();
            reader.onload = function(ev){ setCsvContent(String(ev.target && ev.target.result || ""), name); };
            reader.readAsText(file);
            return;
          }
          if(lower.endsWith(".xlsx") || lower.endsWith(".xls")){
            loadXlsx(function(){
              var reader = new FileReader();
              reader.onload = function(ev){
                try {
                  var data = new Uint8Array(ev.target.result);
                  var wb = window.XLSX.read(data, { type: "array" });
                  setCsvContent(sheetToCsv(wb), name);
                } catch(err){
                  alert("No se pudo leer el archivo Excel.");
                }
              };
              reader.readAsArrayBuffer(file);
            });
            return;
          }
          alert("Formato no soportado. Usa CSV o Excel (.xlsx, .xls).");
        }

        if(drop && fileInput){
          drop.addEventListener("click", function(){ fileInput.click(); });
          drop.addEventListener("keydown", function(e){ if(e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
          drop.addEventListener("dragover", function(e){ e.preventDefault(); drop.classList.add("tv-contacts-import-drop--drag"); });
          drop.addEventListener("dragleave", function(){ drop.classList.remove("tv-contacts-import-drop--drag"); });
          drop.addEventListener("drop", function(e){
            e.preventDefault();
            drop.classList.remove("tv-contacts-import-drop--drag");
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            handleFile(f);
          });
          fileInput.addEventListener("change", function(){
            handleFile(fileInput.files && fileInput.files[0]);
          });
        }

        var resetBtn = document.querySelector("[data-tv-contacts-import-reset]");
        if(resetBtn){
          resetBtn.addEventListener("click", function(){
            goWizard("import", wizardListId || defaultListId);
          });
        }

        var params = new URLSearchParams(window.location.search);
        if(params.get("quick_wizard") || params.get("import_job")) openModal(activeStep);
        else switchStep(activeStep);

        if(params.get("quick_wizard") || params.get("import_job")){
          params.delete("quick_wizard");
          params.delete("import_job");
          params.delete("list_id");
          var qs = params.toString();
          history.replaceState({}, "", "/app/contacts" + (qs ? "?" + qs : ""));
        }
      })();
    </script>`;

  return wrapAppPage(ctx, "contacts", "Contactos", body);
}
