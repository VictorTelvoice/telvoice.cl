#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const sqlPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../supabase/migrations/060_sim_subscriptions.sql",
);
const sql = readFileSync(sqlPath, "utf8");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(sql);
  console.log("✅ Migración 060_sim_subscriptions aplicada");
} finally {
  await client.end();
}
