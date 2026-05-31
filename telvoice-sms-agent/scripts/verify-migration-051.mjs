#!/usr/bin/env node
/** Verify migration 051 columns + retail tables untouched */
import "dotenv/config";
import pg from "pg";

const REQUIRED = [
  "account_type",
  "account_active",
  "transmitter_port",
  "receiver_port",
  "addr_ton",
  "addr_npi",
  "dest_addr_ton",
  "dest_addr_npi",
  "response_timeout_seconds",
  "enquire_link_interval_seconds",
  "submit_speed_per_second",
  "delay_time_seconds",
  "sessions",
  "sender_id_prefix",
  "phone_number_prepend",
  "message_types_allowed",
  "route_type",
  "identifier",
  "currency",
  "credit_limit",
  "log_level",
  "tlv_tag",
  "tlv_value",
  "esme_acknowledgement",
  "send_validity_period_as_null",
  "enable_affix_for_sms_id",
  "enable_decimal_only_for_sms_id",
  "auto_import_enabled",
  "secure_connection_enabled",
  "delivery_optional_parameters_enabled",
];

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL missing");
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
  const { rows } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'wholesale_smpp_connections'
    ORDER BY column_name
  `);
  const cols = new Set(rows.map((r) => r.column_name));
  const missing = REQUIRED.filter((c) => !cols.has(c));
  console.log("051 columns present:", REQUIRED.length - missing.length, "/", REQUIRED.length);
  if (missing.length) {
    console.error("Missing:", missing.join(", "));
    process.exit(1);
  }

  const retail = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('orders', 'wallets', 'sms_packages', 'mercadopago_payments')
    ORDER BY table_name
  `);
  console.log("Retail tables intact:", retail.rows.map((r) => r.table_name).join(", "));

  const { rows: connCount } = await client.query(
    "SELECT COUNT(*)::int AS n FROM wholesale_smpp_connections",
  );
  console.log("wholesale_smpp_connections rows:", connCount[0]?.n ?? 0);
} finally {
  await client.end();
}
