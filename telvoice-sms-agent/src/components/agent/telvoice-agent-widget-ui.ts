/** UI compartida del agente flotante Telvoice (misma estética que landing). */

export const TELVOICE_AGENT_WIDGET_CSS_HREF = "/css/telvoice-agent-widget.css";
export const TELVOICE_AGENT_ISOTIPO = "/assets/telvoice-agent-isotipo.png";

export type TelvoiceAgentWidgetVariant = "app" | "admin";

export type TelvoiceAgentWidgetLabels = {
  title: string;
  subtitle: string;
  fabAriaLabel: string;
  dialogAriaLabel: string;
};

export const TELVOICE_AGENT_LABELS: Record<TelvoiceAgentWidgetVariant, TelvoiceAgentWidgetLabels> = {
  app: {
    title: "Agente Telvoice",
    subtitle: "Asistente operativo de tu cuenta",
    fabAriaLabel: "Abrir asistente Telvoice",
    dialogAriaLabel: "Asistente operativo Telvoice",
  },
  admin: {
    title: "Agente Telvoice Admin",
    subtitle: "Diagnóstico y entrenamiento",
    fabAriaLabel: "Abrir asistente Telvoice Admin",
    dialogAriaLabel: "Asistente Telvoice para superadmin",
  },
};

export function renderTelvoiceAgentStylesheetLink(): string {
  return `<link rel="stylesheet" href="${TELVOICE_AGENT_WIDGET_CSS_HREF}" />`;
}

/** Banner de identidad en páginas hub de entrenamiento (superadmin). */
export function renderTelvoiceAgentHubBanner(labels: TelvoiceAgentWidgetLabels): string {
  return `<div class="tva-agent-hub-banner" role="region" aria-label="${labels.dialogAriaLabel}">
    <img src="${TELVOICE_AGENT_ISOTIPO}" alt="" width="48" height="48" decoding="async" />
    <div>
      <h2>${labels.title}</h2>
      <p>${labels.subtitle}</p>
    </div>
    <span class="tva-agent-hub-badge" aria-label="Estado del agente">En línea</span>
  </div>`;
}

export type TelvoiceAgentWidgetShellOptions = {
  variant: TelvoiceAgentWidgetVariant;
  rootId: string;
  fabId: string;
  panelId: string;
  /** Clases extra en .tva-root (p. ej. tva-root--embedded tva-root--quick-visible) */
  rootExtraClass?: string;
  inputPlaceholder?: string;
  showInput?: boolean;
  /** Panel cliente: adjuntar CSV en el chat del agente */
  showCsvAttach?: boolean;
};

export function renderTelvoiceAgentWidgetShell(options: TelvoiceAgentWidgetShellOptions): string {
  const labels = TELVOICE_AGENT_LABELS[options.variant];
  const rootClass = [
    "tva-root",
    "tva-root--embedded",
    "tva-root--quick-visible",
    options.rootExtraClass ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const showInput = options.showInput !== false;
  const placeholder = options.inputPlaceholder ?? "Escribe tu consulta…";

  return `<div class="${rootClass}" id="${options.rootId}" aria-live="polite">
  <div class="tva-launcher-wrap">
    <button type="button" class="tva-launcher" id="${options.fabId}" aria-expanded="false" aria-controls="${options.panelId}" aria-label="${labels.fabAriaLabel}">
      <img src="${TELVOICE_AGENT_ISOTIPO}" alt="" width="48" height="48" decoding="async" data-tva-iso="1" />
      <span class="tva-launcher-online" aria-hidden="true" title="En línea"></span>
    </button>
  </div>
  <div id="${options.panelId}" class="tva-panel" role="dialog" aria-labelledby="${options.rootId}-title" aria-modal="true">
    <div class="tva-header">
      <img src="${TELVOICE_AGENT_ISOTIPO}" alt="" width="40" height="40" decoding="async" data-tva-iso="1" />
      <div class="tva-header-text">
        <h2 id="${options.rootId}-title">${labels.title}</h2>
        <p>${labels.subtitle}</p>
      </div>
      <button type="button" class="tva-close" id="${options.rootId}-close" aria-label="Cerrar chat"><span aria-hidden="true">×</span></button>
    </div>
    <div class="tva-suggestions" id="${options.rootId}-suggestions">
      <div class="tva-suggestions-panel" id="${options.rootId}-suggestions-panel">
        <div class="tva-quick" id="${options.rootId}-quick"></div>
      </div>
    </div>
    <div class="tva-messages" id="${options.rootId}-log" aria-live="polite"></div>
    ${
      showInput
        ? `<form class="tva-form" id="${options.rootId}-form">
      ${
        options.showCsvAttach
          ? `<input type="file" id="${options.rootId}-csv" accept=".csv,text/csv,text/plain" class="tva-csv-input" hidden />
      <button type="button" class="tva-attach" id="${options.rootId}-attach" aria-label="Adjuntar CSV" title="Adjuntar planilla CSV">📎</button>`
          : ""
      }
      <input type="text" id="${options.rootId}-input" placeholder="${placeholder}" autocomplete="off" maxlength="2000" />
      <button type="submit" id="${options.rootId}-send">Enviar</button>
    </form>
    ${
      options.showCsvAttach
        ? `<p class="tva-file-hint" id="${options.rootId}-file-hint" hidden></p>`
        : ""
    }`
        : ""
    }
  </div>
</div>`;
}
