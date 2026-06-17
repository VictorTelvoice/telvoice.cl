#!/usr/bin/env node
/**
 * Auditoría: mensaje VERIFY_TEST mal atribuido a cliente real.
 * Solo lectura por defecto. Corrección con --apply y INTERNAL_QA_COMPANY_ID.
 */
import "dotenv/config";
import pg from "pg";

const PROVIDER_MSG_ID =
  process.argv.find((a) => a.startsWith("--provider="))?.slice(11) ?? "22563988";
const APPLY = process.argv.includes("--apply");
const INTERNAL_QA = process.env.INTERNAL_QA_COMPANY_ID?.trim() ?? "";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL no definido");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("supabase")
    ? { rejectUnauthorized: false }
    : undefined,
});

function row(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

await client.connect();
try {
  const { rows: msgs } = await client.query(
    `SELECT m.id, m.company_id, m.campaign_id, m.recipient_number, m.sender_id,
            m.message, m.status, m.mode, m.segments, m.cost_sms, m.provider,
            m.provider_message_id, m.created_at, m.sent_at, m.delivered_at,
            m.metadata,
            c.name AS company_name, c.legal_name, c.billing_email, c.status AS company_status,
            c.metadata AS company_metadata
     FROM panel_sms_messages m
     LEFT JOIN companies c ON c.id = m.company_id
     WHERE m.provider_message_id = $1
        OR m.message ILIKE '%Testzeando chile ahora PTG%'
        OR (
          m.recipient_number IN ('+56934449937', '56934449937')
          AND m.metadata->>'source' = 'app_send_sms_verify_test'
          AND m.created_at > NOW() - INTERVAL '30 days'
        )
     ORDER BY m.created_at DESC
     LIMIT 20`,
    [PROVIDER_MSG_ID],
  );

  console.log("=== panel_sms_messages (matches) ===");
  console.log("count:", msgs.length);
  for (const m of msgs) {
    row({
      message_id: m.id,
      company_id: m.company_id,
      company_name: m.company_name,
      billing_email: m.billing_email,
      recipient: m.recipient_number,
      message_preview: m.message?.slice(0, 80),
      status: m.status,
      mode: m.mode,
      provider: m.provider,
      provider_message_id: m.provider_message_id,
      source: m.metadata?.source ?? null,
      internal_test: m.metadata?.internal_test ?? null,
      created_at: m.created_at,
      cost_sms: m.cost_sms,
      campaign_id: m.campaign_id,
    });
  }

  for (const m of msgs) {
    const { rows: wt } = await client.query(
      `SELECT id, type, amount, balance_before, balance_after, reference_type,
              reference_id, description, metadata, created_at
       FROM wallet_transactions
       WHERE company_id = $1
         AND (
           reference_id = $2
           OR metadata->>'panel_message_id' = $2
           OR metadata->>'provider_message_id' = $3
         )
       ORDER BY created_at DESC`,
      [m.company_id, m.id, m.provider_message_id ?? ""],
    );
    console.log(`\n=== wallet_transactions (message ${m.id}) ===`);
    console.log("count:", wt.length);
    for (const t of wt) row(t);

    const { rows: legacy } = await client.query(
      `SELECT id, client_id, uid, provider_message_id, status, created_at
       FROM sms_messages
       WHERE provider_message_id = $1 OR uid = $1
       LIMIT 5`,
      [m.provider_message_id ?? PROVIDER_MSG_ID],
    );
    console.log(`\n=== sms_messages legacy (provider ${m.provider_message_id}) ===`);
    console.log("count:", legacy.length);

    const { rows: apiMsgs } = await client.query(
      `SELECT id, company_id, status, created_at
       FROM sms_api_messages
       WHERE provider_message_id = $1
       LIMIT 5`,
      [m.provider_message_id ?? PROVIDER_MSG_ID],
    ).catch(() => ({ rows: [] }));
    console.log(`\n=== sms_api_messages ===`);
    console.log("count:", apiMsgs.length);

    const { rows: dlr } = await client.query(
      `SELECT id, message_id, status, created_at
       FROM panel_sms_delivery_events
       WHERE message_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [m.id],
    );
    console.log(`\n=== panel_sms_delivery_events ===`);
    console.log("count:", dlr.length);

    if (m.campaign_id) {
      const { rows: camp } = await client.query(
        `SELECT id, name, status, metadata, created_by FROM sms_campaigns WHERE id = $1`,
        [m.campaign_id],
      );
      if (camp[0]) {
        console.log("\n=== sms_campaigns ===");
        row(camp[0]);
      }
    }
  }

  const allowlist = (process.env.SMS_LIVE_TEST_ALLOWED_COMPANY_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  console.log("\n=== env allowlist (count only) ===");
  console.log("SMS_LIVE_TEST_ALLOWED_COMPANY_IDS:", allowlist.length);
  console.log("INTERNAL_QA_COMPANY_ID set:", Boolean(INTERNAL_QA));

  const target =
    msgs.find((m) => m.provider_message_id === PROVIDER_MSG_ID) ?? msgs[0];
  if (APPLY && target && INTERNAL_QA) {
    if (target.company_id === INTERNAL_QA) {
      console.log("\n=== apply skipped: already on INTERNAL_QA_COMPANY_ID ===");
    } else {
      const oldCompanyId = target.company_id;
      await client.query("BEGIN");
      try {
        await client.query(
          `UPDATE panel_sms_messages
           SET company_id = $1,
               metadata = COALESCE(metadata, '{}'::jsonb)
                 || jsonb_build_object(
                      'internal_test', true,
                      'misattribution_fix', jsonb_build_object(
                        'action', 'fix_misattributed_verify_test_message',
                        'provider_message_id', $2,
                        'old_company_id', $3::text,
                        'new_company_id', $1::text,
                        'reason', 'local_verify_test_attributed_to_real_client',
                        'fixed_at', NOW()::text
                      )
                    )
           WHERE id = $4`,
          [INTERNAL_QA, PROVIDER_MSG_ID, oldCompanyId, target.id],
        );
        if (target.campaign_id) {
          await client.query(
            `UPDATE sms_campaigns
             SET company_id = $1,
                 metadata = COALESCE(metadata, '{}'::jsonb)
                   || jsonb_build_object('internal_test', true)
             WHERE id = $2 AND company_id = $3`,
            [INTERNAL_QA, target.campaign_id, oldCompanyId],
          );
        }
        const { rows: debits } = await client.query(
          `SELECT id, amount FROM wallet_transactions
           WHERE company_id = $1 AND reference_id = $2 AND type = 'debit'`,
          [oldCompanyId, target.id],
        );
        for (const d of debits) {
          console.log("\n=== WALLET REVERSAL REQUIRED ===");
          console.log("debit_transaction_id:", d.id, "amount:", d.amount);
          console.log(
            "Run compensating credit via wallet service — not auto-applied.",
          );
        }
        await client.query("COMMIT");
        console.log("\n=== apply OK ===");
        row({
          message_id: target.id,
          old_company_id: oldCompanyId,
          new_company_id: INTERNAL_QA,
        });
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } else if (APPLY && !INTERNAL_QA) {
    console.error("\n--apply requiere INTERNAL_QA_COMPANY_ID en env");
    process.exit(1);
  }
} finally {
  await client.end();
}
