import "dotenv/config";
import { env } from "../src/config/env.js";
import {
  getRestV1BaseUrl,
  maskSecret,
  normalizeSupabaseUrl,
} from "../src/database/supabase-factory.js";

async function fetchTable(table: string): Promise<void> {
  const base = getRestV1BaseUrl(env.supabase.url);
  const url = `${base}/${table}?select=id&limit=1`;
  const key = env.supabase.serviceRoleKey;

  console.log(`\n  --- REST GET /${table} ---`);
  console.log(`  URL: ${url}`);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });

  const bodyText = await response.text();
  let bodyPreview = bodyText;
  if (bodyText.length > 500) {
    bodyPreview = `${bodyText.slice(0, 500)}…`;
  }

  console.log(`  HTTP status: ${response.status} ${response.statusText}`);
  console.log(`  Body: ${bodyPreview || "(vacío)"}`);
}

async function main(): Promise<void> {
  const rawUrl = (process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  console.log("");
  console.log("  Debug Supabase REST directo — Telvoice SMS Agent");
  console.log("");

  console.log(`  SUPABASE_URL (raw):        ${rawUrl || "(vacío)"}`);
  console.log(
    `  REST base:                 ${rawUrl ? getRestV1BaseUrl(rawUrl) : "(vacío)"}`,
  );
  console.log(
    `  SERVICE_ROLE_KEY:          ${key ? maskSecret(key) : "NO CONFIGURADA"}`,
  );
  console.log(
    `  Nota: SUPABASE_URL no debe terminar en /rest/v1 en .env`,
  );

  if (!env.supabase.url || !key) {
    console.log("\n  Completa .env antes de continuar.");
    process.exit(1);
  }

  await fetchTable("clients");
  await fetchTable("admin_users");

  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
