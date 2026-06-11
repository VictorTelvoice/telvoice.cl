/**
 * Validación read-only / dry-run de acciones seguras superadmin.
 * Uso: npx tsx scripts/test-admin-client-actions.ts
 */
import {
  getClientActionPermissions,
  loadClientActionContext,
} from "../src/services/adminClientActionsService.js";

const PROD_IDS = {
  arturo: "1dd7ae99-16cf-40cc-a728-8dec7f36aa0e",
  jaoyarzu: "f889a7f5-0a54-4425-b8cd-ab80bd0e770e",
  geaed: "007d4e85-f51c-4dc4-b94b-50e904b610a7",
};

async function checkProdIntact(label: string, id: string) {
  const ctx = await loadClientActionContext(id);
  if (!ctx) {
    console.log(`FAIL ${label}: no encontrado`);
    return;
  }
  const perms = getClientActionPermissions(ctx);
  console.log(
    `OK ${label}: status=${ctx.company.status} sms=${ctx.company.id.slice(0, 8)} archiveQa=${perms.archiveQa.allowed}`,
  );
}

async function main() {
  for (const [label, id] of Object.entries(PROD_IDS)) {
    await checkProdIntact(label, id);
  }

  const arturo = await loadClientActionContext(PROD_IDS.arturo);
  if (arturo) {
    const perms = getClientActionPermissions(arturo);
    console.log(
      "BLOCK archive PROD_REAL:",
      perms.archiveQa.allowed === false ? "OK" : "FAIL",
    );
    console.log(
      "BLOCK suspend protected override needed:",
      perms.suspendSending.needsProtectedOverride === true ? "OK" : "INFO",
    );
  }

  console.log("Dry-run tests require QA company id — ejecutar manualmente en panel.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
