/**
 * Prueba controlada de acciones admin — seguro por defecto (dry-run, sin mutaciones).
 *
 * Modo default (sin flags):
 *   - dry-run QA + bloqueos PROD
 *   - sin mutaciones, sin correos, sin archive/suspend/reactivate real
 *
 * Modo apply (opcional, QA únicamente):
 *   --apply --company-id=<UUID> --confirm="EJECUTAR ACCION QA CONTROLADA <UUID>"
 *   Ejecuta update-profile real + revert en la cuenta QA indicada.
 *
 * Uso: npm run test:admin-client-actions:qa
 */
import { createPgClient } from "../src/database/pgClient.js";
import {
  adminArchiveQaClient,
  adminReactivateClientSending,
  adminResendReceiptEmail,
  adminResendWelcomeEmail,
  adminSuspendClientSending,
  adminUpdateClientProfile,
  getClientActionPermissions,
  loadClientActionContext,
} from "../src/services/adminClientActionsService.js";
import type {
  ClientActionActor,
  ClientActionContext,
  ClientActionRequestMeta,
} from "../src/types/adminClientActions.js";

const BLOCKED_COMPANY_IDS = new Set([
  "1dd7ae99-16cf-40cc-a728-8dec7f36aa0e", // Arturo
  "f889a7f5-0a54-4425-b8cd-ab80bd0e770e", // jaoyarzu
  "007d4e85-f51c-4dc4-b94b-50e904b610a7", // geaed
  "eefb1efe-fdfa-4699-b0e2-4e31186a5a36", // Victor Garcés principal
]);

const QA_CLASSIFICATIONS = new Set(["QA_TEST", "DEMO_SEED"]);

const ACTOR: ClientActionActor = {
  userId: "00000000-0000-4000-8000-000000000059",
  email: "qa-controlled-test@telvoice.cl",
  role: "superadmin",
};

const META: ClientActionRequestMeta = {
  ipAddress: "127.0.0.1",
  userAgent: "qa-admin-actions-controlled-test",
};

type Snapshot = {
  company: Record<string, unknown> | null;
  flag: Record<string, unknown> | null;
  walletSms: number | null;
  orderCount: number;
  invoiceCount: number;
  actionLogCount: number;
};

type CliOptions = {
  apply: boolean;
  companyId: string | null;
  confirm: string | null;
};

function log(msg: string) {
  console.log(msg);
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function parseCli(argv: string[]): CliOptions {
  let apply = false;
  let companyId: string | null = null;
  let confirm: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--apply") apply = true;
    else if (arg.startsWith("--company-id=")) companyId = arg.slice("--company-id=".length).trim();
    else if (arg === "--company-id") companyId = (argv[++i] ?? "").trim();
    else if (arg.startsWith("--confirm=")) confirm = arg.slice("--confirm=".length);
    else if (arg === "--confirm") confirm = argv[++i] ?? null;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Uso: npx tsx scripts/qa-admin-actions-controlled-test.ts [opciones]

Default: modo seguro (dry-run + bloqueos PROD, sin mutaciones).

Opciones apply (solo QA):
  --apply
  --company-id=<UUID>
  --confirm="EJECUTAR ACCION QA CONTROLADA <UUID>"
`);
      process.exit(0);
    }
  }
  return { apply, companyId, confirm };
}

function assertQaCompanyAllowed(companyId: string, ctx: ClientActionContext): void {
  if (BLOCKED_COMPANY_IDS.has(companyId)) {
    fail(`company_id bloqueado (cliente PROD): ${companyId}`);
  }
  if (!ctx.isQa) fail(`isQa debe ser true (got false)`);
  if (ctx.isProdReal) fail(`isProdReal debe ser false`);
  if (ctx.isProtected) fail(`isProtected debe ser false`);
  if (!QA_CLASSIFICATIONS.has(ctx.classification)) {
    fail(
      `classification debe ser QA_TEST o DEMO_SEED (got ${ctx.classification})`,
    );
  }
}

async function snapshotCompany(
  client: Awaited<ReturnType<typeof createPgClient>>,
  companyId: string,
): Promise<Snapshot> {
  const companyRes = await client.query(
    `SELECT id::text, name, billing_email, contact_name, status, updated_at::text
     FROM companies WHERE id = $1::uuid`,
    [companyId],
  );
  const flagRes = await client.query(
    `SELECT classification, protected, archived_at::text
     FROM admin_data_audit_flags
     WHERE entity_type = 'company' AND entity_id = $1`,
    [companyId],
  );
  const walletRes = await client.query(
    `SELECT available_sms FROM company_sms_wallets WHERE company_id = $1::uuid LIMIT 1`,
    [companyId],
  );
  const ordersRes = await client.query(
    `SELECT COUNT(*)::int AS n FROM sms_orders WHERE company_id = $1::uuid`,
    [companyId],
  );
  const invRes = await client.query(
    `SELECT COUNT(*)::int AS n FROM billing_invoices WHERE company_id = $1::uuid`,
    [companyId],
  );
  const logsRes = await client.query(
    `SELECT COUNT(*)::int AS n FROM admin_action_logs WHERE company_id = $1::uuid`,
    [companyId],
  );
  return {
    company: companyRes.rows[0] ?? null,
    flag: flagRes.rows[0] ?? null,
    walletSms:
      walletRes.rows[0]?.available_sms != null
        ? Number(walletRes.rows[0].available_sms)
        : null,
    orderCount: Number(ordersRes.rows[0]?.n ?? 0),
    invoiceCount: Number(invRes.rows[0]?.n ?? 0),
    actionLogCount: Number(logsRes.rows[0]?.n ?? 0),
  };
}

function snapshotsEqual(a: Snapshot, b: Snapshot, label: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error(`Snapshot changed after ${label}`);
    process.exitCode = 1;
    return false;
  }
  log(`OK snapshot unchanged after ${label}`);
  return true;
}

async function findDefaultQaCompanyId(): Promise<string> {
  const client = createPgClient();
  await client.connect();
  try {
    const res = await client.query(
      `
      SELECT c.id::text
      FROM companies c
      WHERE c.name ILIKE '%billing email test%'
      ORDER BY c.created_at DESC
      LIMIT 1
      `,
    );
    return String(res.rows[0]?.id ?? "");
  } finally {
    await client.end();
  }
}

async function findQaInvoiceId(companyId: string): Promise<string | null> {
  const client = createPgClient();
  await client.connect();
  try {
    const res = await client.query(
      `SELECT id::text FROM billing_invoices
       WHERE company_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
      [companyId],
    );
    return res.rows[0]?.id != null ? String(res.rows[0].id) : null;
  } finally {
    await client.end();
  }
}

async function expectThrows(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    log(`FAIL ${label} — expected throw`);
    process.exitCode = 1;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`OK ${label} bloqueado — ${msg.slice(0, 120)}`);
  }
}

function printPlan(mode: "safe" | "apply", ctx: ClientActionContext) {
  log(`\nModo: ${mode === "safe" ? "SEGURO (dry-run + read-only)" : "APPLY (mutación QA mínima)"}`);
  log(`company_id: ${ctx.company.id}`);
  log(`nombre: ${ctx.company.name}`);
  log(`email: ${ctx.company.billing_email}`);
  log(`classification: ${ctx.classification}`);
  log(`protected: ${ctx.isProtected}`);
  log(`status: ${ctx.company.status}`);
  log(`isQa=${ctx.isQa} isProdReal=${ctx.isProdReal}`);
  log("\nAcciones que SE simulan (dry-run):");
  log("  - update-profile, suspend-sending, archive-qa");
  log("  - resend-receipt (si hay factura QA)");
  log("  - reactivate-sending / resend-welcome (pueden fallar por estado; se reporta)");
  log("  - bloqueos PROD: archive/suspend Arturo, jaoyarzu, geaed");
  log("\nAcciones que NO se ejecutan:");
  log("  - archive QA real, suspend/reactivate real");
  log("  - reenvío real de correos");
  log("  - cambios en Arturo, jaoyarzu, geaed, Victor principal");
  log("  - saldos, wallets, órdenes, facturas");
  if (mode === "apply") {
    log("\nAcción APPLY (solo con flags):");
    log("  - update-profile real + revert contact_name en QA");
  } else {
    log("\nMutaciones reales: DESHABILITADAS (use --apply con confirmación explícita)");
  }
}

async function runDryRunQa(
  ctx: ClientActionContext,
  pg: Awaited<ReturnType<typeof createPgClient>>,
  qaId: string,
  beforeQa: Snapshot,
  globalLogsCountBefore: number,
) {
  log("\n--- Dry-run QA ---");
  const dryRunTests: Array<{ name: string; run: () => Promise<unknown> }> = [
    {
      name: "update-profile",
      run: () =>
        adminUpdateClientProfile(
          ctx,
          ACTOR,
          { contact_name: "QA Dry-Run Contact" },
          META,
          { dryRun: true },
        ),
    },
    {
      name: "suspend-sending",
      run: () =>
        adminSuspendClientSending(
          ctx,
          ACTOR,
          `SUSPENDER ENVIO ${ctx.company.id}`,
          META,
          { dryRun: true },
        ),
    },
    {
      name: "reactivate-sending",
      run: () =>
        adminReactivateClientSending(
          ctx,
          ACTOR,
          `REACTIVAR ENVIO ${ctx.company.id}`,
          META,
          { dryRun: true },
        ),
    },
    {
      name: "resend-welcome",
      run: () =>
        adminResendWelcomeEmail(
          ctx,
          ACTOR,
          `REENVIAR BIENVENIDA ${ctx.company.id}`,
          META,
          { dryRun: true, testMode: true },
        ),
    },
    {
      name: "archive-qa",
      run: () =>
        adminArchiveQaClient(
          ctx,
          ACTOR,
          `ARCHIVAR QA ${ctx.company.id}`,
          META,
          { dryRun: true },
        ),
    },
  ];

  const invoiceId = await findQaInvoiceId(qaId);
  if (invoiceId) {
    const invRow = await pg.query(
      `SELECT invoice_number FROM billing_invoices WHERE id = $1::uuid`,
      [invoiceId],
    );
    const invNum = String(invRow.rows[0]?.invoice_number ?? invoiceId);
    dryRunTests.push({
      name: "resend-receipt",
      run: () =>
        adminResendReceiptEmail(
          ctx,
          ACTOR,
          invoiceId,
          `REENVIAR COMPROBANTE ${invNum}`,
          META,
          { dryRun: true },
        ),
    });
  } else {
    log("SKIP resend-receipt dry-run — sin factura QA");
  }

  for (const t of dryRunTests) {
    try {
      const result = await t.run();
      log(`OK dry-run ${t.name}: ${JSON.stringify(result).slice(0, 160)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`INFO dry-run ${t.name}: ${msg.slice(0, 120)}`);
    }
  }

  const afterDryRunQa = await snapshotCompany(pg, qaId);
  snapshotsEqual(beforeQa, afterDryRunQa, "dry-run QA");

  const globalLogsAfterDry = await pg.query(
    `SELECT COUNT(*)::int AS n FROM admin_action_logs`,
  );
  const afterCount = Number(globalLogsAfterDry.rows[0]?.n ?? 0);
  if (afterCount !== globalLogsCountBefore) {
    log(`FAIL dry-run insertó admin_action_logs: ${globalLogsCountBefore} → ${afterCount}`);
    process.exitCode = 1;
  } else {
    log(`OK dry-run sin admin_action_logs nuevos (total=${globalLogsCountBefore})`);
  }
}

async function runProdBlocks(pg: Awaited<ReturnType<typeof createPgClient>>) {
  log("\n--- Bloqueos PROD_REAL / protected (dry-run) ---");
  const arturoId = "1dd7ae99-16cf-40cc-a728-8dec7f36aa0e";
  const arturoCtx = await loadClientActionContext(arturoId);
  if (!arturoCtx) fail("Arturo no encontrado");

  const arturoBefore = await snapshotCompany(pg, arturoId);

  await expectThrows("archive Arturo", () =>
    adminArchiveQaClient(
      arturoCtx,
      ACTOR,
      `ARCHIVAR QA ${arturoCtx.company.id}`,
      META,
      { dryRun: true },
    ),
  );

  for (const [name, id] of [
    ["jaoyarzu", "f889a7f5-0a54-4425-b8cd-ab80bd0e770e"],
    ["geaed", "007d4e85-f51c-4dc4-b94b-50e904b610a7"],
  ] as const) {
    const c = await loadClientActionContext(id);
    if (!c) continue;
    await expectThrows(`archive ${name}`, () =>
      adminArchiveQaClient(c, ACTOR, `ARCHIVAR QA ${c.company.id}`, META, {
        dryRun: true,
      }),
    );
  }

  await expectThrows("suspend Arturo sin override", () =>
    adminSuspendClientSending(
      arturoCtx,
      ACTOR,
      `SUSPENDER ENVIO ${arturoCtx.company.id}`,
      META,
      { dryRun: true },
    ),
  );

  const dryOverride = await adminSuspendClientSending(
    arturoCtx,
    ACTOR,
    `SUSPENDER ENVIO ${arturoCtx.company.id}`,
    META,
    { dryRun: true, protectedOverride: true },
  );
  log(`OK suspend Arturo dry-run+override: ${dryOverride.message}`);

  snapshotsEqual(arturoBefore, await snapshotCompany(pg, arturoId), "Arturo");
  log("OK sin endpoint eliminar PROD_REAL");
}

async function runApplyQa(
  pg: Awaited<ReturnType<typeof createPgClient>>,
  qaId: string,
  beforeQa: Snapshot,
) {
  log("\n--- APPLY: update-profile real + revert (solo QA) ---");
  const ctx = await loadClientActionContext(qaId);
  if (!ctx) fail("contexto QA perdido");

  const originalContact = String(beforeQa.company?.contact_name ?? "");
  const testContact = `QA Test ${new Date().toISOString().slice(0, 19)}`;

  const updateResult = await adminUpdateClientProfile(
    ctx,
    ACTOR,
    { contact_name: testContact },
    META,
  );
  log(`OK update real: ${updateResult.message}`);

  const afterUpdate = await snapshotCompany(pg, qaId);
  if (afterUpdate.company?.contact_name !== testContact) {
    fail(`contact_name no cambió`);
  }

  const revertCtx = await loadClientActionContext(qaId);
  if (!revertCtx) fail("contexto QA para revert");
  await adminUpdateClientProfile(
    revertCtx,
    ACTOR,
    { contact_name: originalContact || " " },
    META,
  );
  log("OK revert contact_name");

  const afterRevert = await snapshotCompany(pg, qaId);
  if (afterRevert.walletSms !== beforeQa.walletSms) fail("wallet cambió");
  if (afterRevert.orderCount !== beforeQa.orderCount) fail("orders cambió");
  if (afterRevert.invoiceCount !== beforeQa.invoiceCount) fail("invoices cambió");
  log("OK wallet/orders/invoices sin cambio tras apply");
}

async function main() {
  const cli = parseCli(process.argv.slice(2));

  if (cli.apply) {
    if (!cli.companyId) {
      fail("--apply requiere --company-id=<UUID>");
    }
    const expectedConfirm = `EJECUTAR ACCION QA CONTROLADA ${cli.companyId}`;
    if (cli.confirm !== expectedConfirm) {
      fail(
        `Confirmación incorrecta. Debe ser exactamente: ${expectedConfirm}`,
      );
    }
  }

  const qaId = cli.companyId ?? (await findDefaultQaCompanyId());
  if (!qaId) fail("No se encontró cuenta QA");

  const ctx = await loadClientActionContext(qaId);
  if (!ctx) fail("No se pudo cargar contexto");

  assertQaCompanyAllowed(qaId, ctx);
  const perms = getClientActionPermissions(ctx);
  if (!perms.archiveQa.allowed && !cli.apply) {
    log(`INFO archiveQa: ${perms.archiveQa.reason ?? "no permitido"}`);
  }

  printPlan(cli.apply ? "apply" : "safe", ctx);

  const pg = createPgClient();
  await pg.connect();

  const beforeQa = await snapshotCompany(pg, qaId);
  const globalLogsBefore = await pg.query(
    `SELECT COUNT(*)::int AS n FROM admin_action_logs`,
  );
  const globalLogsCountBefore = Number(globalLogsBefore.rows[0]?.n ?? 0);

  await runDryRunQa(ctx, pg, qaId, beforeQa, globalLogsCountBefore);
  await runProdBlocks(pg);

  if (cli.apply) {
    await runApplyQa(pg, qaId, beforeQa);
  }

  await pg.end();
  log("\n=== Fin (modo " + (cli.apply ? "apply" : "safe") + ") ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
