import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CLIENT_PANEL_MANUAL_FILENAME = "manual-panel-cliente-envio-sms.md";

const __dirname = dirname(fileURLToPath(import.meta.url));

function manualCandidatePaths(): string[] {
  const cwd = process.cwd();
  return [
    join(cwd, "docs", CLIENT_PANEL_MANUAL_FILENAME),
    join(cwd, "telvoice-sms-agent", "docs", CLIENT_PANEL_MANUAL_FILENAME),
    join(__dirname, "..", "..", "docs", CLIENT_PANEL_MANUAL_FILENAME),
  ];
}

export function readClientPanelManualMarkdown(): string {
  for (const path of manualCandidatePaths()) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      /* siguiente candidato */
    }
  }
  throw new Error(
    `No se encontró ${CLIENT_PANEL_MANUAL_FILENAME} en docs/. Ejecuta desde la raíz del proyecto telvoice-sms-agent.`,
  );
}
