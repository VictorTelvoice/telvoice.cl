#!/usr/bin/env node
/** Preset carga API: 5 envíos aSMSC secuenciales por tick, pacing 1s. */
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
  queue_min_pace_seconds: 1,
  asmsc_max_sends_per_tick: 5,
  asmsc_inter_send_ms: 200,
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
  console.log("OK: preset carga API en BD:", value);
} finally {
  await client.end();
}
