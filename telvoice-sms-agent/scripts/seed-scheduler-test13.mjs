#!/usr/bin/env node
/**
 * Guarda preset Test13 en platform_runtime_settings (override scheduler).
 * Uso: npm run seed:scheduler-test13
 */
import "dotenv/config";
import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("ERROR: DATABASE_URL no está definido.");
  process.exit(1);
}

const value = {
  enabled: true,
  interval_seconds: 1,
  batch_size: 20,
  queue_min_pace_seconds: 3,
};

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("supabase")
    ? { rejectUnauthorized: false }
    : undefined,
});

await client.connect();
try {
  await client.query(
    `INSERT INTO platform_runtime_settings (key, value)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    ["sms_queue_scheduler", JSON.stringify(value)],
  );
  console.log("OK: scheduler Test13 en BD:", value);
} catch (err) {
  console.error("ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
