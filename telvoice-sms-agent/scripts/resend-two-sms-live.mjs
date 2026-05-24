#!/usr/bin/env node
/**
 * Reenvío real (live_test) de los 2 últimos SMS que fueron mock.
 * Requiere ASMSC_* en .env y variables live_test (ver docs/sms-live-test.md).
 *
 * Uso (ejemplo, sin commitear valores):
 *   SMS_LIVE_TEST_ENABLED=true \
 *   SMS_PROVIDER_MODE=live_test \
 *   SMS_LIVE_TEST_ALLOWED_COMPANY_IDS=<uuid-empresa-demo> \
 *   SMS_LIVE_TEST_ALLOWED_NUMBERS=+56934449937,+56973824023 \
 *   SMS_LIVE_TEST_DAILY_LIMIT=20 \
 *   SMS_LIVE_TEST_MIN_SECONDS_BETWEEN_SENDS=5 \
 *   node scripts/resend-two-sms-live.mjs
 */
import "dotenv/config";

const DEMO_COMPANY_ID =
  process.env.QA_COMPANY_ID || "6cd1db92-d5c7-45e0-8548-df8907843350";

const RESENDS = [
  {
    to: "+56934449937",
    message: "hola Victor",
    senderId: "TELVOICE",
  },
  {
    to: "+56973824023",
    message: "hola prueba 545667",
    senderId: "TELVOICE",
  },
];

function requireEnv(name) {
  if (!process.env[name]?.trim()) {
    console.error(`Falta ${name}. No se enviará SMS real.`);
    process.exit(1);
  }
}

requireEnv("ASMSC_API_ID");
requireEnv("ASMSC_API_PASSWORD");
requireEnv("DATABASE_URL");
requireEnv("SUPABASE_URL");
requireEnv("SUPABASE_SERVICE_ROLE_KEY");

if (process.env.SMS_LIVE_TEST_ENABLED !== "true") {
  console.error("SMS_LIVE_TEST_ENABLED debe ser true para este script.");
  process.exit(1);
}
if (process.env.SMS_PROVIDER_MODE !== "live_test") {
  console.error("SMS_PROVIDER_MODE debe ser live_test.");
  process.exit(1);
}

const { sendLiveTestSms } = await import("../dist/services/smsSendService.js");

console.log("Reenvío real controlado — 2 mensajes (Empresa Demo)\n");

for (let i = 0; i < RESENDS.length; i++) {
  const item = RESENDS[i];
  console.log(`--- ${i + 1}/${RESENDS.length} → ${item.to} ---`);
  try {
    const result = await sendLiveTestSms({
      companyId: DEMO_COMPANY_ID,
      senderId: item.senderId,
      to: item.to,
      message: item.message,
      campaignName: `Reenvío real ${new Date().toISOString().slice(0, 16)}`,
    });
    console.log("OK", {
      messageId: result.messageId,
      providerMessageId: result.providerMessageId,
      status: result.status,
      balanceAfter: result.balanceAfter,
      sendMode: result.sendMode,
    });
  } catch (err) {
    console.error("FALLO", err instanceof Error ? err.message : err);
    process.exit(1);
  }
  if (i < RESENDS.length - 1) {
    const waitSec = Number(process.env.SMS_LIVE_TEST_MIN_SECONDS_BETWEEN_SENDS || 60);
    if (waitSec > 0) {
      console.log(`Esperando ${waitSec}s (intervalo live_test)…`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    }
  }
}

console.log("\nReenvío completado.");
