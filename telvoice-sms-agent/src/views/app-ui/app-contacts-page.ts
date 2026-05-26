import { escapeHtml, formatDate } from "../../utils/html.js";
import { renderKpiCard, renderQuickAction } from "../admin-ui/components.js";
import { renderBtn, renderFilterField, renderPageHeader } from "../admin-ui/page-kit.js";
import type { AppPageContext } from "./app-page-wrap.js";
import { wrapAppPage } from "./app-page-wrap.js";

type ContactStatus = "active" | "incomplete" | "blocked" | "duplicate";

type ContactRow = {
  id: string;
  agendaId: string;
  agendaName: string;
  fullName: string;
  phone: string;
  tags: string[];
  status: ContactStatus;
  updatedAt: string;
  createdAt: string;
};

type AgendaRow = {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
};

export type ContactsPageFilters = {
  q?: string;
  agenda?: string;
  tag?: string;
  status?: ContactStatus | "";
  startDate?: string;
  endDate?: string;
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
  const allowed: ContactStatus[] = ["active", "incomplete", "blocked", "duplicate"];
  const safeStatus = status && allowed.includes(status) ? status : undefined;

  return {
    q: str("q"),
    agenda: str("agenda"),
    tag: str("tag"),
    status: safeStatus ?? "",
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
  return badge("muted", "Duplicado");
}

function mockAgendas(): AgendaRow[] {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  return [
    {
      id: "agenda_vip",
      name: "VIP",
      description: "Clientes con alta recurrencia y prioridad comercial.",
      updatedAt: iso(new Date(now.getTime() - 1000 * 60 * 60 * 20)),
    },
    {
      id: "agenda_frecuentes",
      name: "Clientes frecuentes",
      description: "Audiencia activa para campañas mensuales.",
      updatedAt: iso(new Date(now.getTime() - 1000 * 60 * 60 * 26)),
    },
    {
      id: "agenda_prospectos",
      name: "Prospectos",
      description: "Leads a convertir; foco en onboarding.",
      updatedAt: iso(new Date(now.getTime() - 1000 * 60 * 60 * 50)),
    },
    {
      id: "agenda_cobranza",
      name: "Cobranza",
      description: "Recordatorios y avisos operacionales.",
      updatedAt: iso(new Date(now.getTime() - 1000 * 60 * 60 * 70)),
    },
  ];
}

function mockContacts(agendas: AgendaRow[]): ContactRow[] {
  const byId = new Map(agendas.map((a) => [a.id, a] as const));
  const now = new Date();
  const iso = (t: number) => new Date(now.getTime() - t).toISOString();
  const mk = (c: Omit<ContactRow, "agendaName">): ContactRow => ({
    ...c,
    agendaName: byId.get(c.agendaId)?.name ?? "—",
  });

  return [
    mk({
      id: "c_juan",
      agendaId: "agenda_frecuentes",
      fullName: "Juan Pérez",
      phone: "+569 7123 4567",
      tags: ["retail", "campaña mayo"],
      status: "active",
      createdAt: iso(1000 * 60 * 60 * 24 * 22),
      updatedAt: iso(1000 * 60 * 60 * 12),
    }),
    mk({
      id: "c_maria",
      agendaId: "agenda_prospectos",
      fullName: "María Soto",
      phone: "+569 7988 1122",
      tags: ["leads", "vip"],
      status: "incomplete",
      createdAt: iso(1000 * 60 * 60 * 24 * 10),
      updatedAt: iso(1000 * 60 * 60 * 36),
    }),
    mk({
      id: "c_demo_empresa",
      agendaId: "agenda_vip",
      fullName: "Empresa Demo Telvoice",
      phone: "+56 9 6000 0000",
      tags: ["soporte", "vip"],
      status: "active",
      createdAt: iso(1000 * 60 * 60 * 24 * 120),
      updatedAt: iso(1000 * 60 * 20),
    }),
    mk({
      id: "c_bloq",
      agendaId: "agenda_cobranza",
      fullName: "Contacto Bloqueado",
      phone: "+569 7000 0001",
      tags: ["cobranza"],
      status: "blocked",
      createdAt: iso(1000 * 60 * 60 * 24 * 60),
      updatedAt: iso(1000 * 60 * 60 * 24 * 8),
    }),
    mk({
      id: "c_dup",
      agendaId: "agenda_prospectos",
      fullName: "Juan Pérez (2)",
      phone: "+569 7123 4567",
      tags: ["leads"],
      status: "duplicate",
      createdAt: iso(1000 * 60 * 60 * 24 * 6),
      updatedAt: iso(1000 * 60 * 60 * 24 * 2),
    }),
  ];
}

function inRangeIso(createdAt: string, start?: string, end?: string): boolean {
  if (!start && !end) return true;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return true;
  if (start) {
    const from = Date.parse(`${start}T00:00:00.000Z`);
    if (t < from) return false;
  }
  if (end) {
    const to = Date.parse(`${end}T23:59:59.999Z`);
    if (t > to) return false;
  }
  return true;
}

function applyFilters(rows: ContactRow[], filters: ContactsPageFilters): ContactRow[] {
  const q = (filters.q ?? "").trim().toLowerCase();
  const agenda = (filters.agenda ?? "").trim();
  const tag = (filters.tag ?? "").trim().toLowerCase();
  const status = (filters.status ?? "").trim();

  return rows.filter((r) => {
    if (q) {
      const hay = `${r.fullName} ${r.phone}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (agenda && r.agendaId !== agenda) return false;
    if (tag) {
      const has = r.tags.some((t) => t.toLowerCase() === tag);
      if (!has) return false;
    }
    if (status && r.status !== status) return false;
    if (!inRangeIso(r.createdAt, filters.startDate, filters.endDate)) return false;
    return true;
  });
}

function kpis(all: ContactRow[], agendas: AgendaRow[]): string {
  const total = all.length;
  const agendasActive = agendas.length;
  const withTags = all.filter((c) => c.tags.length > 0).length;
  const ready = all.filter((c) => c.status === "active").length;

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const importedThisMonth = all.filter((c) => {
    const d = new Date(c.createdAt);
    return d.getMonth() === month && d.getFullYear() === year;
  }).length;

  const lastUpdated = all
    .map((c) => c.updatedAt)
    .sort()
    .at(-1);

  return `<div class="tv-kpi-grid tv-kpi-grid--client tv-kpi-grid--report">
      ${renderKpiCard({ label: "Total contactos", value: String(total), hint: "Base total en tu cuenta", icon: "contacts", variant: "primary" })}
      ${renderKpiCard({ label: "Agendas activas", value: String(agendasActive), hint: "Listas disponibles", icon: "folder", variant: "default" })}
      ${renderKpiCard({ label: "Con tags", value: String(withTags), hint: "Listos para segmentar", icon: "sell", variant: "success" })}
      ${renderKpiCard({ label: "Listos campaña", value: String(ready), hint: "Estado activo", icon: "check_circle", variant: "success" })}
      ${renderKpiCard({ label: "Importados este mes", value: String(importedThisMonth), hint: "Nuevos registros", icon: "upload", variant: "warn" })}
      ${renderKpiCard({ label: "Última actualización", value: lastUpdated ? formatDate(lastUpdated) : "—", hint: "Último cambio detectado", icon: "update", variant: "default" })}
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
        ${renderQuickAction({ href: "/app/contacts?new=contact", label: "Crear contacto", description: "Alta manual (próximamente)", icon: "person_add" })}
        ${renderQuickAction({ href: "/app/contacts?new=agenda", label: "Crear agenda", description: "Organiza por audiencia", icon: "create_new_folder" })}
        ${renderQuickAction({ href: "/app/contacts?import=1", label: "Importar CSV", description: "Carga masiva (próximamente)", icon: "upload_file" })}
        ${renderQuickAction({ href: "/app/contacts?export=1", label: "Exportar", description: "Descarga tu base", icon: "download" })}
        ${renderQuickAction({ href: "/app/send-sms", label: "Crear campaña", description: "Usa contactos para enviar", icon: "campaign" })}
      </div>
      <p class="field-hint" style="margin:0.75rem 0 0">La gestión completa (crear/editar/importar) se habilitará en próximas iteraciones. Esta pantalla ya deja preparada la UX.</p>
    </div>
  </section>`;
}

function filtersPanel(
  agendas: AgendaRow[],
  filters: ContactsPageFilters,
  availableTags: string[],
): string {
  const agendaOpts = [
    `<option value="">Todas las agendas</option>`,
    ...agendas.map((a) => {
      const on = filters.agenda === a.id;
      return `<option value="${escapeHtml(a.id)}"${on ? " selected" : ""}>${escapeHtml(a.name)}</option>`;
    }),
  ].join("");

  const tagOpts = [
    `<option value="">Todos los tags</option>`,
    ...availableTags.map((t) => {
      const on = (filters.tag ?? "").toLowerCase() === t.toLowerCase();
      return `<option value="${escapeHtml(t)}"${on ? " selected" : ""}>${escapeHtml(t)}</option>`;
    }),
  ].join("");

  const status = (filters.status ?? "").trim();
  const statusOpts = [
    ["", "Todos"],
    ["active", "Activo"],
    ["incomplete", "Incompleto"],
    ["blocked", "Bloqueado"],
    ["duplicate", "Duplicado"],
  ]
    .map(([v, label]) => {
      const on = v === status;
      return `<option value="${escapeHtml(v)}"${on ? " selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");

  return `
    <section class="tv-panel tv-dlr-report__filters-panel">
      <header class="tv-section-head tv-dlr-report__filters-head">
        <h2 class="tv-section-head__title">Filtros de búsqueda</h2>
        <p class="tv-section-head__sub">Busca por nombre/teléfono y filtra por agenda, tags y estado</p>
      </header>
      <div class="tv-panel__body tv-dlr-report__filters-body">
        <form method="get" action="/app/contacts" class="tv-dlr-report__filters-form">
          <div class="tv-dlr-report__filters-grid tv-contacts__filters-grid">
            ${renderFilterField("Buscar", `<input type="text" name="q" class="tv-filter-input" placeholder="Nombre o teléfono" value="${escapeHtml(filters.q ?? "")}" />`)}
            ${renderFilterField("Agenda", `<select name="agenda" class="tv-filter-input">${agendaOpts}</select>`)}
            ${renderFilterField("Tag", `<select name="tag" class="tv-filter-input">${tagOpts}</select>`)}
            ${renderFilterField("Estado", `<select name="status" class="tv-filter-input">${statusOpts}</select>`)}
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

function agendaPanel(agendas: AgendaRow[], selectedAgenda?: string): string {
  const cards = agendas
    .map((a) => {
      const active = selectedAgenda === a.id;
      const href = `/app/contacts?agenda=${encodeURIComponent(a.id)}`;
      return `<a href="${href}" class="tv-contacts-agenda${active ? " tv-contacts-agenda--active" : ""}">
        <div class="tv-contacts-agenda__head">
          <strong class="tv-contacts-agenda__name">${escapeHtml(a.name)}</strong>
          <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
        </div>
        <p class="tv-contacts-agenda__desc">${escapeHtml(a.description)}</p>
        <p class="tv-contacts-agenda__meta">Actualizada: ${escapeHtml(formatDate(a.updatedAt))}</p>
      </a>`;
    })
    .join("");

  return `<section class="tv-panel tv-contacts-agendas">
    <header class="tv-section-head" style="padding:1rem 1.25rem 0">
      <h2 class="tv-section-head__title">Agendas</h2>
      <p class="tv-section-head__sub">Organiza contactos por audiencia</p>
    </header>
    <div class="tv-panel__body">
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

function tagsCell(tags: string[]): string {
  if (!tags.length) return `<span class="field-hint">—</span>`;
  const items = tags
    .slice(0, 4)
    .map((t) => `<span class="tv-tag">${escapeHtml(t)}</span>`)
    .join("");
  const more = tags.length > 4 ? `<span class="tv-tag tv-tag--muted">+${tags.length - 4}</span>` : "";
  return `<div class="tv-tags">${items}${more}</div>`;
}

function contactsTable(rows: ContactRow[], filters: ContactsPageFilters): string {
  const empty =
    rows.length === 0
      ? `<tr><td colspan="8" class="tv-table-empty">No hay contactos con los filtros aplicados.</td></tr>`
      : rows
          .map((c) => {
            return `<tr>
              <td><input type="checkbox" class="tv-contacts-check" data-id="${escapeHtml(c.id)}" aria-label="Seleccionar contacto" /></td>
              <td><strong>${escapeHtml(c.fullName)}</strong></td>
              <td><code>${escapeHtml(c.phone)}</code></td>
              <td>${escapeHtml(c.agendaName)}</td>
              <td>${tagsCell(c.tags)}</td>
              <td>${statusBadge(c.status)}</td>
              <td class="tv-contacts-date">${escapeHtml(formatDate(c.updatedAt))}</td>
              <td class="tv-contacts-actions">
                <a class="btn btn-ghost btn-sm" href="/app/contacts?view=${encodeURIComponent(c.id)}">Ver</a>
                <a class="btn btn-secondary btn-sm" href="/app/contacts?edit=${encodeURIComponent(c.id)}">Editar</a>
              </td>
            </tr>`;
          })
          .join("");

  const anyFilter = Boolean(
    (filters.q ?? "").trim() ||
      (filters.agenda ?? "").trim() ||
      (filters.tag ?? "").trim() ||
      (filters.status ?? "").trim() ||
      (filters.startDate ?? "").trim() ||
      (filters.endDate ?? "").trim(),
  );

  const qs = queryStringFromFilters(filters);
  const bulkBar = `<div class="tv-contacts-bulk" data-tv-bulk hidden>
    <div class="tv-contacts-bulk__left">
      <strong data-tv-bulk-count>0</strong> seleccionados
      <span class="field-hint">· Acciones masivas (próximamente)</span>
    </div>
    <div class="tv-contacts-bulk__right">
      <button type="button" class="btn btn-secondary btn-sm" disabled>Mover a agenda</button>
      <button type="button" class="btn btn-secondary btn-sm" disabled>Asignar tag</button>
      <button type="button" class="btn btn-ghost btn-sm" disabled>Exportar</button>
      <a class="btn btn-primary btn-sm" href="/app/send-sms">Usar para campaña</a>
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
              <th>Últ. actualización</th>
              <th>Acciones</th>
            </tr></thead>
            <tbody>${empty}</tbody>
          </table>
        </div>
        <p class="field-hint" style="margin:0.85rem 0 0">Tip: usa “Agendas” para segmentar campañas y el filtro de tags para reusar audiencias.</p>
      </div>
    </section>
  </div>`;
}

export function renderAppContactsPage(
  ctx: AppPageContext,
  filters: ContactsPageFilters,
): string {
  const agendas = mockAgendas();
  const allContacts = mockContacts(agendas);
  const filtered = applyFilters(allContacts, filters);

  const allTags = Array.from(
    new Set(allContacts.flatMap((c) => c.tags.map((t) => t.toLowerCase()))),
  )
    .sort()
    .slice(0, 30);

  const hasAny = allContacts.length > 0;
  const hasFiltered = filtered.length > 0;

  const emptyState = !hasAny
    ? `<section class="tv-panel">
        <div class="tv-panel__body tv-coming-soon">
          <span class="material-symbols-outlined" aria-hidden="true">contacts</span>
          <h2 style="margin-top:1rem">Tu base de contactos está vacía</h2>
          <p class="tv-page-sub">Crea tu primer contacto o importa un CSV para empezar a segmentar campañas.</p>
          <div class="tv-quick-actions">
            ${renderBtn("Nuevo contacto", { href: "/app/contacts?new=contact", variant: "primary" })}
            ${renderBtn("Importar CSV", { href: "/app/contacts?import=1", variant: "secondary" })}
          </div>
        </div>
      </section>`
    : !hasFiltered
      ? `<section class="tv-panel">
          <div class="tv-panel__body">
            <p style="margin:0"><strong>No hay resultados</strong> con los filtros aplicados.</p>
            <p class="field-hint" style="margin:0.35rem 0 0">Prueba limpiando filtros o seleccionando otra agenda.</p>
            <div class="tv-quick-actions" style="margin-top:0.75rem">
              ${renderBtn("Limpiar filtros", { href: "/app/contacts", variant: "primary" })}
              ${renderBtn("Crear contacto", { href: "/app/contacts?new=contact", variant: "secondary" })}
            </div>
          </div>
        </section>`
      : "";

  const body = `
    <div class="tv-contacts tv-client-dashboard tv-dlr-report">
    ${renderPageHeader({
      title: "Contactos",
      subtitle:
        "Organiza tu base de contactos para campañas, envíos y segmentación.",
      actions: [
        renderBtn("Nuevo contacto", { href: "/app/contacts?new=contact", variant: "primary", icon: "person_add" }),
        renderBtn("Nueva agenda", { href: "/app/contacts?new=agenda", variant: "secondary", icon: "create_new_folder" }),
        renderBtn("Importar CSV", { href: "/app/contacts?import=1", variant: "ghost", icon: "upload_file" }),
      ].join(" "),
    })}
    ${kpis(allContacts, agendas)}
    ${quickActions()}
    ${filtersPanel(agendas, filters, allTags)}
    <div class="tv-dash-grid tv-dash-grid--2 tv-contacts-grid">
      ${agendaPanel(agendas, filters.agenda)}
      <div>
        ${emptyState}
        ${hasFiltered ? contactsTable(filtered, filters) : ""}
      </div>
    </div>
    </div>
    <script>
      (function(){
        var checks = Array.prototype.slice.call(document.querySelectorAll('.tv-contacts-check'));
        var bulk = document.querySelector('[data-tv-bulk]');
        var countEl = document.querySelector('[data-tv-bulk-count]');
        function update(){
          if(!bulk || !countEl) return;
          var n = checks.filter(function(c){ return c && c.checked; }).length;
          countEl.textContent = String(n);
          bulk.hidden = n === 0;
        }
        checks.forEach(function(c){ c.addEventListener('change', update); });
      })();
    </script>`;

  return wrapAppPage(ctx, "contacts", "Contactos", body);
}

