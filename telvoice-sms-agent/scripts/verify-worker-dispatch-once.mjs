#!/usr/bin/env node
/**
 * Prueba técnica dispatchProviderSend — 1 SMS aislado (sin campaña/cola).
 * Por defecto dry-run. Requiere --confirm para enviar.
 *
 * Uso dry-run:
 *   node scripts/verify-worker-dispatch-once.mjs \
 *     --provider-id UUID --route-id UUID --to +569... --sender TELVOICE --text "..."
 *
 * Uso real (requiere autorización explícita):
 *   node scripts/verify-worker-dispatch-once.mjs ... --confirm
 */
import "dotenv/config";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));

function getFlag(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args[i + 1] ?? null;
}

const providerId = getFlag("--provider-id");
const routeId = getFlag("--route-id");
const to = getFlag("--to");
const senderId = getFlag("--sender") ?? "TELVOICE";
const text = getFlag("--text") ?? "Prueba técnica dispatch once Telvoice";
const confirm = flags.has("--confirm");
const createPanel = flags.has("--create-panel-message");

if (!providerId || !routeId || !to) {
  console.error(
    "Uso: node scripts/verify-worker-dispatch-once.mjs --provider-id UUID --route-id UUID --to +569... [--sender TELVOICE] [--text msg] [--confirm] [--create-panel-message]",
  );
  process.exit(1);
}

const { getSmsProviderById } = await import(
  "../dist/services/smsProviderService.js"
);
const { getSmsRouteById } = await import("../dist/services/smsRouteService.js");
const { dispatchProviderSend } = await import(
  "../dist/services/smsProviderDispatchService.js"
);
const { resolveHttpApiCredentials } = await import(
  "../dist/services/providerCredentialsService.js"
);
const { phoneToAsmscDigits } = await import(
  "../dist/services/sms-providers/realApiProvider.js"
);
const { buildDlrCallbackUrl } = await import("../dist/config/env.js");

function maskApiId(id) {
  if (!id) return null;
  return id.length <= 6 ? "***" : `${id.slice(0, 4)}…${id.slice(-2)}`;
}

const provider = await getSmsProviderById(providerId);
if (!provider) {
  console.error("Proveedor no encontrado");
  process.exit(1);
}
const route = await getSmsRouteById(routeId);
if (!route || route.provider_id !== provider.id) {
  console.error("Ruta no válida para proveedor");
  process.exit(1);
}

const creds = resolveHttpApiCredentials(provider);
const payloadPreview = {
  endpoint: `${creds.baseUrl.replace(/\/$/, "")}/SendSMS`,
  api_id_masked: maskApiId(creds.apiId),
  sender_id: senderId,
  phonenumber: phoneToAsmscDigits(to),
  textmessage: text,
  callback_url: buildDlrCallbackUrl() ?? null,
  provider_id: providerId,
  route_id: routeId,
  route_name: route.name,
  provider_code: provider.code,
};

console.log("=== verify-worker-dispatch-once ===");
console.log(JSON.stringify({ mode: confirm ? "LIVE_SEND" : "DRY_RUN", payload: payloadPreview }, null, 2));

if (!confirm) {
  console.log("\nDry-run OK. Agrega --confirm para enviar 1 SMS real (sin wallet/cola por defecto).");
  process.exit(0);
}

console.warn("\n⚠ Enviando 1 SMS real (--confirm)...");

const result = await dispatchProviderSend(provider, {
  to,
  message: text,
  senderId,
  metadata: { source: "verify_worker_dispatch_once", route_id: routeId },
});

console.log("\n=== RESULTADO ===");
console.log(
  JSON.stringify(
    {
      accepted: result.accepted,
      status: result.status,
      provider_message_id: result.provider_message_id,
      error_code: result.error_code,
      error_message: result.error_message,
      raw_response: result.raw_response,
    },
    null,
    2,
  ),
);

if (createPanel) {
  console.warn("Nota: --create-panel-message no implementado; no se creó fila panel.");
}

process.exit(result.accepted ? 0 : 1);
