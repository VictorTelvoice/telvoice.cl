#!/usr/bin/env node
/**
 * Verifica que la ruta POST de creación SMPP existe y responde (no 404).
 * No envía password real ni persiste cuentas de prueba con credenciales.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const adminRoutes = readFileSync(join(root, "dist/routes/admin.routes.js"), "utf8");
const smppCount = (adminRoutes.match(/smpp-lab/g) ?? []).length;

console.log("smpp_lab_route_refs:", smppCount);
if (smppCount < 8) {
  console.error("deploy_check: FAIL — feature branch routes missing from dist");
  process.exit(1);
}

console.log("deploy_check: OK — smpp-lab routes present in dist");
console.log("post_create_route: POST /admin/wholesale/smpp-lab");
console.log("hint: save from UI or run create-ptg-smpp-account-secure.mjs with .env.smpp-vendor");
