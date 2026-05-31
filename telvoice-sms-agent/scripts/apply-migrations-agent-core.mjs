#!/usr/bin/env node
/**
 * Aplica migraciones 039–044 del Agent Core solo si faltan.
 * Requiere DATABASE_URL en .env
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "../supabase/migrations");

const MIGRATIONS = [
  {
    id: "039",
    file: "039_panel_agent.sql",
    check: `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'panel_agent_sessions'`,
  },
  {
    id: "040",
    file: "040_panel_client_knowledge.sql",
    check: `SELECT 1 FROM knowledge_articles
      WHERE category = 'panel_cliente' LIMIT 1`,
  },
  {
    id: "041",
    file: "041_agent_pending_actions.sql",
    check: `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'agent_pending_actions'`,
  },
  {
    id: "042",
    file: "042_agent_unanswered_questions.sql",
    check: `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'agent_unanswered_questions'`,
  },
  {
    id: "043",
    file: "043_knowledge_channels.sql",
    check: `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'knowledge_articles'
        AND column_name = 'allowed_channels'`,
  },
  {
    id: "044",
    file: "044_agent_knowledge_manual.sql",
    check: `SELECT 1 FROM knowledge_articles
      WHERE category IN ('estrategia', 'panel_cliente')
        AND (title ILIKE '%campaña masiva%' OR title ILIKE '%retail%')
      LIMIT 1`,
  },
  {
    id: "045",
    file: "045_agent_training_flow.sql",
    check: `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'knowledge_articles'
        AND column_name = 'source_unanswered_question_id'`,
  },
  {
    id: "046",
    file: "046_agent_persona_memory_feedback.sql",
    check: `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'agent_feedback'`,
  },
  {
    id: "047",
    file: "047_fix_panel_agent_sessions_user_fk.sql",
    check: `SELECT 1 WHERE NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.panel_agent_sessions'::regclass
        AND conname = 'panel_agent_sessions_user_id_fkey'
    )`,
  },
  {
    id: "048",
    file: "048_panel_agent_send_sms_knowledge.sql",
    check: `SELECT 1 FROM knowledge_articles
      WHERE title = 'Cómo enviar SMS desde el panel cliente'
      LIMIT 1`,
  },
  {
    id: "050",
    file: "050_agent_feedback_review_flow.sql",
    check: `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agent_feedback'
        AND column_name = 'status'`,
  },
  {
    id: "051",
    file: "051_agent_feedback_knowledge_fixes.sql",
    check: `SELECT 1 FROM knowledge_articles
      WHERE title = 'Número de destino no autorizado en Telvoice'
      LIMIT 1`,
  },
];

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("ERROR: DATABASE_URL no está definido en .env");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("supabase")
    ? { rejectUnauthorized: false }
    : undefined,
});

async function isApplied(checkSql) {
  const { rows } = await client.query(checkSql);
  return rows.length > 0;
}

await client.connect();
try {
  for (const m of MIGRATIONS) {
    const applied = await isApplied(m.check);
    if (applied) {
      console.log(`SKIP ${m.id} — ya aplicada`);
      continue;
    }
    const path = join(migrationsDir, m.file);
    const sql = readFileSync(path, "utf8");
    console.log(`APPLY ${m.id} — ${m.file}`);
    await client.query(sql);
    const ok = await isApplied(m.check);
    if (!ok) {
      console.error(`ERROR: ${m.id} aplicada pero la verificación falló`);
      process.exit(1);
    }
    console.log(`OK ${m.id}`);
  }
  console.log("\nTodas las migraciones Agent Core están al día.");
} catch (err) {
  console.error("ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
