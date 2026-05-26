import type {
  ContactListWithCount,
  ContactSource,
  ContactStatus,
  ContactSummary,
  ContactTagRow,
  ContactWithListsAndTags,
  ContactsModuleState,
} from "../../types/contacts.js";
import { escapeHtml, formatDate } from "../../utils/html.js";
import { renderKpiCard, renderQuickAction } from "../admin-ui/components.js";
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

export type AppContactsPageData = {
  module: ContactsModuleState;
  filters: ContactsPageFilters;
  contacts: ContactWithListsAndTags[];
  lists: ContactListWithCount[];
  tags: ContactTagRow[];
  summary: ContactSummary;
  showNewContact: boolean;
  showNewList: boolean;
  showNewTag: boolean;
};

const SOURCE_LABELS: Record<ContactSource, string> = {
  manual: "Manual",
  import: "Importación",
  api: "API",
  web: "Web",
};

function parseIsoDateOnly(v: string | undefined): string | undefined {
  const s = (v ?? "").trim();
  if (!s) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
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

function badge(cls: string, label: string): string {
  return `<span class="badge badge-${escapeHtml(cls)}">${escapeHtml(label)}</span>`;
}

function statusBadge(status: ContactStatus): string {
  if (status === "active") return badge("ok", "Activo");
  if (status === "incomplete") return badge("warn", "Incompleto");
  if (status === "blocked") return badge("err", "Bloqueado");
  if (status === "opt_out") return badge("muted", "Opt-out");
  return badge("muted", "Duplicado");
}

function migrationBanner(): string {
  return `<div class="alert alert-warn" role="status">
    <strong>Módulo Contactos pendiente de migración.</strong>
    Aplica <code>supabase/migrations/023_contacts.sql</code> en tu entorno para habilitar datos reales.
  </div>`;
}

function kpis(summary: ContactSummary): string {
  return `<div class="tv-kpi-grid tv-kpi-grid--client tv-kpi-grid--report">
      ${renderKpiCard({
        label: "Total contactos",
        value: String(summary.totalContacts),
        hint: "Base total en tu cuenta",
        icon: "contacts",
        variant: "primary",
      })}
      ${renderKpiCard({
        label: "Agendas activas",
        value: String(summary.activeLists),
        hint: "Listas disponibles",
        icon: "folder",
        variant: "default",
      })}
      ${renderKpiCard({
        label: "Contactos válidos",
        value: String(summary.validContacts),
        hint: "Activos sin opt-out",
        icon: "check_circle",
        variant: "success",
      })}
      ${renderKpiCard({
        label: "Tags activos",
        value: String(summary.activeTags),
        hint: "Etiquetas en tu empresa",
        icon: "label",
        variant: "default",
      })}
      ${renderKpiCard({
        label: "Importados (mes)",
        value: String(summary.importedThisMonth),
        hint: "Alta por CSV este mes",
        icon: "upload_file",
        variant: "default",
      })}
      ${renderKpiCard({
        label: "Bloqueados / opt-out",
        value: String(summary.blockedOrOptOut),
        hint: "No aptos para campaña",
        icon: "block",
        variant: summary.blockedOrOptOut > 0 ? "danger" : "default",
      })}
      ${renderKpiCard({
        label: "Última actualización",
        value: summary.lastUpdatedAt ? formatDate(summary.lastUpdatedAt) : "—",
        hint: "Último cambio en contactos",
        icon: "update",
        variant: "default",
      })}
    </div>`;
}

function quickActions(): string {
  return `<section class="tv-panel">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Gestión rápida</h2>
      <p class="tv-section-head__sub">Accesos rápidos para mantener tu base al día</p>
    </header>
    <div class="tv-panel__body">
      <div class="tv-contacts-quick-grid">
        ${renderQuickAction({ href: "/app/contacts?new=contact", label: "Crear contacto", description: "Alta manual", icon: "person_add" })}
        ${renderQuickAction({ href: "/app/contacts?new=agenda", label: "Crear agenda", description: "Organiza por audiencia", icon: "create_new_folder" })}
        ${renderQuickAction({ href: "/app/contacts/import", label: "Importar CSV", description: "Con vista previa", icon: "upload_file" })}
        ${renderQuickAction({ href: "/app/send-sms", label: "Crear campaña", description: "Envío SMS (sin audiencia aún)", icon: "campaign" })}
      </div>
    </div>
  </section>`;
}

function createContactForm(lists: ContactListWithCount[]): string {
  const listOpts = [
    `<option value="">Sin agenda (opcional)</option>`,
    ...lists.map(
      (a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`,
    ),
  ].join("");

  return `<section class="tv-panel" id="nuevo-contacto">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Nuevo contacto</h2>
    </header>
    <div class="tv-panel__body">
      <form method="post" action="/app/contacts" class="tv-dlr-report__filters-form">
        <div class="tv-dlr-report__filters-grid tv-contacts__filters-grid">
          ${renderFilterField("Nombre visible", `<input type="text" name="display_name" class="tv-filter-input" placeholder="Ej. Juan Pérez" required />`)}
          ${renderFilterField("Teléfono", `<input type="tel" name="phone" class="tv-filter-input" placeholder="+56912345678" required />`)}
          ${renderFilterField("Email", `<input type="email" name="email" class="tv-filter-input" placeholder="opcional" />`)}
          ${renderFilterField("Agenda", `<select name="list_id" class="tv-filter-input">${listOpts}</select>`)}
          ${renderFilterField("Notas", `<input type="text" name="notes" class="tv-filter-input" placeholder="opcional" />`)}
          <div class="tv-dlr-report__filter-actions">
            <button type="submit" class="btn btn-primary btn-sm">Guardar contacto</button>
            <a class="btn btn-ghost btn-sm" href="/app/contacts">Cancelar</a>
          </div>
        </div>
      </form>
    </div>
  </section>`;
}

function createTagForm(): string {
  return `<section class="tv-panel" id="nuevo-tag">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Nuevo tag</h2>
    </header>
    <div class="tv-panel__body">
      <form method="post" action="/app/contacts/tags" class="tv-dlr-report__filters-form">
        <div class="tv-dlr-report__filters-grid tv-contacts__filters-grid">
          ${renderFilterField("Nombre", `<input type="text" name="name" class="tv-filter-input" placeholder="Ej. VIP" required />`)}
          ${renderFilterField("Color", `<input type="text" name="color" class="tv-filter-input" placeholder="#0052CC opcional" />`)}
          <div class="tv-dlr-report__filter-actions">
            <button type="submit" class="btn btn-primary btn-sm">Guardar tag</button>
            <a class="btn btn-ghost btn-sm" href="/app/contacts">Cancelar</a>
          </div>
        </div>
      </form>
    </div>
  </section>`;
}

function tagsPanel(tags: ContactTagRow[]): string {
  const chips = tags.length
    ? tags
        .map(
          (t) =>
            `<span class="tv-tag" style="${t.color ? `border-color:${escapeHtml(t.color)}` : ""}">${escapeHtml(t.name)}</span>`,
        )
        .join("")
    : `<p class="field-hint" style="margin:0">Aún no tienes tags.</p>`;

  return `<section class="tv-panel">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Tags</h2>
      <p class="tv-section-head__sub">Etiqueta contactos para segmentar audiencias</p>
    </header>
    <div class="tv-panel__body">
      <div class="tv-tags" style="margin-bottom:0.75rem">${chips}</div>
      <a class="btn btn-secondary btn-sm" href="/app/contacts?new=tag">
        <span class="material-symbols-outlined" aria-hidden="true">label</span>
        Nuevo tag
      </a>
    </div>
  </section>`;
}

function createListForm(): string {
  return `<section class="tv-panel" id="nueva-agenda">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Nueva agenda</h2>
    </header>
    <div class="tv-panel__body">
      <form method="post" action="/app/contacts/lists" class="tv-dlr-report__filters-form">
        <div class="tv-dlr-report__filters-grid tv-contacts__filters-grid">
          ${renderFilterField("Nombre", `<input type="text" name="name" class="tv-filter-input" placeholder="Ej. Clientes VIP" required />`)}
          ${renderFilterField("Descripción", `<input type="text" name="description" class="tv-filter-input" placeholder="opcional" />`)}
          ${renderFilterField("Color", `<input type="text" name="color" class="tv-filter-input" placeholder="#0052CC opcional" />`)}
          <div class="tv-dlr-report__filter-actions">
            <button type="submit" class="btn btn-primary btn-sm">Guardar agenda</button>
            <a class="btn btn-ghost btn-sm" href="/app/contacts">Cancelar</a>
          </div>
        </div>
      </form>
    </div>
  </section>`;
}

function filtersPanel(
  lists: ContactListWithCount[],
  tags: ContactTagRow[],
  filters: ContactsPageFilters,
): string {
  const agendaOpts = [
    `<option value="">Todas las agendas</option>`,
    ...lists.map((a) => {
      const on = filters.agenda === a.id;
      return `<option value="${escapeHtml(a.id)}"${on ? " selected" : ""}>${escapeHtml(a.name)}</option>`;
    }),
  ].join("");

  const tagOpts = [
    `<option value="">Todos los tags</option>`,
    ...tags.map((t) => {
      const on = filters.tag === t.id;
      return `<option value="${escapeHtml(t.id)}"${on ? " selected" : ""}>${escapeHtml(t.name)}</option>`;
    }),
  ].join("");

  const status = (filters.status ?? "").trim();
  const statusOpts = [
    ["", "Todos"],
    ["active", "Activo"],
    ["incomplete", "Incompleto"],
    ["blocked", "Bloqueado"],
    ["duplicate", "Duplicado"],
    ["opt_out", "Opt-out"],
  ]
    .map(([v, label]) => {
      const on = v === status;
      return `<option value="${escapeHtml(v)}"${on ? " selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");

  const source = (filters.source ?? "").trim();
  const sourceOpts = [
    ["", "Todos"],
    ["manual", "Manual"],
    ["import", "Importación"],
    ["api", "API"],
    ["web", "Web"],
  ]
    .map(([v, label]) => {
      const on = v === source;
      return `<option value="${escapeHtml(v)}"${on ? " selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");

  return `
    <section class="tv-panel tv-dlr-report__filters-panel">
      <header class="tv-section-head tv-dlr-report__filters-head">
        <h2 class="tv-section-head__title">Filtros de búsqueda</h2>
        <p class="tv-section-head__sub">Busca por nombre/teléfono y filtra por agenda, tags, estado u origen</p>
      </header>
      <div class="tv-panel__body tv-dlr-report__filters-body">
        <form method="get" action="/app/contacts" class="tv-dlr-report__filters-form">
          <div class="tv-dlr-report__filters-grid tv-contacts__filters-grid">
            ${renderFilterField("Buscar", `<input type="text" name="q" class="tv-filter-input" placeholder="Nombre o teléfono" value="${escapeHtml(filters.q ?? "")}" />`)}
            ${renderFilterField("Agenda", `<select name="agenda" class="tv-filter-input">${agendaOpts}</select>`)}
            ${renderFilterField("Tag", `<select name="tag" class="tv-filter-input">${tagOpts}</select>`)}
            ${renderFilterField("Estado", `<select name="status" class="tv-filter-input">${statusOpts}</select>`)}
            ${renderFilterField("Origen", `<select name="source" class="tv-filter-input">${sourceOpts}</select>`)}
            ${renderFilterField("Desde", `<input type="date" name="start_date" class="tv-filter-input" value="${escapeHtml(filters.startDate ?? "")}" />`)}
            ${renderFilterField("Hasta", `<input type="date" name="end_date" class="tv-filter-input" value="${escapeHtml(filters.endDate ?? "")}" />`)}
            <div class="tv-dlr-report__filter-actions">
              <button type="submit" class="btn btn-primary btn-sm">Buscar</button>
              <a class="btn btn-ghost btn-sm" href="/app/contacts">Limpiar filtros</a>
            </div>
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
        <p class="tv-contacts-agenda__desc">${escapeHtml(a.description ?? "")}</p>
        <p class="tv-contacts-agenda__meta">Actualizada: ${escapeHtml(formatDate(a.updated_at))}</p>
      </a>`;
    })
    .join("");

  const emptyLists =
  lists.length === 0
    ? `<p class="field-hint" style="margin:0 0 0.75rem">Aún no tienes agendas. Crea la primera para organizar contactos.</p>`
    : "";

  return `<section class="tv-panel tv-contacts-agendas">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Agendas</h2>
      <p class="tv-section-head__sub">Organiza contactos por audiencia</p>
    </header>
    <div class="tv-panel__body">
      ${emptyLists}
      <div class="tv-contacts-agendas__list">${cards}</div>
      <div class="tv-contacts-agendas__cta">
        <a class="btn btn-secondary btn-sm" href="/app/contacts?new=agenda">
          <span class="material-symbols-outlined" aria-hidden="true">create_new_folder</span>
          Nueva agenda
        </a>
      </div>
    </div>
  </section>`;
}

function tagsCell(tagNames: string[]): string {
  if (!tagNames.length) return `<span class="field-hint">—</span>`;
  const items = tagNames
    .slice(0, 4)
    .map((t) => `<span class="tv-tag">${escapeHtml(t)}</span>`)
    .join("");
  const more =
    tagNames.length > 4
      ? `<span class="tv-tag tv-tag--muted">+${tagNames.length - 4}</span>`
      : "";
  return `<div class="tv-tags">${items}${more}</div>`;
}

function listsCell(listNames: string[]): string {
  if (!listNames.length) return `<span class="field-hint">—</span>`;
  return escapeHtml(listNames.join(", "));
}

function contactsTable(
  rows: ContactWithListsAndTags[],
  filters: ContactsPageFilters,
  lists: ContactListWithCount[],
  tags: ContactTagRow[],
): string {
  const empty =
    rows.length === 0
      ? `<tr><td colspan="9" class="tv-table-empty">No hay contactos con los filtros aplicados.</td></tr>`
      : rows
          .map((c) => {
            return `<tr>
              <td><input type="checkbox" class="tv-contacts-check" data-id="${escapeHtml(c.id)}" aria-label="Seleccionar contacto" /></td>
              <td><strong>${escapeHtml(c.display_name)}</strong></td>
              <td><code>${escapeHtml(c.phone)}</code></td>
              <td>${listsCell(c.list_names)}</td>
              <td>${tagsCell(c.tag_names)}</td>
              <td>${statusBadge(c.status)}</td>
              <td>${escapeHtml(SOURCE_LABELS[c.source] ?? c.source)}</td>
              <td class="tv-contacts-date">${escapeHtml(formatDate(c.updated_at))}</td>
              <td class="tv-contacts-actions">
                <button type="button" class="btn btn-ghost btn-sm" disabled title="Próximamente">Ver</button>
                <button type="button" class="btn btn-secondary btn-sm" disabled title="Próximamente">Editar</button>
              </td>
            </tr>`;
          })
          .join("");

  const anyFilter = Boolean(
    (filters.q ?? "").trim() ||
      (filters.agenda ?? "").trim() ||
      (filters.tag ?? "").trim() ||
      (filters.status ?? "").trim() ||
      (filters.source ?? "").trim() ||
      (filters.startDate ?? "").trim() ||
      (filters.endDate ?? "").trim(),
  );

  const qs = queryStringFromFilters(filters);
  const listOpts =
    `<option value="">Selecciona agenda</option>` +
    lists
      .map((l) => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`)
      .join("");
  const tagOpts =
    `<option value="">Selecciona tag</option>` +
    tags
      .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`)
      .join("");

  const bulkBar = `<div class="tv-contacts-bulk" data-tv-bulk hidden>
    <div class="tv-contacts-bulk__left">
      <strong data-tv-bulk-count>0</strong> seleccionados
    </div>
    <div class="tv-contacts-bulk__right">
      <form method="post" action="/app/contacts/bulk/move-list" class="tv-contacts-bulk-form" style="display:inline-flex;gap:0.35rem;align-items:center">
        <input type="hidden" name="contact_ids" value="" data-tv-bulk-ids />
        <select name="list_id" class="tv-filter-input" style="min-width:140px" required>${listOpts}</select>
        <button type="submit" class="btn btn-secondary btn-sm">Mover a agenda</button>
      </form>
      <form method="post" action="/app/contacts/bulk/assign-tag" class="tv-contacts-bulk-form" style="display:inline-flex;gap:0.35rem;align-items:center">
        <input type="hidden" name="contact_ids" value="" data-tv-bulk-ids />
        <select name="tag_id" class="tv-filter-input" style="min-width:120px" required>${tagOpts}</select>
        <button type="submit" class="btn btn-secondary btn-sm">Asignar tag</button>
      </form>
      <form method="post" action="/app/contacts/bulk/status" class="tv-contacts-bulk-form" style="display:inline-flex;gap:0.35rem;align-items:center">
        <input type="hidden" name="contact_ids" value="" data-tv-bulk-ids />
        <input type="hidden" name="status" value="blocked" />
        <button type="submit" class="btn btn-ghost btn-sm">Bloquear</button>
      </form>
      <button type="button" class="btn btn-ghost btn-sm" disabled title="Próximamente">Exportar CSV</button>
      <button type="button" class="btn btn-primary btn-sm" disabled title="Próximamente — sin campaña real">Usar en campaña</button>
    </div>
  </div>`;

  return `<div class="tv-dash-block tv-contacts-table-block">
    <div class="tv-dash-block__head">
      <h2 class="tv-dash-block__title">Contactos</h2>
      <span class="tv-contacts-table-block__meta">
        ${rows.length} registro${rows.length === 1 ? "" : "s"} ·
        ${anyFilter ? `<a href="/app/contacts" class="tv-dash-block__link">Quitar filtros</a>` : `<a href="/app/contacts${qs}" class="tv-dash-block__link">Actualizar</a>`}
      </span>
    </div>
    ${bulkBar}
    <section class="tv-panel tv-client-dash-table-panel">
      <div class="tv-client-dash-table-inner">
        <div class="table-wrap tv-contacts-table-wrap">
          <table class="tv-table tv-table--dash tv-contacts-table">
            <thead><tr>
              <th style="width:36px"><span class="field-hint">Sel.</span></th>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th>Agenda</th>
              <th>Tags</th>
              <th>Estado</th>
              <th>Origen</th>
              <th>Últ. actualización</th>
              <th>Acciones</th>
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
        ${renderBtn("Nuevo contacto", { href: "/app/contacts?new=contact", variant: "primary" })}
        ${renderBtn("Nueva agenda", { href: "/app/contacts?new=agenda", variant: "secondary" })}
        ${renderBtn("Importar CSV", { href: "/app/contacts/import", variant: "ghost" })}
      </div>
      <p class="field-hint" style="margin-top:0.75rem">La importación CSV estará disponible en una próxima etapa.</p>
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
        ${renderBtn("Crear contacto", { href: "/app/contacts?new=contact", variant: "secondary" })}
      </div>
    </div>
  </section>`;
}

export function renderAppContactsPage(
  ctx: AppPageContext,
  data: AppContactsPageData,
): string {
  const { module, filters, contacts, lists, tags, summary } = data;

  const anyFilter = Boolean(
    (filters.q ?? "").trim() ||
      (filters.agenda ?? "").trim() ||
      (filters.tag ?? "").trim() ||
      (filters.status ?? "").trim() ||
      (filters.source ?? "").trim() ||
      (filters.startDate ?? "").trim() ||
      (filters.endDate ?? "").trim(),
  );

  const showTable = module.available && (contacts.length > 0 || anyFilter);
  const showEmptyReal =
    module.available && summary.totalContacts === 0 && !anyFilter;
  const showNoResults =
    module.available && summary.totalContacts > 0 && contacts.length === 0 && anyFilter;

  const body = `
    <div class="tv-contacts tv-client-dashboard tv-dlr-report">
    ${module.migrationPending ? migrationBanner() : ""}
    ${renderPageHeader({
      title: "Contactos",
      subtitle: "Organiza tus contactos y agendas para campañas SMS.",
      actions: [
        renderBtn("Nuevo contacto", { href: "/app/contacts?new=contact", variant: "primary", icon: "person_add" }),
        renderBtn("Nueva agenda", { href: "/app/contacts?new=agenda", variant: "secondary", icon: "create_new_folder" }),
        renderBtn("Importar CSV", { href: "/app/contacts/import", variant: "ghost", icon: "upload_file" }),
      ].join(" "),
    })}
    ${module.available ? kpis(summary) : ""}
    ${module.available ? quickActions() : ""}
    ${data.showNewContact && module.available ? createContactForm(lists) : ""}
    ${data.showNewList && module.available ? createListForm() : ""}
    ${data.showNewTag && module.available ? createTagForm() : ""}
    ${module.available ? filtersPanel(lists, tags, filters) : ""}
    ${module.available ? `<div class="tv-dash-grid tv-dash-grid--2 tv-contacts-grid">${agendaPanel(lists, filters.agenda)}${tagsPanel(tags)}</div>` : ""}
    <div>
      ${showEmptyReal ? emptyStateReal() : ""}
      ${showNoResults ? noResultsState() : ""}
      ${showTable ? contactsTable(contacts, filters, lists, tags) : ""}
    </div>
    </div>
    <script>
      (function(){
        var checks = Array.prototype.slice.call(document.querySelectorAll('.tv-contacts-check'));
        var bulk = document.querySelector('[data-tv-bulk]');
        var countEl = document.querySelector('[data-tv-bulk-count]');
        var bulkForms = Array.prototype.slice.call(document.querySelectorAll('.tv-contacts-bulk-form'));
        function selectedIds(){
          return checks.filter(function(c){ return c && c.checked; }).map(function(c){ return c.getAttribute('data-id'); }).filter(Boolean);
        }
        function update(){
          if(!bulk || !countEl) return;
          var ids = selectedIds();
          countEl.textContent = String(ids.length);
          bulk.hidden = ids.length === 0;
          var joined = ids.join(',');
          bulkForms.forEach(function(f){
            var hid = f.querySelector('[data-tv-bulk-ids]');
            if(hid) hid.value = joined;
          });
        }
        checks.forEach(function(c){ c.addEventListener('change', update); });
        bulkForms.forEach(function(f){
          f.addEventListener('submit', function(ev){
            if(!selectedIds().length){ ev.preventDefault(); alert('Selecciona al menos un contacto.'); }
          });
        });
      })();
    </script>`;

  return wrapAppPage(ctx, "contacts", "Contactos", body);
}
