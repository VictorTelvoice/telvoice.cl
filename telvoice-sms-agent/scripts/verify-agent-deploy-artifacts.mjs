#!/usr/bin/env node
/**
 * Verifica que el build local/VPS tenga artefactos críticos del agente alineados.
 * Uso: npm run verify:agent-deploy
 *      APP_ROOT=/var/www/telvoice-sms-agent node scripts/verify-agent-deploy-artifacts.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(
  process.env.APP_ROOT?.trim() || path.join(__dirname, ".."),
);

function read(relPath) {
  const full = path.join(APP_ROOT, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Falta archivo: ${relPath}`);
  }
  return fs.readFileSync(full, "utf8");
}

function assertIncludes(relPath, needle, label) {
  const content = read(relPath);
  if (!content.includes(needle)) {
    throw new Error(`${label}: «${relPath}» no contiene «${needle}»`);
  }
  console.log(`✓ ${label}`);
}

function assertFile(relPath, label) {
  const full = path.join(APP_ROOT, relPath);
  if (!fs.statSync(full).isFile()) {
    throw new Error(`${label}: no es archivo (${relPath})`);
  }
  console.log(`✓ ${label}: ${relPath}`);
}

console.log("=== verify:agent-deploy ===\n");
console.log(`APP_ROOT=${APP_ROOT}\n`);

assertFile("dist/index.js", "entrypoint");
assertFile("dist/services/agent/agentCore.js", "agentCore.js");
assertFile("dist/services/agent/agentPurchaseFlow.js", "agentPurchaseFlow.js");
assertFile("dist/services/agent/executePendingAction.js", "executePendingAction.js");
assertFile("dist/services/agent/agentSendSmsFlowUi.js", "agentSendSmsFlowUi.js");
assertFile(
  "dist/services/agent/agentSalesMetricsService.js",
  "agentSalesMetricsService.js",
);
assertFile(
  "dist/controllers/admin-agent-sales.controller.js",
  "admin-agent-sales.controller.js",
);

assertIncludes(
  "dist/services/agent/agentCore.js",
  "agentPurchaseFlow",
  "agentCore importa agentPurchaseFlow",
);
assertIncludes(
  "dist/services/agent/agentCore.js",
  "tryActivePurchaseFlowFirst",
  "agentCore ejecuta flujo compra",
);
assertIncludes(
  "dist/services/agent/executePendingAction.js",
  "formatAgentCampaignAcceptedMessage",
  "copy confirmación campaña",
);
assertIncludes(
  "dist/services/agent/executePendingAction.js",
  "Saldo antes del envío",
  "copy saldo en confirmación",
);
assertIncludes(
  "dist/services/agent/agentSendSmsFlowUi.js",
  "shouldShowCsvAttachButton",
  "UI adjuntar CSV",
);

assertFile("public/css/telvoice-agent-widget.css", "widget CSS");
assertIncludes(
  "public/css/telvoice-agent-widget.css",
  ".tva-csv-chip",
  "estilos chip CSV",
);

const verPath = "public/telvoice-agent-widget.ver";
assertFile(verPath, "cache bust widget");
const ver = read(verPath).trim();
if (!/^\d{10,}$/.test(ver)) {
  throw new Error(`telvoice-agent-widget.ver inválido: ${ver}`);
}
console.log(`✓ telvoice-agent-widget.ver (${ver})`);

const pkg = JSON.parse(read("package.json"));
console.log(`✓ package version ${pkg.version}`);

const appPages = read("dist/views/app-ui/app-pages.js");
const kpiMatch = appPages.match(/label:\s*"([^"]+)"[\s\S]{0,120}?smsTodayTotal/);
if (!kpiMatch || kpiMatch[1] !== "SMS Hoy") {
  throw new Error(
    `KPI dashboard incorrecto: esperado «SMS Hoy», encontrado «${kpiMatch?.[1] ?? "—"}»`,
  );
}
console.log("✓ KPI dashboard: SMS Hoy");

console.log("\nOK — artefactos de deploy del agente verificados.");
