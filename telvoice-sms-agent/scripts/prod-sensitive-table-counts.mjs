#!/usr/bin/env node
/**
 * Conteos lógicos mínimos pre/post cambios en producción (sin datos personales).
 * wallets → company_sms_wallets en BD.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";

/** Etiqueta en reporte → tabla real en public. */
export const SENSITIVE_TABLE_COUNTS = [
  { label: "sms_orders", table: "sms_orders" },
  { label: "wallets", table: "company_sms_wallets" },
  { label: "wallet_transactions", table: "wallet_transactions" },
  { label: "sim_activation_requests", table: "sim_activation_requests" },
  { label: "agent_plan_requests", table: "agent_plan_requests" },
  { label: "client_numbers", table: "client_numbers" },
  { label: "companies", table: "companies" },
];

export async function fetchSensitiveTableCounts(client) {
  const counts = {};
  for (const { label, table } of SENSITIVE_TABLE_COUNTS) {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS n FROM ${table}`,
    );
    counts[label] = rows[0]?.n ?? 0;
  }
  return counts;
}

export function formatCounts(counts) {
  return SENSITIVE_TABLE_COUNTS.map(({ label }) => `${label}: ${counts[label]}`).join(
    "\n",
  );
}

export function parseCountsFile(text) {
  const counts = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([a-z_]+):\s*(\d+)\s*$/i);
    if (!match) continue;
    counts[match[1]] = Number.parseInt(match[2], 10);
  }
  return counts;
}

export function findCountRegressions(before, after) {
  const regressions = [];
  for (const { label } of SENSITIVE_TABLE_COUNTS) {
    const prev = before[label];
    const next = after[label];
    if (typeof prev !== "number" || typeof next !== "number") continue;
    if (next < prev) {
      regressions.push({ table: label, before: prev, after: next });
    }
  }
  return regressions;
}

function printUsage() {
  console.error(`Uso:
  node scripts/prod-sensitive-table-counts.mjs
  node scripts/prod-sensitive-table-counts.mjs --save /tmp/telvoice-prod-counts-pre.txt
  node scripts/prod-sensitive-table-counts.mjs --compare /tmp/telvoice-prod-counts-pre.txt`);
}

async function main() {
  const args = process.argv.slice(2);
  let savePath = "";
  let comparePath = "";

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--save" && args[i + 1]) {
      savePath = args[i + 1];
      i += 1;
    } else if (args[i] === "--compare" && args[i + 1]) {
      comparePath = args[i + 1];
      i += 1;
    } else if (args[i] === "--help" || args[i] === "-h") {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Argumento desconocido: ${args[i]}`);
      printUsage();
      process.exit(1);
    }
  }

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    console.error("ERROR: DATABASE_URL no está definido.");
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString,
    ssl: connectionString.includes("supabase")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  await client.connect();
  try {
    const counts = await fetchSensitiveTableCounts(client);
    const formatted = formatCounts(counts);
    console.log(formatted);

    if (savePath) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(savePath, `${formatted}\n`, "utf8");
      console.error(`OK: conteos guardados en ${savePath}`);
    }

    if (comparePath) {
      const previousText = readFileSync(comparePath, "utf8");
      const previous = parseCountsFile(previousText);
      const regressions = findCountRegressions(previous, counts);
      if (regressions.length) {
        console.error("ERROR: conteos disminuyeron tras el cambio:");
        for (const row of regressions) {
          console.error(`  ${row.table}: ${row.before} -> ${row.after}`);
        }
        process.exit(1);
      }
      console.error("OK: conteos sensibles no disminuyeron.");
    }
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error("ERROR:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
