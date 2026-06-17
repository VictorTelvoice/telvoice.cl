/** UI compartida del agente flotante Telvoice (misma estética que landing). */

import { readFileSync } from "node:fs";
import { getPublicDir } from "../../utils/public-dir.js";

export const TELVOICE_AGENT_WIDGET_CSS_HREF = "/css/telvoice-agent-widget.css";

export function telvoiceAgentWidgetStylesheetHref(): string {
  try {
    const ver = readFileSync(
      `${getPublicDir()}/telvoice-agent-widget.ver`,
      "utf8",
    ).trim();
    return ver
      ? `${TELVOICE_AGENT_WIDGET_CSS_HREF}?v=${encodeURIComponent(ver)}`
      : TELVOICE_AGENT_WIDGET_CSS_HREF;
  } catch {
    return TELVOICE_AGENT_WIDGET_CSS_HREF;
  }
}
export const TELVOICE_AGENT_ISOTIPO = "/assets/telvoice-agent-isotipo.png";
export const TELVOICE_AGENT_FLOATING_PNG = "/assets/telvoice-agent-floating-clean.png";
export const TELVOICE_AGENT_FLOATING_WEBP = "/assets/telvoice-agent-floating-clean.webp";
export const TELVOICE_AGENT_PROFILE_PNG = "/assets/telvoice-agent-profile.png";
export const TELVOICE_AGENT_PROFILE_WEBP = "/assets/telvoice-agent-profile.webp";
export const TELVOICE_AGENT_WIDGET_LAB_CSS_HREF = "/css/telvoice-agent-widget-lab.css";
export const TELVOICE_AGENT_WIDGET_LIGHT_CSS_HREF = "/css/telvoice-agent-widget-light.css";

function agentWidgetCssHref(path: string): string {
  try {
    const ver = readFileSync(
      `${getPublicDir()}/telvoice-agent-widget.ver`,
      "utf8",
    ).trim();
    return ver ? `${path}?v=${encodeURIComponent(ver)}` : path;
  } catch {
    return path;
  }
}

export type TelvoiceAgentStylesheetOptions = {
  /** Panel /app: carga overrides tema Lab oscuro */
  lab?: boolean;
  /** Panel /app: carga overrides modo claro (requiere .tv-light-theme en body) */
  panelLight?: boolean;
};

export function renderTelvoiceAgentStylesheetLink(options?: TelvoiceAgentStylesheetOptions): string {
  const base = `<link rel="stylesheet" href="${telvoiceAgentWidgetStylesheetHref()}" />`;
  const extras: string[] = [];
  if (options?.lab) {
    extras.push(`<link rel="stylesheet" href="${agentWidgetCssHref(TELVOICE_AGENT_WIDGET_LAB_CSS_HREF)}" />`);
  }
  if (options?.panelLight) {
    extras.push(`<link rel="stylesheet" href="${agentWidgetCssHref(TELVOICE_AGENT_WIDGET_LIGHT_CSS_HREF)}" />`);
  }
  return extras.length ? `${base}\n${extras.join("\n")}` : base;
}

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
  const useLab = options.variant === "app";
  const rootClass = [
    "tva-root",
    "tva-root--embedded",
    "tva-floating-launcher-root",
    useLab ? "tva-root--lab" : "tva-root--quick-visible",
    options.rootExtraClass ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const showInput = options.showInput !== false;
  const placeholder = options.inputPlaceholder ?? "Escribe tu consulta…";

  const launcherInner = useLab
    ? `<span class="tva-launcher-iso" data-tva-launcher-iso="1" aria-hidden="true"></span>`
    : `<img src="${TELVOICE_AGENT_ISOTIPO}" alt="" width="48" height="48" decoding="async" data-tva-iso="1" />`;

  const headerBlock = useLab
    ? `<div class="tva-header tva-header--lab">
      <div class="tva-header-brand">
        <span class="tva-header-iso" data-tva-header-iso="1" aria-hidden="true"></span>
        <div class="tva-header-text">
          <h2 id="${options.rootId}-title">${labels.title}</h2>
          <p class="tva-header-role">${labels.subtitle}</p>
        </div>
      </div>
      <span class="tva-header-status">En línea</span>
      <div class="tva-header-actions">
        <button type="button" class="tva-minimize" id="${options.rootId}-minimize" aria-label="Minimizar agente"><span aria-hidden="true">−</span></button>
        <button type="button" class="tva-close" id="${options.rootId}-close" aria-label="Cerrar agente"><span aria-hidden="true">×</span></button>
      </div>
    </div>`
    : `<div class="tva-header">
      <img src="${TELVOICE_AGENT_ISOTIPO}" alt="" width="40" height="40" decoding="async" data-tva-iso="1" />
      <div class="tva-header-text">
        <h2 id="${options.rootId}-title">${labels.title}</h2>
        <p>${labels.subtitle}</p>
      </div>
      <div class="tva-header-actions">
        <button type="button" class="tva-minimize" id="${options.rootId}-minimize" aria-label="Minimizar agente"><span aria-hidden="true">−</span></button>
        <button type="button" class="tva-close" id="${options.rootId}-close" aria-label="Cerrar agente"><span aria-hidden="true">×</span></button>
      </div>
    </div>`;

  const launcherOnlineDot = useLab
    ? ""
    : '<span class="tva-launcher-online" aria-hidden="true" title="En línea"></span>';

  return `<div class="${rootClass}" id="${options.rootId}" aria-live="polite">
  <div class="tva-launcher-wrap">
    <button type="button" class="tva-launcher" id="${options.fabId}" aria-expanded="false" aria-controls="${options.panelId}" aria-label="${labels.fabAriaLabel}">
      ${launcherInner}
      ${launcherOnlineDot}
    </button>
  </div>
  <div id="${options.panelId}" class="tva-panel" role="dialog" aria-labelledby="${options.rootId}-title" aria-modal="true">
    ${headerBlock}
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
      <button type="button" class="tva-attach" id="${options.rootId}-attach" aria-label="Adjuntar CSV" title="Adjuntar planilla CSV"><span class="material-symbols-outlined tva-attach__icon" aria-hidden="true">attach_file</span></button>`
          : ""
      }
      <input type="text" id="${options.rootId}-input" placeholder="${placeholder}" autocomplete="off" maxlength="2000" />
      <button type="submit" id="${options.rootId}-send">Enviar</button>
    </form>
    ${
      options.showCsvAttach
        ? `<div class="tva-csv-chip-wrap" id="${options.rootId}-file-hint" hidden>
      <div class="tva-csv-chip" role="status">
        <span class="tva-csv-chip__icon" aria-hidden="true">📎</span>
        <span class="tva-csv-chip__body">
          <span class="tva-csv-chip__label" id="${options.rootId}-file-label">CSV cargado</span>
          <span class="tva-csv-chip__name" id="${options.rootId}-file-name"></span>
          <span class="tva-csv-chip__meta" id="${options.rootId}-file-meta"></span>
        </span>
        <button type="button" class="tva-csv-chip__action" id="${options.rootId}-file-clear">Quitar</button>
      </div>
    </div>`
        : ""
    }`
        : ""
    }
  </div>
</div>`;
}
