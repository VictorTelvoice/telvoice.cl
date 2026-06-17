#!/usr/bin/env node
/**
 * Corrige mensaje VERIFY_TEST mal atribuido + reversa wallet indebida.
 *
 * Uso (solo lectura):
 *   node scripts/fix-misattributed-verify-test-message.mjs --provider=22563988
 *
 * Aplicar corrección:
 *   INTERNAL_QA_COMPANY_ID=6cd1db92-d5c7-45e0-8548-df8907843350 \
 *     node scripts/fix-misattributed-verify-test-message.mjs --provider=22563988 --apply
 */
import "dotenv/config";
import pg from "pg";

const PROVIDER_MSG_ID =
  process.argv.find((a) => a.startsWith("--provider="))?.slice(11) ??
  "22563988";
const APPLY = process.argv.includes("--apply");
const INTERNAL_QA =
  process.env.INTERNAL_QA_COMPANY_ID?.trim() ||
  "6cd1db92-d5c7-45e0-8548-df8907843350";

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

function log(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

await client.connect();
try {
  const { rows } = await client.query(
    `SELECT m.id, m.company_id, m.campaign_id, m.provider_message_id, m.cost_sms,
            m.metadata, c.name AS company_name, c.billing_email
     FROM panel_sms_messages m
     LEFT JOIN companies c ON c.id = m.company_id
     WHERE m.provider_message_id = $1`,
    [PROVIDER_MSG_ID],
  );
  const target = rows[0];
  if (!target) {
    console.error("Mensaje no encontrado:", PROVIDER_MSG_ID);
    process.exit(1);
  }

  log({
    phase: "audit",
    message_id: target.id,
    provider_message_id: target.provider_message_id,
    old_company_id: target.company_id,
    old_company_name: target.company_name,
    billing_email: target.billing_email,
    campaign_id: target.campaign_id,
    internal_qa_target: INTERNAL_QA,
  });

  const { rows: debits } = await client.query(
    `SELECT id, type, sms_amount, balance_before, balance_after, created_at
     FROM wallet_transactions
     WHERE company_id = $1 AND reference_id = $2 AND type = 'sms_debit'`,
    [target.company_id, target.id],
  );
  log({ wallet_debits_on_wrong_company: debits });

  if (!APPLY) {
    console.log("\nDry-run. Re-ejecuta con --apply para corregir.");
    process.exit(0);
  }

  if (target.company_id === INTERNAL_QA) {
    console.log("Ya está en empresa QA interna; nada que hacer.");
    process.exit(0);
  }

  const oldCompanyId = target.company_id;
  await client.query("BEGIN");
  try {
    const fixMeta = {
      internal_test: true,
      misattribution_fix: {
        action: "fix_misattributed_verify_test_message",
        provider_message_id: PROVIDER_MSG_ID,
        old_company_id: oldCompanyId,
        new_company_id: INTERNAL_QA,
        reason: "local_verify_test_attributed_to_real_client",
        actor: "system",
        fixed_at: new Date().toISOString(),
      },
    };

    await client.query(
      `UPDATE panel_sms_messages
       SET company_id = $1::uuid,
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE id = $3::uuid`,
      [INTERNAL_QA, JSON.stringify(fixMeta), target.id],
    );

    if (target.campaign_id) {
      await client.query(
        `UPDATE sms_campaigns
         SET company_id = $1::uuid,
             metadata = COALESCE(metadata, '{}'::jsonb) || '{"internal_test": true}'::jsonb
         WHERE id = $2::uuid`,
        [INTERNAL_QA, target.campaign_id],
      );
    }

    for (const debit of debits) {
      const { rows: wallets } = await client.query(
        `SELECT id, available_sms FROM company_sms_wallets WHERE company_id = $1 LIMIT 1`,
        [oldCompanyId],
      );
      const wallet = wallets[0];
      if (!wallet) {
        throw new Error(`Wallet no encontrada para ${oldCompanyId}`);
      }
      const before = wallet.available_sms;
      const after = before + debit.sms_amount;
      await client.query(
        `UPDATE company_sms_wallets SET available_sms = $1, updated_at = NOW() WHERE id = $2`,
        [after, wallet.id],
      );
      await client.query(
        `INSERT INTO wallet_transactions (
           company_id, wallet_id, type, sms_amount, balance_before, balance_after,
           reference_type, reference_id, description, metadata, created_at
         ) VALUES (
           $1, $2, 'manual_credit', $3, $4, $5,
           'sms_message', $6,
           $7,
           $8::jsonb, NOW()
         )`,
        [
          oldCompanyId,
          wallet.id,
          debit.sms_amount,
          before,
          after,
          target.id,
          "Reversa por VERIFY_TEST interno mal atribuido",
          JSON.stringify({
            action: "fix_misattributed_verify_test_message",
            provider_message_id: PROVIDER_MSG_ID,
            reversed_debit_id: debit.id,
            reason: "local_verify_test_attributed_to_real_client",
          }),
        ],
      );
      log({
        phase: "wallet_reversal",
        company_id: oldCompanyId,
        sms_credited: debit.sms_amount,
        balance_before: before,
        balance_after: after,
        reversed_debit_id: debit.id,
      });
    }

    await client.query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, company_id, metadata, created_at)
       VALUES (
         'fix_misattributed_verify_test_message',
         'panel_sms_messages',
         $1,
         $2,
         $3::jsonb,
         NOW()
       )`,
      [
        target.id,
        INTERNAL_QA,
        JSON.stringify({
          provider_message_id: PROVIDER_MSG_ID,
          old_company_id: oldCompanyId,
          new_company_id: INTERNAL_QA,
          reason: "local_verify_test_attributed_to_real_client",
        }),
      ],
    ).catch(() => {
      /* audit_logs opcional */
    });

    await client.query("COMMIT");
    log({ phase: "apply_ok", message_id: target.id, new_company_id: INTERNAL_QA });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
} finally {
  await client.end();
}
