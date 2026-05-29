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

export type AppContactsPageData = {
  module: ContactsModuleState;
  filters: ContactsPageFilters;
  contacts: ContactWithListsAndTags[];
  lists: ContactListWithCount[];
  summary: ContactSummary;
  initialModalTab?: ContactsQuickModalTab;
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
    .tv-contacts-modal__tabs {
      display: flex;
      gap: 0.25rem;
      padding: 0.65rem 1.25rem 0;
      border-bottom: 1px solid var(--tv-border);
      overflow-x: auto;
    }
    .tv-contacts-modal__tab {
      appearance: none;
      border: none;
      background: transparent;
      padding: 0.55rem 0.85rem;
      font: inherit;
      font-size: 0.84rem;
      font-weight: 600;
      color: var(--tv-muted);
      border-bottom: 2px solid transparent;
      cursor: pointer;
      white-space: nowrap;
      margin-bottom: -1px;
    }
    .tv-contacts-modal__tab:hover { color: var(--tv-text); }
    .tv-contacts-modal__tab[aria-selected="true"] {
      color: var(--tv-primary);
      border-bottom-color: var(--tv-primary);
    }
    .tv-contacts-modal__body {
      padding: 1rem 1.25rem;
      overflow-y: auto;
      flex: 1;
    }
    .tv-contacts-modal__pane[hidden] { display: none; }
    .tv-contacts-modal__foot {
      padding: 1rem 1.25rem;
      border-top: 1px solid var(--tv-border);
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      flex-wrap: wrap;
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
      <button type="submit" class="btn btn-primary btn-sm">Confirmar importación (${summary.valid})</button>
      <button type="button" class="btn btn-ghost btn-sm" data-tv-contacts-import-reset>Importar otro archivo</button>
    </form>
  </div>`;
}

function contactsQuickModal(
  lists: ContactListWithCount[],
  importPreview?: ContactImportPreview,
): string {
  const listOpts = [
    `<option value="">Sin agenda (opcional)</option>`,
    ...lists.map(
      (a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`,
    ),
  ].join("");

  const importPane = importPreview
    ? importPreviewInModal(importPreview)
    : `<form method="post" action="/app/contacts/import/preview" id="tv-contacts-import-form">
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
            `<textarea name="csv_text" id="tv-contacts-import-text" class="tv-filter-input" rows="8" placeholder="nombre,telefono,email,agenda,tags,notas&#10;Juan Pérez,+56912345678,juan@ejemplo.cl,Clientes,vip" required></textarea>`,
          )}
        </div>
        <input type="hidden" name="filename" id="tv-contacts-import-filename-input" value="" />
        <label class="tv-filter-field" style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem">
          <input type="checkbox" name="create_tags" value="1" />
          <span>Crear tags automáticamente si no existen</span>
        </label>
        <button type="submit" class="btn btn-primary btn-sm">Previsualizar importación</button>
      </form>`;

  return `<div class="tv-contacts-modal" id="tv-contacts-quick-modal" role="dialog" aria-modal="true" aria-labelledby="tv-contacts-modal-title" aria-hidden="true">
    <div class="tv-contacts-modal__backdrop" data-tv-contacts-close tabindex="-1"></div>
    <div class="tv-contacts-modal__panel">
      <header class="tv-contacts-modal__head">
        <div>
          <h2 class="tv-section-head__title" id="tv-contacts-modal-title">Gestión rápida</h2>
          <p class="tv-section-head__sub">Crea agendas, contactos o importa desde planilla</p>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-tv-contacts-close aria-label="Cerrar">✕</button>
      </header>
      <nav class="tv-contacts-modal__tabs" role="tablist" aria-label="Acciones de contactos">
        <button type="button" class="tv-contacts-modal__tab" role="tab" data-tv-contacts-tab="contact" aria-selected="false" aria-controls="tv-contacts-pane-contact">Contacto</button>
        <button type="button" class="tv-contacts-modal__tab" role="tab" data-tv-contacts-tab="agenda" aria-selected="false" aria-controls="tv-contacts-pane-agenda">Agenda</button>
        <button type="button" class="tv-contacts-modal__tab" role="tab" data-tv-contacts-tab="import" aria-selected="false" aria-controls="tv-contacts-pane-import">Importar</button>
      </nav>
      <div class="tv-contacts-modal__body">
        <div class="tv-contacts-modal__pane" id="tv-contacts-pane-contact" role="tabpanel" hidden>
          <form method="post" action="/app/contacts" id="tv-contacts-form-contact">
            ${renderFilterField("Nombre visible", `<input type="text" name="display_name" class="tv-filter-input" placeholder="Ej. Juan Pérez" required />`)}
            ${renderFilterField("Teléfono", `<input type="tel" name="phone" class="tv-filter-input" placeholder="+56912345678" required />`)}
            ${renderFilterField("Email", `<input type="email" name="email" class="tv-filter-input" placeholder="opcional" />`)}
            ${renderFilterField("Agenda", `<select name="list_id" class="tv-filter-input">${listOpts}</select>`)}
            ${renderFilterField("Notas", `<input type="text" name="notes" class="tv-filter-input" placeholder="opcional" />`)}
          </form>
        </div>
        <div class="tv-contacts-modal__pane" id="tv-contacts-pane-agenda" role="tabpanel" hidden>
          <form method="post" action="/app/contacts/lists" id="tv-contacts-form-agenda">
            ${renderFilterField("Nombre", `<input type="text" name="name" class="tv-filter-input" placeholder="Ej. Clientes VIP" required />`)}
            ${renderFilterField("Descripción", `<input type="text" name="description" class="tv-filter-input" placeholder="opcional" />`)}
            ${renderFilterField("Color", `<input type="text" name="color" class="tv-filter-input" placeholder="#0052CC opcional" />`)}
          </form>
        </div>
        <div class="tv-contacts-modal__pane" id="tv-contacts-pane-import" role="tabpanel" hidden>
          ${importPane}
        </div>
      </div>
      <footer class="tv-contacts-modal__foot" id="tv-contacts-modal-foot">
        <button type="button" class="btn btn-ghost" data-tv-contacts-close>Cancelar</button>
        <button type="submit" form="tv-contacts-form-contact" class="btn btn-primary" data-tv-contacts-submit="contact">Guardar contacto</button>
        <button type="submit" form="tv-contacts-form-agenda" class="btn btn-primary" data-tv-contacts-submit="agenda" hidden>Guardar agenda</button>
      </footer>
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
      return `<a href="${href}" class="tv-contacts-agenda${active ? " tv-contacts-agenda--active" : ""}">
        <div class="tv-contacts-agenda__head">
          <strong class="tv-contacts-agenda__name">${escapeHtml(a.name)}</strong>
          <span class="badge badge-muted">${a.contacts_count} contacto${a.contacts_count === 1 ? "" : "s"}</span>
        </div>
        ${a.description ? `<p class="tv-contacts-agenda__desc">${escapeHtml(a.description)}</p>` : ""}
      </a>`;
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
        <button type="button" class="btn btn-secondary btn-sm" data-tv-contacts-open data-tv-contacts-tab="agenda">
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
        <button type="button" class="btn btn-primary" data-tv-contacts-open data-tv-contacts-tab="contact">Nuevo contacto</button>
        <button type="button" class="btn btn-secondary" data-tv-contacts-open data-tv-contacts-tab="agenda">Nueva agenda</button>
        <button type="button" class="btn btn-ghost" data-tv-contacts-open data-tv-contacts-tab="import">Importar planilla</button>
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
        <button type="button" class="btn btn-secondary btn-sm" data-tv-contacts-open data-tv-contacts-tab="contact">Crear contacto</button>
      </div>
    </div>
  </section>`;
}

export function renderAppContactsPage(
  ctx: AppPageContext,
  data: AppContactsPageData,
): string {
  const { module, filters, contacts, lists, summary } = data;
  const initialTab = data.initialModalTab ?? "contact";

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
        ? `<button type="button" class="btn btn-primary" data-tv-contacts-open data-tv-contacts-tab="contact">
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
    ${module.available ? contactsQuickModal(lists, data.importPreview) : ""}
    <script>
      (function(){
        var modal = document.getElementById("tv-contacts-quick-modal");
        var foot = document.getElementById("tv-contacts-modal-foot");
        var submitContact = foot && foot.querySelector('[data-tv-contacts-submit="contact"]');
        var submitAgenda = foot && foot.querySelector('[data-tv-contacts-submit="agenda"]');
        var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-tv-contacts-tab]"));
        var panes = {
          contact: document.getElementById("tv-contacts-pane-contact"),
          agenda: document.getElementById("tv-contacts-pane-agenda"),
          import: document.getElementById("tv-contacts-pane-import")
        };
        var activeTab = ${JSON.stringify(initialTab)};

        function switchTab(name){
          activeTab = name;
          tabs.forEach(function(t){
            var on = t.getAttribute("data-tv-contacts-tab") === name;
            if(t.getAttribute("role") === "tab") t.setAttribute("aria-selected", on ? "true" : "false");
          });
          Object.keys(panes).forEach(function(k){
            if(panes[k]) panes[k].hidden = k !== name;
          });
          if(submitContact) submitContact.hidden = name !== "contact";
          if(submitAgenda) submitAgenda.hidden = name !== "agenda";
          if(foot) foot.hidden = name === "import";
        }

        function openModal(tab){
          if(!modal) return;
          switchTab(tab || "contact");
          modal.setAttribute("aria-hidden", "false");
          document.body.style.overflow = "hidden";
        }

        function closeModal(){
          if(!modal) return;
          modal.setAttribute("aria-hidden", "true");
          document.body.style.overflow = "";
        }

        document.querySelectorAll("[data-tv-contacts-open]").forEach(function(btn){
          btn.addEventListener("click", function(){
            openModal(btn.getAttribute("data-tv-contacts-tab") || "contact");
          });
        });
        modal && modal.querySelectorAll("[data-tv-contacts-close]").forEach(function(btn){
          btn.addEventListener("click", closeModal);
        });
        tabs.filter(function(t){ return t.getAttribute("role") === "tab"; }).forEach(function(tab){
          tab.addEventListener("click", function(){
            switchTab(tab.getAttribute("data-tv-contacts-tab") || "contact");
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
            window.location.href = "/app/contacts?new=import";
          });
        }

        var params = new URLSearchParams(window.location.search);
        var openTab = params.get("new");
        if(openTab === "contact" || openTab === "agenda" || openTab === "import") openModal(openTab);
        else if(params.get("import_job")) openModal("import");
        else if(${JSON.stringify(Boolean(data.initialModalTab))}) openModal(activeTab);

        if(openTab || params.get("import_job")){
          params.delete("new");
          params.delete("import_job");
          var qs = params.toString();
          history.replaceState({}, "", "/app/contacts" + (qs ? "?" + qs : ""));
        }

        switchTab(activeTab);
      })();
    </script>`;

  return wrapAppPage(ctx, "contacts", "Contactos", body);
}
