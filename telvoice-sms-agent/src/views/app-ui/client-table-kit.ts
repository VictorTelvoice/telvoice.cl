import { escapeHtml } from "../../utils/html.js";

export const CLIENT_TABLE_LIMIT_OPTIONS = [20, 50, 100] as const;
export type ClientTableLimit = (typeof CLIENT_TABLE_LIMIT_OPTIONS)[number];

export type ClientTableStorageKey =
  | "app_inbox"
  | "app_campaigns"
  | "app_dlr_report"
  | "app_wallet"
  | "app_invoices"
  | "app_templates"
  | "app_contacts"
  | "app_orders";

export const CLIENT_TABLE_LIMIT_STORAGE: Record<ClientTableStorageKey, string> = {
  app_inbox: "telvoice_table_limit_app_inbox",
  app_campaigns: "telvoice_table_limit_app_campaigns",
  app_dlr_report: "telvoice_table_limit_app_dlr_report",
  app_wallet: "telvoice_table_limit_app_wallet",
  app_invoices: "telvoice_table_limit_app_invoices",
  app_templates: "telvoice_table_limit_app_templates",
  app_contacts: "telvoice_table_limit_app_contacts",
  app_orders: "telvoice_table_limit_app_orders",
};

export function parseClientTableLimit(
  query: Record<string, string | string[] | undefined>,
  fallback: ClientTableLimit = 20,
): ClientTableLimit {
  const raw =
    typeof query.limit === "string"
      ? query.limit.trim()
      : typeof query.page_size === "string"
        ? query.page_size.trim()
        : "";
  const n = Number.parseInt(raw, 10);
  if (n === 20 || n === 50 || n === 100) {
    return n;
  }
  return fallback;
}

export function appendLimitParam(
  params: URLSearchParams,
  limit: ClientTableLimit,
  paramName: "limit" | "page_size" = "limit",
): void {
  if (limit !== 20) {
    params.set(paramName, String(limit));
  }
}

export type ClientTableFooterOptions = {
  tableKey: ClientTableStorageKey;
  count: number;
  limit: ClientTableLimit;
  basePath: string;
  hiddenFields: Record<string, string | undefined>;
  limitParamName?: "limit" | "page_size";
  noun?: string;
  countHint?: string;
  extraHtml?: string;
  /** Selector de límite sin submit (p. ej. Plantillas con filtros en cliente). */
  clientSideLimit?: boolean;
};

function renderHiddenFields(fields: Record<string, string | undefined>): string {
  return Object.entries(fields)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(
      ([k, v]) =>
        `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(String(v))}" />`,
    )
    .join("");
}

export function renderClientTableCountText(
  count: number,
  opts?: { noun?: string; hint?: string },
): string {
  const noun = opts?.noun ?? "registros";
  const label =
    count === 1
      ? `Mostrando 1 ${noun.replace(/s$/, "")}`
      : `Mostrando ${count} ${noun}`;
  if (opts?.hint) {
    return `${label} ${opts.hint}`;
  }
  return label;
}

export function renderClientTableFooter(opts: ClientTableFooterOptions): string {
  const limitParam = opts.limitParamName ?? "limit";
  const storageKey = CLIENT_TABLE_LIMIT_STORAGE[opts.tableKey];
  const noun = opts.noun ?? "registros";
  const countText = renderClientTableCountText(opts.count, {
    noun,
    hint: opts.countHint,
  });
  const limitOpts = CLIENT_TABLE_LIMIT_OPTIONS.map((n) => {
    const on = n === opts.limit;
    return `<option value="${n}"${on ? " selected" : ""}>Últimos ${n}</option>`;
  }).join("");

  const limitSelect = `<label class="tv-client-data-table__footer-limit-label">
          <span class="tv-client-data-table__footer-limit-text">Ver</span>
          <select name="${limitParam}" class="tv-filter-input tv-client-data-table__limit-select"${opts.clientSideLimit ? ` data-tv-client-table-limit data-base-path="${escapeHtml(opts.basePath)}"` : " data-tv-table-limit-select"} data-storage-key="${escapeHtml(storageKey)}" aria-label="Cantidad de filas">
            ${limitOpts}
          </select>
        </label>`;

  const limitControl = opts.clientSideLimit
    ? `<div class="tv-client-data-table__footer-limit">${limitSelect}</div>`
    : `<form method="get" action="${escapeHtml(opts.basePath)}" class="tv-client-data-table__footer-limit">
        ${renderHiddenFields(opts.hiddenFields)}
        ${limitSelect}
      </form>`;

  return `<footer class="tv-client-data-table__footer">
    <p class="tv-client-data-table__footer-meta"${opts.clientSideLimit ? ` id="tv-client-table-footer-meta-${escapeHtml(opts.tableKey)}"` : ""}>${escapeHtml(countText)}</p>
    <div class="tv-client-data-table__footer-actions">
      ${opts.extraHtml ?? ""}
      ${limitControl}
    </div>
  </footer>`;
}

export function renderClientDataTablePanel(tableHtml: string, footerHtml: string): string {
  return `<section class="tv-panel tv-client-dash-table-panel tv-dlr-report__table-panel tv-client-data-table-panel">
    <div class="tv-client-dash-table-inner tv-dlr-report__table-inner tv-client-data-table__inner">
      <div class="table-wrap tv-dlr-report__table-wrap tv-client-data-table__scroll">
        ${tableHtml}
      </div>
      ${footerHtml}
    </div>
  </section>`;
}

export function getClientTableLimitScriptBody(): string {
  return `(function () {
  document.querySelectorAll("[data-tv-table-limit-select]").forEach(function (sel) {
    sel.addEventListener("change", function () {
      var key = sel.getAttribute("data-storage-key");
      if (key) {
        try { localStorage.setItem(key, sel.value); } catch (_err) { /* ignore */ }
      }
      var form = sel.closest("form");
      if (form) form.submit();
    });
  });

  document.querySelectorAll("[data-tv-client-table-limit]").forEach(function (sel) {
    sel.addEventListener("change", function () {
      var key = sel.getAttribute("data-storage-key");
      if (key) {
        try { localStorage.setItem(key, sel.value); } catch (_err) { /* ignore */ }
      }
      var base = sel.getAttribute("data-base-path") || window.location.pathname;
      var params = new URLSearchParams(window.location.search);
      params.set(sel.getAttribute("name") || "limit", sel.value);
      window.location.assign(base + "?" + params.toString());
    });
  });

  var params = new URLSearchParams(window.location.search);
  if (params.has("limit") || params.has("page_size")) return;
  var select = document.querySelector("[data-tv-table-limit-select]");
  if (!select) return;
  var storageKey = select.getAttribute("data-storage-key");
  if (!storageKey) return;
  var stored = null;
  try { stored = localStorage.getItem(storageKey); } catch (_err) { /* ignore */ }
  if (stored !== "20" && stored !== "50" && stored !== "100") return;
  params.set(select.getAttribute("name") || "limit", stored);
  window.location.replace(window.location.pathname + "?" + params.toString());
})();`;
}
