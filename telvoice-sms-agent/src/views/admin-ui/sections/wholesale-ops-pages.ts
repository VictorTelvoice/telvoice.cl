import type { AdminSessionUser } from "../../../types/admin.js";
import {
  formatSmppPortPair,
  SMPP_ACCOUNT_TYPES,
  SMPP_BIND_TYPES,
  SMPP_CONNECTION_STATUSES,
  SMPP_DEFAULT_MESSAGE_TYPES,
  SMPP_LOG_LEVELS,
  SMPP_ROUTE_TYPES,
  type WholesaleInternationalRatePlanEnriched,
  type WholesaleSmppBindTestRow,
  type WholesaleSmppConnectionEnriched,
  type WholesaleSmppConnectionRow,
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

function numVal(
  values: Record<string, unknown> | undefined,
  key: string,
  c: WholesaleSmppConnectionRow | undefined,
  fallback: number,
): string {
  if (values && values[key] !== undefined && values[key] !== null) {
    return String(values[key]);
  }
  const raw = c?.[key as keyof WholesaleSmppConnectionRow];
  if (raw != null && raw !== "") return String(raw);
  return String(fallback);
}

function cbChecked(
  values: Record<string, unknown> | undefined,
  key: string,
  c: WholesaleSmppConnectionRow | undefined,
  fallback: boolean,
): string {
  if (values && values[key] !== undefined) {
    const v = values[key];
    return v === true || v === "yes" || v === "on" || v === "true" ? " checked" : "";
  }
  const raw = c?.[key as keyof WholesaleSmppConnectionRow];
  const on = typeof raw === "boolean" ? raw : fallback;
  return on ? " checked" : "";
}

function smppFormSection(title: string, body: string): string {
  return `<section class="tv-smpp-form-section">
    <h3 class="tv-smpp-form-section__title">${escapeHtml(title)}</h3>
    <div class="tv-form-grid">${body}</div>
  </section>`;
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
          const ports = formatSmppPortPair(
            c.transmitter_port,
            c.receiver_port,
            c.port,
          );
          const credit =
            c.credit_limit != null
              ? `${Number(c.credit_limit).toFixed(2)} ${escapeHtml(c.currency ?? "USD")}`
              : "—";
          const activeLabel = c.account_active === false ? " (inactive)" : "";
          return `<tr>
          <td><strong>${escapeHtml(c.label)}</strong>${activeLabel ? `<span class="field-hint">${escapeHtml(activeLabel.trim())}</span>` : ""}</td>
          <td>${escapeHtml(c.provider_name ?? "—")}</td>
          <td>${escapeHtml(c.host)}</td>
          <td><code>${escapeHtml(ports)}</code></td>
          <td>${escapeHtml(c.bind_type)}</td>
          <td>${c.submit_speed_per_second ?? c.tps_limit ?? "—"}</td>
          <td>${c.sessions ?? 1}</td>
          <td>${escapeHtml(c.currency ?? "USD")}</td>
          <td>${credit}</td>
          <td>${smppStatusBadge(c.status)}</td>
          <td>${last ? `${last.result === "success" ? '<span class="tv-smpp-status--active">OK</span>' : '<span class="tv-smpp-status--failed">FAIL</span>'} · ${last.latency_ms ?? "—"} ms` : "—"}</td>
          <td class="tv-table-actions">
            <a href="/admin/wholesale/smpp-lab/${escapeHtml(c.id)}/edit" class="row-link">Editar</a>
            <form method="post" action="/admin/wholesale/smpp-lab/${escapeHtml(c.id)}/test-bind" style="display:inline">
              <button type="submit" class="btn btn-ghost btn-sm">Test bind</button>
            </form>
          </td>
        </tr>`;
        })
        .join("")
    : `<tr><td colspan="12"><div class="tv-wholesale-empty">Sin cuentas SMPP. Cree la primera para registrar un proveedor tipo aSMSC.</div></td></tr>`;

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
      title: "Vendor SMPP Accounts",
      subtitleHtml:
        "Cuentas SMPP upstream (modelo aSMSC). <strong>Test bind</strong> valida sesión; <strong>Send test SMS</strong> solo con autorización ops.",
      actions: renderBtn("New SMPP Account", {
        href: "/admin/wholesale/smpp-lab/new",
        variant: "primary",
        icon: "add",
      }),
    })}
    <div class="table-wrap"><table class="tv-table tv-table--compact tv-table--wholesale tv-table--smpp-lab">
      <thead><tr>
        <th>Account</th><th>Provider</th><th>Host</th><th>Tx/Rx Port</th><th>Bind</th>
        <th>Speed/s</th><th>Sessions</th><th>Currency</th><th>Credit limit</th>
        <th>Status</th><th>Last bind</th><th></th>
      </tr></thead>
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

  return wrapWholesalePage(opts, "smpp-lab", "Vendor SMPP Accounts", body);
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

  const txDefault = c?.transmitter_port ?? c?.port ?? 2775;
  const rxDefault = c?.receiver_port ?? txDefault;

  const sectionA = smppFormSection(
    "A. Account",
    `<div class="form-group"><label>Account Type</label>
      <select name="account_type" class="tv-input-full">
        ${SMPP_ACCOUNT_TYPES.map((t) => `<option value="${t}"${val(v, "account_type", c?.account_type ?? "smpp") === t ? " selected" : ""}>${t}</option>`).join("")}
      </select></div>
    <div class="form-group"><label>Account Name *</label>
      <input name="label" required class="tv-input-full" value="${escapeHtml(val(v, "label", c?.label ?? ""))}" /></div>
    <div class="form-group"><label>Provider</label>
      ${renderProviderSelect(opts.providers, val(v, "provider_id", c?.provider_id ?? ""))}</div>
    <div class="form-group"><label>Account Active</label>
      <label class="tv-checkbox-inline"><input type="checkbox" name="account_active" value="yes"${cbChecked(v, "account_active", c, true)} /> Active</label></div>
    <div class="form-group"><label>Operational status</label>
      <select name="status" class="tv-input-full">
        ${SMPP_CONNECTION_STATUSES.map((s) => `<option value="${s}"${val(v, "status", c?.status ?? "draft") === s ? " selected" : ""}>${s}</option>`).join("")}
      </select></div>`,
  );

  const sectionB = smppFormSection(
    "B. Credentials",
    `<div class="form-group"><label>System ID *</label>
      <input name="system_id" required class="tv-input-full" value="${escapeHtml(val(v, "system_id", c?.system_id ?? ""))}" /></div>
    <div class="form-group"><label>Password ${isEdit ? "" : "*"}</label>
      <input name="password" type="password" autocomplete="new-password" class="tv-input-full" ${isEdit ? "" : "required"} />
      ${isEdit ? '<p class="tv-smpp-pwd-hint">Leave blank to keep current password.</p>' : ""}</div>
    <div class="form-group"><label>System Type</label>
      <input name="system_type" class="tv-input-full" value="${escapeHtml(val(v, "system_type", c?.system_type ?? ""))}" /></div>`,
  );

  const sectionC = smppFormSection(
    "C. Network",
    `<div class="form-group"><label>Host *</label>
      <input name="host" required class="tv-input-full" value="${escapeHtml(val(v, "host", c?.host ?? ""))}" /></div>
    <div class="form-group"><label>Transmitter Port</label>
      <input name="transmitter_port" type="number" min="1" max="65535" class="tv-input-full" value="${escapeHtml(numVal(v, "transmitter_port", c, txDefault))}" /></div>
    <div class="form-group"><label>Receiver Port</label>
      <input name="receiver_port" type="number" min="1" max="65535" class="tv-input-full" value="${escapeHtml(numVal(v, "receiver_port", c, rxDefault))}" />
      <p class="field-hint">Defaults to transmitter port if empty.</p></div>
    <div class="form-group"><label>Bind Type / Connection Mode</label>
      <select name="bind_type" class="tv-input-full">
        ${SMPP_BIND_TYPES.map((b) => `<option value="${b}"${val(v, "bind_type", c?.bind_type ?? "transceiver") === b ? " selected" : ""}>${b}</option>`).join("")}
      </select></div>`,
  );

  const sectionD = smppFormSection(
    "D. Addressing TON/NPI",
    `<div class="form-group"><label>Addr TON</label>
      <input name="addr_ton" type="number" class="tv-input-full" value="${escapeHtml(numVal(v, "addr_ton", c, 0))}" /></div>
    <div class="form-group"><label>Addr NPI</label>
      <input name="addr_npi" type="number" class="tv-input-full" value="${escapeHtml(numVal(v, "addr_npi", c, 0))}" /></div>
    <div class="form-group"><label>Source Addr TON</label>
      <input name="source_addr_ton" type="number" class="tv-input-full" value="${escapeHtml(numVal(v, "source_addr_ton", c, 0))}" /></div>
    <div class="form-group"><label>Source Addr NPI</label>
      <input name="source_addr_npi" type="number" class="tv-input-full" value="${escapeHtml(numVal(v, "source_addr_npi", c, 0))}" /></div>
    <div class="form-group"><label>Dest Addr TON</label>
      <input name="dest_addr_ton" type="number" class="tv-input-full" value="${escapeHtml(numVal(v, "dest_addr_ton", c, 1))}" /></div>
    <div class="form-group"><label>Dest Addr NPI</label>
      <input name="dest_addr_npi" type="number" class="tv-input-full" value="${escapeHtml(numVal(v, "dest_addr_npi", c, 1))}" /></div>
    <div class="form-group"><label>Default source address</label>
      <input name="source_address" class="tv-input-full" value="${escapeHtml(val(v, "source_address", c?.source_address ?? ""))}" /></div>`,
  );

  const sectionE = smppFormSection(
    "E. Performance",
    `<div class="form-group"><label>Response Timeout (seconds)</label>
      <input name="response_timeout_seconds" type="number" min="5" max="3600" class="tv-input-full" value="${escapeHtml(numVal(v, "response_timeout_seconds", c, 300))}" /></div>
    <div class="form-group"><label>Enquire Link Interval (seconds)</label>
      <input name="enquire_link_interval_seconds" type="number" min="1" max="3600" class="tv-input-full" value="${escapeHtml(numVal(v, "enquire_link_interval_seconds", c, c?.enquire_link_interval_seconds ?? (c?.enquire_link_interval ? Math.max(1, Math.round(c.enquire_link_interval / 1000)) : 45)))}" /></div>
    <div class="form-group"><label>Submit Speed / Second</label>
      <input name="submit_speed_per_second" type="number" min="1" class="tv-input-full" value="${escapeHtml(numVal(v, "submit_speed_per_second", c, 1))}" /></div>
    <div class="form-group"><label>Delay Time (seconds)</label>
      <input name="delay_time_seconds" type="number" min="0" class="tv-input-full" value="${escapeHtml(numVal(v, "delay_time_seconds", c, 0))}" /></div>
    <div class="form-group"><label>Sessions</label>
      <input name="sessions" type="number" min="1" class="tv-input-full" value="${escapeHtml(numVal(v, "sessions", c, 1))}" /></div>
    <div class="form-group"><label>TPS Limit</label>
      <input name="tps_limit" type="number" min="1" class="tv-input-full" value="${escapeHtml(numVal(v, "tps_limit", c, 1))}" /></div>`,
  );

  const sectionF = smppFormSection(
    "F. Routing / Billing",
    `<div class="form-group" style="grid-column:1/-1"><label>Message Types Allowed</label>
      <input name="message_types_allowed" class="tv-input-full" value="${escapeHtml(val(v, "message_types_allowed", c?.message_types_allowed ?? SMPP_DEFAULT_MESSAGE_TYPES))}" /></div>
    <div class="form-group"><label>Route Type</label>
      <select name="route_type" class="tv-input-full">
        ${SMPP_ROUTE_TYPES.map((rt) => `<option value="${rt}"${val(v, "route_type", c?.route_type ?? "direct") === rt ? " selected" : ""}>${rt}</option>`).join("")}
      </select></div>
    <div class="form-group"><label>Currency</label>
      <select name="currency" class="tv-input-full">
        ${["USD", "EUR", "CLP", "GBP", "RON"].map((cur) => `<option value="${cur}"${val(v, "currency", c?.currency ?? "USD") === cur ? " selected" : ""}>${cur}</option>`).join("")}
      </select></div>
    <div class="form-group"><label>Credit Limit</label>
      <input name="credit_limit" type="number" step="0.01" min="0" class="tv-input-full" value="${escapeHtml(val(v, "credit_limit", c?.credit_limit != null ? String(c.credit_limit) : ""))}" /></div>
    <div class="form-group"><label>Identifier</label>
      <input name="identifier" class="tv-input-full" value="${escapeHtml(val(v, "identifier", c?.identifier ?? ""))}" /></div>`,
  );

  const sectionG = smppFormSection(
    "G. Sender / Phone Rules",
    `<div class="form-group"><label>Sender ID Prefix</label>
      <input name="sender_id_prefix" class="tv-input-full" value="${escapeHtml(val(v, "sender_id_prefix", c?.sender_id_prefix ?? ""))}" /></div>
    <div class="form-group"><label>Phone Number Prepend</label>
      <input name="phone_number_prepend" class="tv-input-full" value="${escapeHtml(val(v, "phone_number_prepend", c?.phone_number_prepend ?? ""))}" /></div>`,
  );

  const sectionH = smppFormSection(
    "H. Advanced",
    `<div class="form-group"><label>Log Level</label>
      <select name="log_level" class="tv-input-full">
        ${SMPP_LOG_LEVELS.map((ll) => `<option value="${ll}"${val(v, "log_level", c?.log_level ?? "off") === ll ? " selected" : ""}>${ll}</option>`).join("")}
      </select></div>
    <div class="form-group"><label>TLV Tag</label>
      <input name="tlv_tag" class="tv-input-full" placeholder="Optional numeric tag" value="${escapeHtml(val(v, "tlv_tag", c?.tlv_tag ?? ""))}" /></div>
    <div class="form-group"><label>TLV Value</label>
      <input name="tlv_value" class="tv-input-full" value="${escapeHtml(val(v, "tlv_value", c?.tlv_value ?? ""))}" /></div>
    <div class="form-group"><label>ESME Acknowledgement</label>
      <label class="tv-checkbox-inline"><input type="checkbox" name="esme_acknowledgement" value="yes"${cbChecked(v, "esme_acknowledgement", c, false)} /> Enabled</label></div>
    <div class="form-group"><label>Send Validity Period as Null</label>
      <label class="tv-checkbox-inline"><input type="checkbox" name="send_validity_period_as_null" value="yes"${cbChecked(v, "send_validity_period_as_null", c, false)} /> Enabled</label></div>
    <div class="form-group"><label>Enable Affix For SMS ID</label>
      <label class="tv-checkbox-inline"><input type="checkbox" name="enable_affix_for_sms_id" value="yes"${cbChecked(v, "enable_affix_for_sms_id", c, false)} /> Enabled</label></div>
    <div class="form-group"><label>Enable decimal only for SMS ID</label>
      <label class="tv-checkbox-inline"><input type="checkbox" name="enable_decimal_only_for_sms_id" value="yes"${cbChecked(v, "enable_decimal_only_for_sms_id", c, false)} /> Enabled</label></div>`,
  );

  const sectionI = smppFormSection(
    "I. Future sections",
    `<div class="form-group"><label>Auto Import Rate Plan</label>
      <label class="tv-checkbox-inline"><input type="checkbox" name="auto_import_enabled" value="yes"${cbChecked(v, "auto_import_enabled", c, false)} /> Enable when rate import is wired</label></div>
    <div class="form-group"><label>Secure Connection Settings</label>
      <label class="tv-checkbox-inline"><input type="checkbox" name="secure_connection_enabled" value="yes"${cbChecked(v, "secure_connection_enabled", c, false)} /> Enable when TLS is wired</label></div>
    <div class="form-group"><label>Delivery with Optional Parameters</label>
      <label class="tv-checkbox-inline"><input type="checkbox" name="delivery_optional_parameters_enabled" value="yes"${cbChecked(v, "delivery_optional_parameters_enabled", c, false)} /> Enable when DLR optional params are wired</label></div>
    <div class="form-group" style="grid-column:1/-1"><label>Notes</label>
      <textarea name="notes" class="tv-input-full" rows="3">${escapeHtml(val(v, "notes", c?.notes ?? ""))}</textarea></div>`,
  );

  const form = `
    ${opts.error ? `<div class="alert alert-error">${escapeHtml(opts.error)}</div>` : ""}
    <form method="post" action="${action}" class="tv-panel tv-smpp-vendor-form">
      <h2 class="tv-panel__title">${isEdit ? "Edit SMPP vendor account" : "New SMPP vendor account"}</h2>
      <p class="tv-panel__sub">Modelo alineado con cuentas proveedor aSMSC/Almuqeet. Password nunca se muestra en pantalla.</p>
      <div class="tv-panel__body tv-smpp-form-sections">
        ${sectionA}${sectionB}${sectionC}${sectionD}${sectionE}${sectionF}${sectionG}${sectionH}${sectionI}
      </div>
      <div class="tv-form-actions">
        ${renderBtn(isEdit ? "Save account" : "Create account", { type: "submit", variant: "primary" })}
        <a href="/admin/wholesale/smpp-lab" class="btn btn-ghost">Cancel</a>
      </div>
    </form>
    ${isEdit ? `<form method="post" action="/admin/wholesale/smpp-lab/${escapeHtml(c!.id)}/test-bind" style="margin-top:0.75rem"><button type="submit" class="btn btn-secondary">Test bind now</button></form>` : ""}`;

  return wrapWholesalePage(opts, "smpp-lab", isEdit ? "Edit SMPP account" : "New SMPP account", form);
}

export function renderInternationalRatePlansListPage(
  opts: BaseOpts & { plans: WholesaleInternationalRatePlanEnriched[] },
): string {
  const rows = opts.plans.length
    ? opts.plans
        .map((p) => {
          const buyRate =
            p.pending_price || p.cost_price == null
              ? '<span class="badge badge-warn">pending</span>'
              : `${Number(p.cost_price).toFixed(4)} ${escapeHtml(p.currency)}`;
          const sellRate =
            p.pending_price || p.sale_price == null
              ? '<span class="badge badge-warn">pending</span>'
              : `${Number(p.sale_price).toFixed(4)} ${escapeHtml(p.currency)}`;
          const termination =
            p.cost_price != null && p.sale_price != null
              ? `${Number(p.sale_price).toFixed(4)} ${escapeHtml(p.currency)}`
              : "—";
          return `<tr>
          <td><strong>${escapeHtml(p.country_iso)}</strong><br>${escapeHtml(p.country_name)}</td>
          <td>${escapeHtml(p.operator_name)}</td>
          <td>${escapeHtml(p.traffic_type)}</td>
          <td>${escapeHtml(p.provider_name ?? "—")}</td>
          <td>${escapeHtml(p.smpp_connection_label ?? "—")}</td>
          <td class="tv-wholesale-price">${buyRate}</td>
          <td class="tv-wholesale-price">${sellRate}</td>
          <td class="tv-wholesale-price">${termination}</td>
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
    : `<tr><td colspan="10"><div class="tv-wholesale-empty">Sin rate plans. Ejecute seed RO/GB/CL o cree manualmente.</div></td></tr>`;

  const rateConcepts = `<div class="tv-rate-concepts" role="note">
    <strong>Rate concepts (aSMSC-style):</strong>
    <span><em>Buy rate</em> = costo proveedor (cost_price)</span>
    <span><em>Sell rate</em> = tarifa cliente wholesale (sale_price)</span>
    <span><em>Termination rate</em> = precio efectivo en ruta destino (Route Manager)</span>
  </div>`;

  const body = `
    ${renderPageHeader({
      title: "Vendor Rate Plans",
      subtitle: "Tarifas estructuradas por país, operador y tráfico. RO / GB / CL prioritarios.",
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
    ${rateConcepts}
    <div class="table-wrap"><table class="tv-table tv-table--compact tv-table--wholesale">
      <thead><tr>
        <th>País</th><th>Operador</th><th>Tráfico</th><th>Vendor</th><th>SMPP</th>
        <th>Buy rate</th><th>Sell rate</th><th>Termination</th><th>Estado</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  return wrapWholesalePage(opts, "international-rates", "Vendor Rate Plans", body);
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
            ${["otp", "transactional", "promotional", "mixed"]
              .map(
                (t) =>
                  `<option value="${t}"${val(v, "traffic_type", p?.traffic_type ?? "promotional") === t ? " selected" : ""}>${t}</option>`,
              )
              .join("")}
          </select></div>
        <div class="form-group"><label>Proveedor</label>${renderProviderSelect(opts.providers, val(v, "provider_id", p?.provider_id ?? ""))}</div>
        <div class="form-group"><label>Conexión SMPP</label>${connSelect}</div>
        <div class="form-group"><label>Cost price</label><input name="cost_price" class="tv-input-full" value="${escapeHtml(val(v, "cost_price", p?.cost_price != null ? String(p.cost_price) : ""))}" /></div>
        <div class="form-group"><label>Sale price</label><input name="sale_price" class="tv-input-full" value="${escapeHtml(val(v, "sale_price", p?.sale_price != null ? String(p.sale_price) : ""))}" /></div>
        <div class="form-group"><label>Moneda</label>
          <select name="currency" class="tv-input-full">
            ${["USD", "EUR", "CLP", "GBP", "RON"]
              .map(
                (cur) =>
                  `<option value="${cur}"${val(v, "currency", p?.currency ?? "USD") === cur ? " selected" : ""}>${cur}</option>`,
              )
              .join("")}
          </select></div>
        <div class="form-group"><label>Válido desde</label><input type="date" name="valid_from" class="tv-input-full" value="${escapeHtml(val(v, "valid_from", p?.valid_from ?? ""))}" /></div>
        <div class="form-group"><label>Válido hasta</label><input type="date" name="valid_until" class="tv-input-full" value="${escapeHtml(val(v, "valid_until", p?.valid_until ?? ""))}" /></div>
        <div class="form-group"><label>Estado</label>
          <select name="status" class="tv-input-full">
            ${["draft", "testing", "approved", "live", "paused", "rejected"]
              .map(
                (s) =>
                  `<option value="${s}"${val(v, "status", p?.status ?? "draft") === s ? " selected" : ""}>${s}</option>`,
              )
              .join("")}
          </select></div>
        <div class="form-group" style="grid-column:1/-1">
          <label><input type="checkbox" name="pending_price" value="on"${(v && v.pending_price !== undefined) || p?.pending_price ? " checked" : ""} /> Buy/Sell rate pendiente (sin tarifa real aún)</label>
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
