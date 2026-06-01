#!/usr/bin/env node
/**
 * Auditoría read-only post-prueba manual del agente por empresa.
 * No modifica wallet, no ejecuta pagos ni envíos.
 *
 * Uso:
 *   DATABASE_URL=... node scripts/audit-licantravel-post-manual-test.mjs --company-id <UUID>
 *   TEST_COMPANY_ID=<UUID> node scripts/audit-licantravel-post-manual-test.mjs
 *   node scripts/audit-licantravel-post-manual-test.mjs --company-name "Licantravel" --window-hours 6
 */
import "dotenv/config";
import pg from "pg";
import {
  parseAuditCompanyArgs,
  resolveAuditCompany,
} from "./lib/audit-company-args.mjs";

const args = parseAuditCompanyArgs(process.argv);
const WINDOW_HOURS = Math.max(1, Math.min(168, args.windowHours));

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

  const walletNow = await client.query(
    `SELECT available_sms, reserved_sms, updated_at FROM company_sms_wallets WHERE company_id = $1`,
    [COMPANY_ID],
  );

  const walletTx = await client.query(
    `SELECT id, sms_amount, balance_before, balance_after, reference_type, reference_id,
            description, created_at
     FROM wallet_transactions
     WHERE company_id = $1
       AND created_at > NOW() - make_interval(hours => $2::int)
     ORDER BY created_at ASC`,
    [COMPANY_ID, WINDOW_HOURS],
  );

  const idem = await client.query(
    `SELECT id, status, campaign_id, message_id, send_mode,
            LEFT(COALESCE(error_text, ''), 200) AS error_text,
            created_at, updated_at
     FROM sms_send_idempotency
     WHERE company_id = $1
       AND updated_at > NOW() - make_interval(hours => $2::int)
     ORDER BY updated_at ASC`,
    [COMPANY_ID, WINDOW_HOURS],
  );

  const pending = await client.query(
    `SELECT id, action_type, status, summary, payload, created_at, expires_at
     FROM agent_pending_actions
     WHERE company_id = $1
       AND created_at > NOW() - INTERVAL '48 hours'
     ORDER BY created_at DESC
     LIMIT 15`,
    [COMPANY_ID],
  );

  const msgs = await client.query(
    `SELECT m.id, m.recipient_number, m.status, m.segments, m.cost_sms, m.mode,
            m.provider, m.provider_message_id, m.campaign_id,
            m.metadata, m.created_at, m.sent_at, m.delivered_at
     FROM panel_sms_messages m
     WHERE m.company_id = $1
       AND m.created_at > NOW() - make_interval(hours => $2::int)
     ORDER BY m.created_at ASC`,
    [COMPANY_ID, WINDOW_HOURS],
  );

  const dlr = await client.query(
    `SELECT e.message_id, e.status, e.provider_message_id, e.created_at
     FROM panel_sms_delivery_events e
     WHERE e.company_id = $1
       AND e.created_at > NOW() - make_interval(hours => $2::int)
     ORDER BY e.created_at ASC`,
    [COMPANY_ID, WINDOW_HOURS],
  );

  const camps = await client.query(
    `SELECT id, name, status, estimated_sms_cost, real_sms_cost, metadata, created_at
     FROM sms_campaigns
     WHERE company_id = $1
       AND created_at > NOW() - make_interval(hours => $2::int)
     ORDER BY created_at ASC`,
    [COMPANY_ID, WINDOW_HOURS],
  );

  const agentSessions = await client.query(
    `SELECT s.id AS session_id, s.updated_at,
            (SELECT COUNT(*)::int FROM panel_agent_messages pm
             WHERE pm.session_id = s.id
               AND pm.created_at > NOW() - make_interval(hours => $2::int)) AS msg_count
     FROM panel_agent_sessions s
     WHERE s.company_id = $1
       AND s.updated_at > NOW() - make_interval(hours => $2::int)
     ORDER BY s.updated_at DESC
     LIMIT 5`,
    [COMPANY_ID, WINDOW_HOURS],
  );

  const agentChat = await client.query(
    `SELECT pm.id, pm.role, LEFT(pm.content, 300) AS content_preview,
            pm.metadata->>'intent' AS intent, pm.created_at
     FROM panel_agent_messages pm
     JOIN panel_agent_sessions s ON s.id = pm.session_id
     WHERE s.company_id = $1
       AND pm.created_at > NOW() - make_interval(hours => $2::int)
     ORDER BY pm.created_at ASC`,
    [COMPANY_ID, WINDOW_HOURS],
  );

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const idemAnalysis = idem.rows.map((r) => ({
    ...r,
    id_is_valid_uuid: uuidRe.test(r.id),
    id_has_agent_prefix: /^agent-(pending|csv)-/i.test(r.id),
  }));

  const debitSum = walletTx.rows
    .filter((t) => Number(t.sms_amount) > 0 && t.reference_type === "sms_message")
    .reduce((s, t) => s + Number(t.sms_amount), 0);

  const balanceBefore =
    walletTx.rows.length > 0
      ? walletTx.rows[0].balance_before
      : walletNow.rows[0]?.available_sms;

  console.log(
    JSON.stringify(
      {
        audited_at: new Date().toISOString(),
        window_hours: WINDOW_HOURS,
        company,
        sms_provider_mode: process.env.SMS_PROVIDER_MODE ?? null,
        balance_now: walletNow.rows[0] ?? null,
        balance_inferred_before_first_tx: balanceBefore,
        wallet_debits_in_window: debitSum,
        wallet_transactions: walletTx.rows,
        sms_send_idempotency: idemAnalysis,
        agent_pending_actions: pending.rows.map((p) => ({
          id: p.id,
          action_type: p.action_type,
          status: p.status,
          summary: p.summary,
          created_at: p.created_at,
          expires_at: p.expires_at,
          payload_keys: Object.keys(p.payload ?? {}),
        })),
        panel_sms_messages: msgs.rows,
        panel_sms_delivery_events: dlr.rows,
        sms_campaigns: camps.rows,
        panel_agent_sessions: agentSessions.rows,
        panel_agent_messages: agentChat.rows,
        checks: {
          all_idempotency_ids_valid_uuid:
            idem.rows.length === 0 ||
            idem.rows.every((r) => uuidRe.test(r.id)),
          no_idempotency_error_text: idem.rows.every(
            (r) => !/idempotency|uuid/i.test(r.error_text ?? ""),
          ),
          messages_in_window: msgs.rows.length,
          unique_provider_ids: [
            ...new Set(
              msgs.rows.map((m) => m.provider_message_id).filter(Boolean),
            ),
          ],
          second_confirm_hint: agentChat.rows
            .filter(
              (m) =>
                m.role === "assistant" &&
                /no hay acciones pendientes/i.test(m.content_preview ?? ""),
            )
            .map((m) => ({ at: m.created_at, preview: m.content_preview })),
          technical_error_in_chat: agentChat.rows.filter(
            (m) =>
              m.role === "assistant" &&
              /idempotency_key|uuid válido|stack|sql state/i.test(
                m.content_preview ?? "",
              ),
          ),
        },
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
