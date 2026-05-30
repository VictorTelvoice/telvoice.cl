import type { AdminSessionUser } from "../../../types/admin.js";
import {
  SMPP_BIND_TYPES,
  SMPP_CONNECTION_STATUSES,
  type WholesaleInternationalRatePlanEnriched,
  type WholesaleSmppBindTestRow,
  type WholesaleSmppConnectionEnriched,
  type WholesaleSmppSendTestRow,
} from "../../../types/smpp-lab.js";
import type { WholesaleProviderRow } from "../../../types/wholesale.js";
import { escapeHtml, formatDate } from "../../../utils/html.js";
import {
  wholesaleStatusBadge,
  wrapWholesalePage,
} from "./wholesale-pages.js";
import { renderBtn, renderPageHeader } from "../page-kit.js";

type BaseOpts = {
  admin: AdminSessionUser;
  success?: string;
  error?: string;
};

function val(values: Record<string, unknown> | undefined, key: string, fallback = ""): string {
  if (values && values[key] !== undefined && values[key] !== null) {
    return String(values[key]);
  }
  return fallback;
}

function smppStatusBadge(status: string): string {
  const cls =
    status === "active"
      ? "ok"
      : status === "failed"
        ? "err"
        : status === "testing"
          ? "warn"
          : "muted";
  return `<span class="badge badge-${cls}">${escapeHtml(status)}</span>`;
}

function renderProviderSelect(
  providers: WholesaleProviderRow[],
  selected: string,
): string {
  const opts = providers
    .map(
      (p) =>
        `<option value="${escapeHtml(p.id)}"${selected === p.id ? " selected" : ""}>${escapeHtml(p.name)}</option>`,
    )
    .join("");
  return `<select name="provider_id" class="tv-input-full"><option value="">— Sin proveedor —</option>${opts}</select>`;
}

function renderConnectionSelect(
  connections: WholesaleSmppConnectionEnriched[],
  selected: string,
  name = "connection_id",
): string {
  const opts = connections
    .map(
      (c) =>
        `<option value="${escapeHtml(c.id)}"${selected === c.id ? " selected" : ""}>${escapeHtml(c.label)} (${escapeHtml(c.host)})</option>`,
    )
    .join("");
  return `<select name="${escapeHtml(name)}" class="tv-input-full" required><option value="">Seleccionar…</option>${opts}</select>`;
}

export function renderSmppLabHubPage(
  opts: BaseOpts & {
    connections: WholesaleSmppConnectionEnriched[];
    bindTests: WholesaleSmppBindTestRow[];
    sendTests: WholesaleSmppSendTestRow[];
  },
): string {
  const connRows = opts.connections.length
    ? opts.connections
        .map((c) => {
          const last = c.last_bind_test;
          return `<tr>
          <td><strong>${escapeHtml(c.label)}</strong><br><span class="field-hint">${escapeHtml(c.host)}:${c.port}</span></td>
          <td>${escapeHtml(c.provider_name ?? "—")}</td>
          <td>${escapeHtml(c.system_id)}</td>
          <td>${escapeHtml(c.bind_type)}</td>
          <td>${smppStatusBadge(c.status)}</td>
          <td>${last ? `${last.result === "success" ? "OK" : "FAIL"} · ${last.latency_ms ?? "—"} ms` : "—"}</td>
          <td class="tv-table-actions">
            <a href="/admin/wholesale/smpp-lab/${escapeHtml(c.id)}/edit" class="row-link">Editar</a>
            <form method="post" action="/admin/wholesale/smpp-lab/${escapeHtml(c.id)}/test-bind" style="display:inline">
              <button type="submit" class="btn btn-ghost btn-sm">Test bind</button>
            </form>
          </td>
        </tr>`;
        })
        .join("")
    : `<tr><td colspan="7"><div class="tv-wholesale-empty">Sin conexiones SMPP. Cree la primera para probar bind con proveedores RO/GB.</div></td></tr>`;

  const bindRows = opts.bindTests.slice(0, 10).map(
    (t) => `<tr>
      <td>${formatDate(t.tested_at)}</td>
      <td><code>${escapeHtml(t.connection_id.slice(0, 8))}…</code></td>
      <td>${t.result === "success" ? '<span class="tv-smpp-status--active">OK</span>' : '<span class="tv-smpp-status--failed">FAIL</span>'}</td>
      <td>${t.latency_ms ?? "—"} ms</td>
      <td>${escapeHtml(t.error_message ?? "—")}</td>
    </tr>`,
  ).join("");

  const sendRows = opts.sendTests.slice(0, 10).map(
    (t) => `<tr>
      <td>${formatDate(t.sent_at)}</td>
      <td><code>${escapeHtml(t.destination_number)}</code></td>
      <td>${escapeHtml(t.submit_status)}</td>
      <td>${escapeHtml(t.provider_message_id ?? "—")}</td>
      <td>${escapeHtml(t.dlr_status)}</td>
    </tr>`,
  ).join("");

  const body = `
    ${renderPageHeader({
      title: "SMPP Lab",
      subtitleHtml:
        "Registrar conexiones SMPP de proveedores, ejecutar <strong>Test bind</strong> (solo conexión) y <strong>Send test SMS</strong> (submit_sm controlado). Solo superadmin.",
      actions: renderBtn("Nueva conexión", {
        href: "/admin/wholesale/smpp-lab/new",
        variant: "primary",
        icon: "add",
      }),
    })}
    <div class="table-wrap"><table class="tv-table tv-table--compact tv-table--wholesale">
      <thead><tr><th>Conexión</th><th>Proveedor</th><th>System ID</th><th>Bind</th><th>Estado</th><th>Último test</th><th></th></tr></thead>
      <tbody>${connRows}</tbody>
    </table></div>

    <section class="tv-panel" style="margin-top:1.25rem">
      <h2 class="tv-panel__title">Send test SMS</h2>
      <p class="tv-panel__sub">Envío manual único — máx. 160 caracteres. Requiere confirmación.</p>
      <form method="post" action="/admin/wholesale/smpp-lab/send-test" class="tv-panel__body tv-form-grid">
        <div class="form-group"><label>Conexión SMPP *</label>${renderConnectionSelect(opts.connections, "")}</div>
        <div class="form-group"><label>Destino *</label><input name="destination_number" class="tv-input-full" placeholder="+40… / +44…" required /></div>
        <div class="form-group"><label>Source address</label><input name="source_address" class="tv-input-full" placeholder="Sender ID" /></div>
        <div class="form-group"><label>País ISO</label><input name="country_code" class="tv-input-full" placeholder="RO, GB, CL" maxlength="3" /></div>
        <div class="form-group"><label>Operador</label><input name="operator_name" class="tv-input-full" /></div>
        <div class="form-group"><label>Tráfico</label>
          <select name="traffic_type" class="tv-input-full">
            <option value="otp">OTP</option>
            <option value="transactional">Transactional</option>
            <option value="marketing">Marketing</option>
            <option value="mixed" selected>Mixed</option>
          </select>
        </div>
        <div class="form-group" style="grid-column:1/-1"><label>Mensaje *</label>
          <textarea name="message_text" class="tv-input-full" rows="2" maxlength="160" required>Telvoice SMPP test</textarea></div>
        <div class="form-group" style="grid-column:1/-1">
          <label><input type="checkbox" name="confirm" value="yes" required /> Confirmo envío de prueba manual (no masivo)</label>
        </div>
        <div class="tv-form-actions" style="grid-column:1/-1">
          ${renderBtn("Send test SMS", { type: "submit", variant: "primary", icon: "send" })}
        </div>
      </form>
    </section>

    <div class="tv-wholesale-summary-grid" style="margin-top:1.25rem">
      <section class="tv-panel"><h2 class="tv-panel__title">Últimos bind tests</h2>
        <div class="table-wrap"><table class="tv-table tv-table--compact"><thead><tr><th>Fecha</th><th>Conn</th><th>Result</th><th>Latencia</th><th>Error</th></tr></thead><tbody>${bindRows || '<tr><td colspan="5">Sin tests</td></tr>'}</tbody></table></div>
      </section>
      <section class="tv-panel"><h2 class="tv-panel__title">Últimos SMS tests</h2>
        <div class="table-wrap"><table class="tv-table tv-table--compact"><thead><tr><th>Fecha</th><th>Destino</th><th>Submit</th><th>Msg ID</th><th>DLR</th></tr></thead><tbody>${sendRows || '<tr><td colspan="5">Sin envíos</td></tr>'}</tbody></table></div>
      </section>
    </div>`;

  return wrapWholesalePage(opts, "smpp-lab", "SMPP Lab", body);
}

export function renderSmppConnectionFormPage(
  opts: BaseOpts & {
    mode: "create" | "edit";
    connection?: WholesaleSmppConnectionEnriched;
    providers: WholesaleProviderRow[];
    values?: Record<string, unknown>;
    error?: string;
  },
): string {
  const c = opts.connection;
  const v = opts.values;
  const isEdit = opts.mode === "edit";
  const action = isEdit
    ? `/admin/wholesale/smpp-lab/${escapeHtml(c!.id)}/edit`
    : "/admin/wholesale/smpp-lab";

  const form = `
    ${opts.error ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>` : ""}
    <form method="post" action="${action}" class="tv-panel">
      <h2 class="tv-panel__title">${isEdit ? "Editar conexión SMPP" : "Nueva conexión SMPP"}</h2>
      <div class="tv-panel__body tv-form-grid">
        <div class="form-group"><label>Proveedor wholesale</label>
          ${renderProviderSelect(opts.providers, val(v, "provider_id", c?.provider_id ?? ""))}</div>
        <div class="form-group"><label>Nombre / label *</label>
          <input name="label" required class="tv-input-full" value="${escapeHtml(val(v, "label", c?.label ?? ""))}" /></div>
        <div class="form-group"><label>Host *</label>
          <input name="host" required class="tv-input-full" value="${escapeHtml(val(v, "host", c?.host ?? ""))}" /></div>
        <div class="form-group"><label>Port</label>
          <input name="port" type="number" class="tv-input-full" value="${escapeHtml(val(v, "port", c?.port != null ? String(c.port) : "2775"))}" /></div>
        <div class="form-group"><label>System ID *</label>
          <input name="system_id" required class="tv-input-full" value="${escapeHtml(val(v, "system_id", c?.system_id ?? ""))}" /></div>
        <div class="form-group"><label>Password ${isEdit ? "" : "*"}</label>
          <input name="password" type="password" autocomplete="new-password" class="tv-input-full" ${isEdit ? "" : "required"} />
          ${isEdit ? '<p class="tv-smpp-pwd-hint">Dejar vacío para mantener el password actual. Nunca se muestra en pantalla.</p>' : ""}</div>
        <div class="form-group"><label>System type</label>
          <input name="system_type" class="tv-input-full" value="${escapeHtml(val(v, "system_type", c?.system_type ?? ""))}" /></div>
        <div class="form-group"><label>Bind type</label>
          <select name="bind_type" class="tv-input-full">
            ${SMPP_BIND_TYPES.map((b) => `<option value="${b}"${val(v, "bind_type", c?.bind_type ?? "transceiver") === b ? " selected" : ""}>${b}</option>`).join("")}
          </select></div>
        <div class="form-group"><label>Source TON</label>
          <input name="source_addr_ton" type="number" class="tv-input-full" value="${escapeHtml(val(v, "source_addr_ton", c?.source_addr_ton != null ? String(c.source_addr_ton) : "0"))}" /></div>
        <div class="form-group"><label>Source NPI</label>
          <input name="source_addr_npi" type="number" class="tv-input-full" value="${escapeHtml(val(v, "source_addr_npi", c?.source_addr_npi != null ? String(c.source_addr_npi) : "0"))}" /></div>
        <div class="form-group"><label>Source address</label>
          <input name="source_address" class="tv-input-full" value="${escapeHtml(val(v, "source_address", c?.source_address ?? ""))}" /></div>
        <div class="form-group"><label>TPS limit</label>
          <input name="tps_limit" type="number" min="1" class="tv-input-full" value="${escapeHtml(val(v, "tps_limit", c?.tps_limit != null ? String(c.tps_limit) : "1"))}" /></div>
        <div class="form-group"><label>Enquire link (ms)</label>
          <input name="enquire_link_interval" type="number" min="5000" class="tv-input-full" value="${escapeHtml(val(v, "enquire_link_interval", c?.enquire_link_interval != null ? String(c.enquire_link_interval) : "30000"))}" /></div>
        <div class="form-group"><label>Estado</label>
          <select name="status" class="tv-input-full">
            ${SMPP_CONNECTION_STATUSES.map((s) => `<option value="${s}"${val(v, "status", c?.status ?? "draft") === s ? " selected" : ""}>${s}</option>`).join("")}
          </select></div>
        <div class="form-group" style="grid-column:1/-1"><label>Notas</label>
          <textarea name="notes" class="tv-input-full" rows="3">${escapeHtml(val(v, "notes", c?.notes ?? ""))}</textarea></div>
      </div>
      <div class="tv-form-actions">
        ${renderBtn(isEdit ? "Guardar" : "Crear conexión", { type: "submit", variant: "primary" })}
        <a href="/admin/wholesale/smpp-lab" class="btn btn-ghost">Cancelar</a>
      </div>
    </form>
    ${isEdit ? `<form method="post" action="/admin/wholesale/smpp-lab/${escapeHtml(c!.id)}/test-bind" style="margin-top:0.75rem"><button type="submit" class="btn btn-secondary">Test bind ahora</button></form>` : ""}`;

  return wrapWholesalePage(opts, "smpp-lab", isEdit ? "Editar SMPP" : "Nueva conexión SMPP", form);
}

export function renderInternationalRatePlansListPage(
  opts: BaseOpts & { plans: WholesaleInternationalRatePlanEnriched[] },
): string {
  const rows = opts.plans.length
    ? opts.plans
        .map((p) => {
          const price =
            p.pending_price || (p.cost_price == null && p.sale_price == null)
              ? '<span class="badge badge-warn">pending_price</span>'
              : `${p.cost_price != null ? Number(p.cost_price).toFixed(4) : "—"} → ${p.sale_price != null ? Number(p.sale_price).toFixed(4) : "—"} ${escapeHtml(p.currency)}`;
          return `<tr>
          <td><strong>${escapeHtml(p.country_iso)}</strong><br>${escapeHtml(p.country_name)}</td>
          <td>${escapeHtml(p.operator_name)}</td>
          <td>${escapeHtml(p.traffic_type)}</td>
          <td>${escapeHtml(p.provider_name ?? "—")}</td>
          <td>${escapeHtml(p.smpp_connection_label ?? "—")}</td>
          <td>${price}</td>
          <td>${wholesaleStatusBadge(p.status)}</td>
          <td class="tv-table-actions">
            <a href="/admin/wholesale/international-rates/${escapeHtml(p.id)}/edit" class="row-link">Editar</a>
            <form method="post" action="/admin/wholesale/international-rates/${escapeHtml(p.id)}/delete" style="display:inline" onsubmit="return confirm('¿Eliminar rate plan?')">
              <button type="submit" class="btn btn-ghost btn-sm">Eliminar</button>
            </form>
          </td>
        </tr>`;
        })
        .join("")
    : `<tr><td colspan="8"><div class="tv-wholesale-empty">Sin rate plans. Ejecute seed RO/GB/CL o cree manualmente.</div></td></tr>`;

  const body = `
    ${renderPageHeader({
      title: "Rate plans internacionales",
      subtitle: "Tarifas estructuradas por país, operador y tráfico. RO y GB prioritarios.",
      actions:
        renderBtn("Nuevo rate plan", {
          href: "/admin/wholesale/international-rates/new",
          variant: "primary",
          icon: "add",
        }) +
        `<form method="post" action="/admin/wholesale/international-rates/seed" style="display:inline;margin-left:0.5rem">
          <button type="submit" class="btn btn-secondary btn-sm">Seed RO/GB/CL draft</button>
        </form>`,
    })}
    <div class="table-wrap"><table class="tv-table tv-table--compact tv-table--wholesale">
      <thead><tr><th>País</th><th>Operador</th><th>Tráfico</th><th>Proveedor</th><th>SMPP</th><th>Precios</th><th>Estado</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  return wrapWholesalePage(opts, "international-rates", "Rate plans internacionales", body);
}

export function renderInternationalRatePlanFormPage(
  opts: BaseOpts & {
    mode: "create" | "edit";
    plan?: WholesaleInternationalRatePlanEnriched;
    providers: WholesaleProviderRow[];
    connections: WholesaleSmppConnectionEnriched[];
    values?: Record<string, unknown>;
    error?: string;
  },
): string {
  const p = opts.plan;
  const v = opts.values;
  const isEdit = opts.mode === "edit";
  const action = isEdit
    ? `/admin/wholesale/international-rates/${escapeHtml(p!.id)}/edit`
    : "/admin/wholesale/international-rates";

  const connSelect = `<select name="smpp_connection_id" class="tv-input-full"><option value="">—</option>${opts.connections.map((c) => `<option value="${escapeHtml(c.id)}"${val(v, "smpp_connection_id", p?.smpp_connection_id ?? "") === c.id ? " selected" : ""}>${escapeHtml(c.label)}</option>`).join("")}</select>`;

  const form = `
    ${opts.error ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>` : ""}
    <form method="post" action="${action}" class="tv-panel">
      <h2 class="tv-panel__title">${isEdit ? "Editar rate plan" : "Nuevo rate plan internacional"}</h2>
      <div class="tv-panel__body tv-form-grid">
        <div class="form-group"><label>País *</label><input name="country_name" required class="tv-input-full" value="${escapeHtml(val(v, "country_name", p?.country_name ?? ""))}" /></div>
        <div class="form-group"><label>ISO *</label><input name="country_iso" required maxlength="3" class="tv-input-full" value="${escapeHtml(val(v, "country_iso", p?.country_iso ?? ""))}" /></div>
        <div class="form-group"><label>MCC</label><input name="mcc" class="tv-input-full" value="${escapeHtml(val(v, "mcc", p?.mcc ?? ""))}" /></div>
        <div class="form-group"><label>MNC</label><input name="mnc" class="tv-input-full" value="${escapeHtml(val(v, "mnc", p?.mnc ?? ""))}" /></div>
        <div class="form-group"><label>Operador *</label><input name="operator_name" required class="tv-input-full" value="${escapeHtml(val(v, "operator_name", p?.operator_name ?? ""))}" /></div>
        <div class="form-group"><label>Tráfico</label>
          <select name="traffic_type" class="tv-input-full">
            <option value="otp">otp</option><option value="transactional">transactional</option>
            <option value="promotional">promotional</option><option value="mixed">mixed</option>
          </select></div>
        <div class="form-group"><label>Proveedor</label>${renderProviderSelect(opts.providers, val(v, "provider_id", p?.provider_id ?? ""))}</div>
        <div class="form-group"><label>Conexión SMPP</label>${connSelect}</div>
        <div class="form-group"><label>Cost price</label><input name="cost_price" class="tv-input-full" value="${escapeHtml(val(v, "cost_price", p?.cost_price != null ? String(p.cost_price) : ""))}" /></div>
        <div class="form-group"><label>Sale price</label><input name="sale_price" class="tv-input-full" value="${escapeHtml(val(v, "sale_price", p?.sale_price != null ? String(p.sale_price) : ""))}" /></div>
        <div class="form-group"><label>Moneda</label>
          <select name="currency" class="tv-input-full">
            <option value="USD">USD</option><option value="EUR">EUR</option><option value="CLP">CLP</option>
          </select></div>
        <div class="form-group"><label>Válido desde</label><input type="date" name="valid_from" class="tv-input-full" value="${escapeHtml(val(v, "valid_from", p?.valid_from ?? ""))}" /></div>
        <div class="form-group"><label>Válido hasta</label><input type="date" name="valid_until" class="tv-input-full" value="${escapeHtml(val(v, "valid_until", p?.valid_until ?? ""))}" /></div>
        <div class="form-group"><label>Estado</label>
          <select name="status" class="tv-input-full">
            <option value="draft">draft</option><option value="testing">testing</option>
            <option value="approved">approved</option><option value="live">live</option>
            <option value="paused">paused</option><option value="rejected">rejected</option>
          </select></div>
        <div class="form-group" style="grid-column:1/-1">
          <label><input type="checkbox" name="pending_price" value="on"${p?.pending_price ? " checked" : ""} /> Precio pendiente (sin tarifa real aún)</label>
        </div>
        <div class="form-group" style="grid-column:1/-1"><label>Notas</label>
          <textarea name="notes" class="tv-input-full" rows="3">${escapeHtml(val(v, "notes", p?.notes ?? ""))}</textarea></div>
      </div>
      <div class="tv-form-actions">
        ${renderBtn(isEdit ? "Guardar" : "Crear", { type: "submit", variant: "primary" })}
        <a href="/admin/wholesale/international-rates" class="btn btn-ghost">Cancelar</a>
      </div>
    </form>`;

  return wrapWholesalePage(opts, "international-rates", isEdit ? "Editar rate plan" : "Nuevo rate plan", form);
}
