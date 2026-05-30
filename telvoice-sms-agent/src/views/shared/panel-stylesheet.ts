import { readFileSync } from "node:fs";
import { getPublicDir } from "../../utils/public-dir.js";

/** URL cacheable del bundle CSS del panel (admin + cliente). */
export function panelStylesheetHref(): string {
  try {
    const ver = readFileSync(`${getPublicDir()}/app-panel.ver`, "utf8").trim();
    return ver ? `/app-panel.css?v=${encodeURIComponent(ver)}` : "/app-panel.css";
  } catch {
    return "/app-panel.css";
  }
}

export function renderPanelStylesheetLink(): string {
  return `<link rel="stylesheet" href="${panelStylesheetHref()}" />`;
}
