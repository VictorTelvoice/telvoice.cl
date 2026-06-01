#!/usr/bin/env node
/**
 * Auditoría read-only: envíos agente / idempotency por empresa (producción).
 * No modifica wallet, no ejecuta pagos ni envíos.
 *
 * Uso:
 *   DATABASE_URL=... node scripts/audit-licantravel-agent-send-prod.mjs --company-id <UUID>
 *   TEST_COMPANY_ID=<UUID> node scripts/audit-licantravel-agent-send-prod.mjs
 *   node scripts/audit-licantravel-agent-send-prod.mjs --company-name "Licantravel"
 */
import "dotenv/config";
import pg from "pg";
import {
  parseAuditCompanyArgs,
  resolveAuditCompany,
} from "./lib/audit-company-args.mjs";

const args = parseAuditCompanyArgs(process.argv);

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

await client.connect();
try {
  const company = await resolveAuditCompany(client, args);
  const COMPANY_ID = company.id;

  const bal = await client.query(
    `SELECT available_sms, updated_at FROM company_sms_wallets WHERE company_id = $1`,
    [COMPANY_ID],
  );

  const idem = await client.query(
    `SELECT id, status, campaign_id, message_id, send_mode,
            LEFT(COALESCE(error_text, ''), 100) AS error_text,
            created_at, updated_at
     FROM sms_send_idempotency
     WHERE company_id = $1 AND updated_at > NOW() - INTERVAL '7 days'
     ORDER BY updated_at DESC
     LIMIT 20`,
    [COMPANY_ID],
  );

  const msgs = await client.query(
    `SELECT id, recipient_number, status, segments, cost_sms, mode,
            provider, provider_message_id,
            metadata->>'source' AS source,
            created_at
     FROM panel_sms_messages
     WHERE company_id = $1 AND created_at > NOW() - INTERVAL '3 days'
     ORDER BY created_at DESC
     LIMIT 15`,
    [COMPANY_ID],
  );

  const camps = await client.query(
    `SELECT id, name, status, estimated_sms_cost, real_sms_cost,
            metadata->>'source' AS source,
            metadata->>'idempotency_key' AS idempotency_key,
            created_at
     FROM sms_campaigns
     WHERE company_id = $1 AND created_at > NOW() - INTERVAL '3 days'
     ORDER BY created_at DESC
     LIMIT 10`,
    [COMPANY_ID],
  );

  const pending = await client.query(
    `SELECT id, action_type, status, summary, created_at, expires_at
     FROM agent_pending_actions
     WHERE company_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [COMPANY_ID],
  );

  const walletTx = await client.query(
    `SELECT id, sms_amount, reference_type, reference_id, description, created_at
     FROM wallet_transactions
     WHERE company_id = $1 AND created_at > NOW() - INTERVAL '3 days'
     ORDER BY created_at DESC
     LIMIT 15`,
    [COMPANY_ID],
  );

  const agentLogs = await client.query(
    `SELECT LEFT(error_text, 120) AS err, COUNT(*)::int AS n
     FROM sms_send_idempotency
     WHERE company_id = $1
       AND error_text ILIKE '%idempotency%'
       AND updated_at > NOW() - INTERVAL '14 days'
     GROUP BY 1`,
    [COMPANY_ID],
  );

  const agentCampaigns = await client.query(
    `SELECT id, name, status, estimated_sms_cost, real_sms_cost,
            metadata->>'source' AS source,
            metadata->>'idempotency_key' AS idempotency_key,
            created_at
     FROM sms_campaigns
     WHERE company_id = $1
       AND (name ILIKE 'Agente%' OR metadata::text ILIKE '%panel_agent%')
     ORDER BY created_at DESC
     LIMIT 10`,
    [COMPANY_ID],
  );

  const agentPanelMsgs = await client.query(
    `SELECT id, recipient_number, status, cost_sms, mode, provider_message_id,
            metadata->>'source' AS source, created_at
     FROM panel_sms_messages
     WHERE company_id = $1
       AND metadata::text ILIKE '%panel_agent%'
     ORDER BY created_at DESC
     LIMIT 10`,
    [COMPANY_ID],
  );

  const panelAgentMsgs = await client.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS last_7d
     FROM panel_sms_messages
     WHERE company_id = $1`,
    [COMPANY_ID],
  );

  console.log(
    JSON.stringify(
      {
        company,
        company_id: COMPANY_ID,
        sms_provider_mode: process.env.SMS_PROVIDER_MODE ?? null,
        balance: bal.rows[0] ?? null,
        idempotency_errors_14d: agentLogs.rows,
        idempotency_recent: idem.rows,
        messages_recent: msgs.rows,
        campaigns_recent: camps.rows,
        agent_pending_recent: pending.rows,
        wallet_transactions_recent: walletTx.rows,
        panel_messages_counts: panelAgentMsgs.rows[0] ?? null,
        agent_named_campaigns: agentCampaigns.rows,
        agent_metadata_messages: agentPanelMsgs.rows,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
