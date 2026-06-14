/**
 * Genera public/app-panel.css (shell admin + estilos panel cliente) para cache del navegador.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAdminStyles } from "../src/views/admin-ui/styles.js";
import { getAppPanelStyles } from "../src/views/app-ui/app-styles.js";
import { getLabPanelThemeStyles } from "../src/views/app-ui/lab-theme-styles.js";
import { getLightPanelThemeStyles } from "../src/views/app-ui/light-theme-styles.js";
import { getPanelThemeToggleStyles } from "../src/views/app-ui/panel-theme.js";
import { getSmsMpSubscriptionBannerStyles } from "../src/views/app-ui/app-sms-subscription-ui.js";
import { getPanelFloatingAgentToggleStyles } from "../src/components/agent/panel-floating-agent-toggle.js";

const MATERIAL_SYMBOLS_FIX = `
.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  vertical-align: middle;
  user-select: none;
}
`;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "public", "app-panel.css");
const css = `${MATERIAL_SYMBOLS_FIX}${getAdminStyles()}${getAppPanelStyles()}${getLabPanelThemeStyles()}${getLightPanelThemeStyles()}${getPanelThemeToggleStyles()}${getSmsMpSubscriptionBannerStyles()}${getPanelFloatingAgentToggleStyles()}`;

writeFileSync(outPath, css, "utf8");
const ver = String(Date.now());
const verPath = path.join(root, "public", "app-panel.ver");
writeFileSync(verPath, ver, "utf8");
const agentVerPath = path.join(root, "public", "telvoice-agent-widget.ver");
writeFileSync(agentVerPath, ver, "utf8");
console.info(`[build:app-css] ${outPath} (${css.length} bytes)`);
console.info(`[build:app-css] cache bust: app-panel.ver + telvoice-agent-widget.ver`);
