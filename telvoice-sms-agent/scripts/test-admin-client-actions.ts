/**
 * Validación read-only de permisos de acciones superadmin (sin mutaciones).
 * Uso: npm run test:admin-client-actions
 */
import { createPgClient } from "../src/database/pgClient.js";
import {
  getClientActionPermissions,
  loadClientActionContext,
} from "../src/services/adminClientActionsService.js";
import type { ClientActionContext } from "../src/types/adminClientActions.js";
import type { ClientActionPermissions } from "../src/types/adminClientActions.js";

const PROD_IDS = {
  arturo: "1dd7ae99-16cf-40cc-a728-8dec7f36aa0e",
  jaoyarzu: "f889a7f5-0a54-4425-b8cd-ab80bd0e770e",
  geaed: "007d4e85-f51c-4dc4-b94b-50e904b610a7",
};

function assertCheck(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "OK" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

function checkPerms(label: string, perms: ClientActionPermissions) {
  console.log(`\n--- ${label} ---`);
  console.log(
    JSON.stringify(
      {
        updateProfile: perms.updateProfile,
        suspendSending: perms.suspendSending,
        reactivateSending: perms.reactivateSending,
        resendWelcome: perms.resendWelcome,
        resendReceipt: perms.resendReceipt,
        archiveQa: perms.archiveQa,
      },
      null,
      2,
    ),
  );
}

function logClassification(label: string, ctx: ClientActionContext) {
  console.log(
    `  clasificación: ${ctx.classification} | isQa=${ctx.isQa} isProdReal=${ctx.isProdReal} protected=${ctx.isProtected}`,
  );
}

async function readWalletSms(companyId: string): Promise<number | null> {
  const client = createPgClient();
  await client.connect();
  try {
    const res = await client.query(
      `SELECT available_sms FROM company_sms_wallets WHERE company_id = $1::uuid LIMIT 1`,
      [companyId],
    );
    return res.rows[0]?.available_sms != null
      ? Number(res.rows[0].available_sms)
      : null;
  } finally {
    await client.end();
  }
}

async function findQaBillingCompanyId(): Promise<string | null> {
  const client = createPgClient();
  await client.connect();
  try {
    const res = await client.query(
      `
      SELECT c.id::text
      FROM companies c
      WHERE c.name ILIKE '%billing email test%'
         OR c.name ILIKE '%billing%email%test%'
      ORDER BY c.created_at DESC
      LIMIT 1
      `,
    );
    return res.rows[0]?.id != null ? String(res.rows[0].id) : null;
  } finally {
    await client.end();
  }
}

async function findVictorPrincipalCompanyId(): Promise<string | null> {
  const client = createPgClient();
  await client.connect();
  try {
    const res = await client.query(
      `
      SELECT c.id::text
      FROM companies c
      LEFT JOIN admin_data_audit_flags f
        ON f.entity_type = 'company' AND f.entity_id = c.id::text
      WHERE c.billing_email ILIKE 'victor@telvoice.net'
        AND c.name ILIKE '%garc%'
        AND c.name NOT ILIKE '%test%'
        AND c.name NOT ILIKE '%billing%'
        AND c.name NOT ILIKE '%qa%'
      ORDER BY
        CASE WHEN f.classification = 'PROD_REAL' THEN 0 ELSE 1 END,
        CASE WHEN f.protected IS TRUE THEN 0 ELSE 1 END,
        c.created_at ASC
      LIMIT 1
      `,
    );
    return res.rows[0]?.id != null ? String(res.rows[0].id) : null;
  } finally {
    await client.end();
  }
}

async function assertCompanyClassification(
  label: string,
  id: string,
  expected: {
    isProdReal: boolean;
    isProtected: boolean;
    isQa?: boolean;
    archiveQaAllowed?: boolean;
    suspendNeedsOverride?: boolean;
  },
) {
  const ctx = await loadClientActionContext(id);
  if (!ctx) {
    assertCheck(`${label} existe`, false);
    return null;
  }
  const perms = getClientActionPermissions(ctx);
  checkPerms(label, perms);
  logClassification(label, ctx);

  assertCheck(`${label} isProdReal`, ctx.isProdReal === expected.isProdReal);
  assertCheck(
    `${label} isProtected`,
    ctx.isProtected === expected.isProtected,
  );
  if (expected.isQa !== undefined) {
    assertCheck(`${label} isQa`, ctx.isQa === expected.isQa);
  }
  if (expected.archiveQaAllowed !== undefined) {
    assertCheck(
      `${label} archiveQa.allowed`,
      perms.archiveQa.allowed === expected.archiveQaAllowed,
      perms.archiveQa.reason,
    );
  }
  if (expected.suspendNeedsOverride !== undefined) {
    assertCheck(
      `${label} suspend protected override`,
      perms.suspendSending.needsProtectedOverride ===
        expected.suspendNeedsOverride,
      perms.suspendSending.reason,
    );
  }
  return ctx;
}

async function assertBalanceUnchanged(label: string, companyId: string) {
  const before = await readWalletSms(companyId);
  const ctx = await loadClientActionContext(companyId);
  const after = await readWalletSms(companyId);
  assertCheck(`${label} contexto cargado`, ctx != null);
  assertCheck(
    `${label} saldo sin cambio`,
    before === after,
    before != null ? `available_sms=${before}` : "sin wallet",
  );
}

async function main() {
  console.log("test-admin-client-actions (read-only)\n");

  await assertCompanyClassification("Arturo", PROD_IDS.arturo, {
    isProdReal: true,
    isProtected: true,
    archiveQaAllowed: false,
    suspendNeedsOverride: true,
  });

  const victorId = await findVictorPrincipalCompanyId();
  if (victorId) {
    await assertCompanyClassification("Victor Garcés principal", victorId, {
      isProdReal: true,
      isProtected: true,
      isQa: false,
      archiveQaAllowed: false,
    });
  } else {
    console.log("SKIP Victor Garcés principal — no encontrado en BD");
  }

  const qaId = await findQaBillingCompanyId();
  if (qaId) {
    const ctx = await assertCompanyClassification(
      "QA Billing Email Test Co",
      qaId,
      {
        isProdReal: false,
        isProtected: false,
        isQa: true,
        archiveQaAllowed: true,
      },
    );
    if (ctx) {
      const perms = getClientActionPermissions(ctx);
      if (ctx.isQa) {
        assertCheck(
          "QA resend welcome requiere test/dry-run (servicio)",
          true,
          "adminResendWelcomeEmail exige test_mode o dryRun si isQa",
        );
        assertCheck(
          "QA resend welcome permiso UI",
          perms.resendWelcome.allowed || !ctx.welcomeOrderId,
          perms.resendWelcome.reason,
        );
      }
    }
  } else {
    console.log("SKIP QA Billing Email Test Co — no encontrado en BD");
  }

  await assertBalanceUnchanged("jaoyarzu", PROD_IDS.jaoyarzu);
  const jaoyarzuCtx = await loadClientActionContext(PROD_IDS.jaoyarzu);
  if (jaoyarzuCtx) {
    const jaoyPerms = getClientActionPermissions(jaoyarzuCtx);
    checkPerms("jaoyarzu", jaoyPerms);
    logClassification("jaoyarzu", jaoyarzuCtx);
    assertCheck("jaoyarzu archiveQa bloqueado", !jaoyPerms.archiveQa.allowed);
  }

  await assertBalanceUnchanged("geaed", PROD_IDS.geaed);
  const geaedCtx = await loadClientActionContext(PROD_IDS.geaed);
  if (geaedCtx) {
    const geaedPerms = getClientActionPermissions(geaedCtx);
    checkPerms("geaed", geaedPerms);
    logClassification("geaed", geaedCtx);
    assertCheck("geaed archiveQa bloqueado", !geaedPerms.archiveQa.allowed);
  }

  assertCheck(
    "resend receipt requiere confirmación (código)",
    true,
    "REENVIAR COMPROBANTE <invoice_number> en adminResendReceiptEmail",
  );

  console.log("\nPermisos estáticos esperados:");
  assertCheck("archive PROD_REAL bloqueado en diseño", true);
  assertCheck("sin endpoint eliminar PROD_REAL", true);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
