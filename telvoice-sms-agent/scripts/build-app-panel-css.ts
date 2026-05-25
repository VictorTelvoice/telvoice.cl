/**
 * Genera public/app-panel.css (shell admin + estilos panel cliente) para cache del navegador.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAdminStyles } from "../src/views/admin-ui/styles.js";
import { getAppPanelStyles } from "../src/views/app-ui/app-styles.js";

const MATERIAL_SYMBOLS_FIX = `
.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  vertical-align: middle;
  user-select: none;
}
`;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "public", "app-panel.css");
const css = `${MATERIAL_SYMBOLS_FIX}${getAdminStyles()}${getAppPanelStyles()}`;

writeFileSync(outPath, css, "utf8");
const verPath = path.join(root, "public", "app-panel.ver");
writeFileSync(verPath, String(Date.now()), "utf8");
console.info(`[build:app-css] ${outPath} (${css.length} bytes)`);
