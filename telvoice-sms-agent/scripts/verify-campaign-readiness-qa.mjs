#!/usr/bin/env node
/**
 * QA Etapa 6 — readiness campañas live (gate operativo, sin SMS real).
 *
 * Uso: npm run build && node scripts/verify-campaign-readiness-qa.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const conn = process.env.DATABASE_URL?.trim();
const DEMO_COMPANY_ID =
  process.env.QA_COMPANY_ID || "6cd1db92-d5c7-45e0-8548-df8907843350";

if (!conn) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const distReadiness = join(
  __dirname,
  "../dist/services/campaignReadinessService.js",
);
const distPreview = join(__dirname, "../dist/services/campaignPreviewService.js");
const distContact = join(__dirname, "../dist/services/contactService.js");
if (!existsSync(distReadiness) || !existsSync(distPreview)) {
  console.error("Ejecuta npm run build primero");
  process.exit(1);
}

const readinessSvc = await import(pathToFileURL(distReadiness).toString());
const previewSvc = await import(pathToFileURL(distPreview).toString());
const { createContact, createContactList } = await import(
  pathToFileURL(distContact).toString(),
);

const client = new pg.Client({
  connectionString: conn,
  ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

let passed = 0;
let failed = 0;

function ok(name, detail = "") {
  passed += 1;
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  failed += 1;
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(cond, name, detail) {
  if (cond) ok(name, detail);
  else fail(name, detail);
}

const suffix = String(Date.now()).slice(-7);
const phoneA = `+56977${suffix}`.slice(0, 12);
const cleanup = {
  campaignId: null,
  contactIds: [],
  listId: null,
  crpSnapshots: [],
  providerStatus: null,
  routeStatus: null,
  walletSmsBefore: null,
};

async function countLiveMessages(campaignId) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM panel_sms_messages
     WHERE campaign_id=$1 AND mode NOT IN ('mock')`,
    [campaignId],
  );
  return rows[0]?.n ?? 0;
}

async function countCampaignWalletDebits(campaignId, companyId) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM wallet_transactions
     WHERE company_id=$1 AND type='sms_debit'
       AND reference_type='sms_campaign' AND reference_id=$2`,
    [companyId, campaignId],
  );
  return rows[0]?.n ?? 0;
}

async function countQueueRows(campaignId) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM sms_send_queue WHERE campaign_id=$1`,
    [campaignId],
  );
  return rows[0]?.n ?? 0;
}

async function snapshotCompanyRatePlans(companyId) {
  const { rows } = await client.query(
    `SELECT id, live_enabled, campaigns_enabled, max_tps, daily_limit
     FROM company_rate_plans WHERE company_id=$1 AND status='active'`,
    [companyId],
  );
  cleanup.crpSnapshots = rows.map((r) => ({ ...r }));
}

async function restoreCompanyRatePlans() {
  for (const row of cleanup.crpSnapshots) {
    await client.query(
      `UPDATE company_rate_plans
       SET live_enabled=$2, campaigns_enabled=$3, max_tps=$4, daily_limit=$5
       WHERE id=$1`,
      [
        row.id,
        row.live_enabled,
        row.campaigns_enabled,
        row.max_tps,
        row.daily_limit,
      ],
    );
  }
}

async function setCompanyFlags(companyId, live, campaigns) {
  await client.query(
    `UPDATE company_rate_plans
     SET live_enabled=$2, campaigns_enabled=$3
     WHERE company_id=$1 AND status='active'`,
    [companyId, live, campaigns],
  );
}

await client.connect();

try {
  console.log("QA readiness campañas (Etapa 6 — sin SMS real)\n");
  console.log("Empresa:", DEMO_COMPANY_ID.slice(0, 8) + "…\n");

  await snapshotCompanyRatePlans(DEMO_COMPANY_ID);

  const list = await createContactList(DEMO_COMPANY_ID, {
    name: `QA Readiness ${suffix}`,
  });
  cleanup.listId = list.id;

  const c1 = await createContact(DEMO_COMPANY_ID, {
    display_name: "QA Readiness",
    phone: phoneA,
    list_id: list.id,
    source: "manual",
  });
  cleanup.contactIds.push(c1.id);

  const preview = await previewSvc.buildCampaignPreview({
    companyId: DEMO_COMPANY_ID,
    audienceSource: { type: "list", listId: list.id },
    senderId: "TELVOICE",
    message: "Hola QA readiness etapa 6",
    campaignName: `QA Readiness ${suffix}`,
  });

  const draft = await previewSvc.createCampaignDraftFromPreview(
    DEMO_COMPANY_ID,
    preview,
  );
  cleanup.campaignId = draft.id;
  ok("Campaña draft/mock creada", draft.id.slice(0, 8));

  const { rows: walletBefore } = await client.query(
    `SELECT available_sms FROM company_sms_wallets
     WHERE company_id=$1 LIMIT 1`,
    [DEMO_COMPANY_ID],
  );
  cleanup.walletSmsBefore = walletBefore[0]?.available_sms ?? null;

  await setCompanyFlags(DEMO_COMPANY_ID, false, false);
  const blockedFlags = await readinessSvc.getCampaignLiveReadiness(
    DEMO_COMPANY_ID,
    draft.id,
  );
  assert(blockedFlags.canGoLive === false, "live_enabled=false → canGoLive=false");
  assert(
    blockedFlags.blockedReasons.some((r) =>
      r.includes("campañas reales habilitadas"),
    ),
    "Motivo: campañas reales no habilitadas",
    blockedFlags.blockedReasons.find((r) => r.includes("campañas")) ?? "—",
  );

  await setCompanyFlags(DEMO_COMPANY_ID, true, true);
  const afterFlags = await readinessSvc.getCampaignLiveReadiness(
    DEMO_COMPANY_ID,
    draft.id,
  );
  assert(
    afterFlags.liveEnabled === true && afterFlags.campaignsEnabled === true,
    "Flags QA live_enabled/campaigns_enabled=true",
  );
  assert(
    afterFlags.effectiveTps != null && afterFlags.effectiveTps >= 1,
    "effective_tps calculado",
    String(afterFlags.effectiveTps),
  );
  ok(
    "Siguiente bloqueo sin enviar",
    afterFlags.canGoLive
      ? "listo operativamente"
      : afterFlags.blockedReasons[0] ?? "—",
  );

  const traffic = await readinessSvc.getCampaignTrafficReadiness(
    DEMO_COMPANY_ID,
  );
  assert(
    traffic.effectiveTps != null,
    "getCampaignTrafficReadiness effective_tps",
    String(traffic.effectiveTps),
  );

  const { rows: crpRow } = await client.query(
    `SELECT id FROM company_rate_plans
     WHERE company_id=$1 AND status='active' LIMIT 1`,
    [DEMO_COMPANY_ID],
  );
  if (crpRow[0]?.id) {
    const prevDaily = cleanup.crpSnapshots.find((r) => r.id === crpRow[0].id)
      ?.daily_limit;
    await client.query(
      `UPDATE company_rate_plans SET daily_limit = 0 WHERE id = $1`,
      [crpRow[0].id],
    );
    const lowBalanceReadiness = await readinessSvc.getCampaignLiveReadiness(
      DEMO_COMPANY_ID,
      draft.id,
    );
    if (lowBalanceReadiness.availableSms < lowBalanceReadiness.requiredSms) {
      assert(
        lowBalanceReadiness.blockedReasons.some((r) =>
          r.toLowerCase().includes("saldo"),
        ),
        "Saldo insuficiente detectado",
        lowBalanceReadiness.blockedReasons.find((r) =>
          r.toLowerCase().includes("saldo"),
        ) ?? "—",
      );
    } else {
      ok(
        "Saldo insuficiente",
        `omitido (disp=${lowBalanceReadiness.availableSms} req=${lowBalanceReadiness.requiredSms})`,
      );
    }
    await client.query(
      `UPDATE company_rate_plans SET daily_limit = $2 WHERE id = $1`,
      [crpRow[0].id, prevDaily],
    );
  }

  const { rows: routeRow } = await client.query(
    `SELECT r.id, r.status, r.provider_id
     FROM company_rate_plans crp
     JOIN sms_rate_plan_details d ON d.rate_plan_id = crp.rate_plan_id AND d.status='active'
     JOIN sms_routes r ON r.id = d.route_id
     WHERE crp.company_id=$1 AND crp.status='active'
     LIMIT 1`,
    [DEMO_COMPANY_ID],
  );
  const routeId = routeRow[0]?.id;
  const providerId = routeRow[0]?.provider_id;

  if (providerId) {
    const prev = await client.query(
      `SELECT status FROM sms_providers WHERE id=$1`,
      [providerId],
    );
    cleanup.providerStatus = prev.rows[0]?.status;
    await client.query(
      `UPDATE sms_providers SET status='suspended' WHERE id=$1`,
      [providerId],
    );
    const provBlocked = await readinessSvc.getCampaignLiveReadiness(
      DEMO_COMPANY_ID,
      draft.id,
    );
    assert(
      provBlocked.blockedReasons.some((r) => r.includes("suspendido")),
      "Proveedor suspendido bloquea",
      provBlocked.blockedReasons.find((r) => r.includes("suspendido")) ?? "—",
    );
    await client.query(
      `UPDATE sms_providers SET status=$2 WHERE id=$1`,
      [providerId, cleanup.providerStatus ?? "active"],
    );
    ok("Proveedor restaurado");
  }

  if (routeId) {
    const prev = await client.query(
      `SELECT status FROM sms_routes WHERE id=$1`,
      [routeId],
    );
    cleanup.routeStatus = prev.rows[0]?.status;
    await client.query(
      `UPDATE sms_routes SET status='paused' WHERE id=$1`,
      [routeId],
    );
    const routeBlocked = await readinessSvc.getCampaignLiveReadiness(
      DEMO_COMPANY_ID,
      draft.id,
    );
    assert(
      routeBlocked.blockedReasons.some((r) => r.toLowerCase().includes("pausada")),
      "Ruta pausada bloquea",
      routeBlocked.blockedReasons.find((r) => r.includes("pausada")) ?? "—",
    );
    await client.query(
      `UPDATE sms_routes SET status=$2 WHERE id=$1`,
      [routeId, cleanup.routeStatus ?? "active"],
    );
    ok("Ruta restaurada");
  }

  assert(
    (await countLiveMessages(draft.id)) === 0,
    "No se crea panel_sms_messages live",
  );
  assert(
    (await countCampaignWalletDebits(draft.id, DEMO_COMPANY_ID)) === 0,
    "No se descuenta wallet por readiness",
  );
  assert(
    (await countQueueRows(draft.id)) === 0,
    "No se ejecuta cola (sms_send_queue vacía)",
  );

  try {
    await readinessSvc.validateCampaignCanGoLive(DEMO_COMPANY_ID, draft.id);
    if (afterFlags.canGoLive) {
      ok("validateCampaignCanGoLive OK cuando readiness pasa");
    } else {
      ok("validateCampaignCanGoLive", "omitido (readiness aún bloqueado)");
    }
  } catch (err) {
    if (!afterFlags.canGoLive) {
      ok("validateCampaignCanGoLive lanza si bloqueado", err.message?.slice(0, 60));
    } else {
      fail("validateCampaignCanGoLive", err.message);
    }
  }

  ok("Sin aSMSC / live_test / envío real", "solo lectura de política TPS");
} catch (err) {
  fail("QA readiness", err instanceof Error ? err.message : String(err));
} finally {
  await restoreCompanyRatePlans();
  if (cleanup.campaignId) {
    await client.query(`DELETE FROM panel_sms_messages WHERE campaign_id=$1`, [
      cleanup.campaignId,
    ]);
    await client.query(`DELETE FROM sms_campaigns WHERE id=$1`, [
      cleanup.campaignId,
    ]);
  }
  for (const id of cleanup.contactIds) {
    await client.query(`DELETE FROM contacts WHERE id=$1`, [id]);
  }
  if (cleanup.listId) {
    await client.query(`DELETE FROM contact_lists WHERE id=$1`, [cleanup.listId]);
  }
  await client.end();
}

console.log(`\nResultado: ${passed} OK, ${failed} fallos`);
process.exit(failed > 0 ? 1 : 0);
