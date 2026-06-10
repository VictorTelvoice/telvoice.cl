#!/usr/bin/env node
/**
 * Reconciliación de compras pagadas sin crédito wallet.
 * Dry-run por defecto. Usar --apply para ejecutar.
 * Opcional: --email=user@domain.com
 */
import "dotenv/config";

function hasFlag(name) {
  return process.argv.includes(name);
}

function arg(name) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : null;
}

const apply = hasFlag("--apply");
const dryRun = !apply;
const email = arg("email")?.trim().toLowerCase() ?? undefined;

const { reconcileAllPaidUnclaimedPurchases } = await import(
  "../src/services/billingPurchaseReconciliationService.ts"
);

console.log(
  JSON.stringify(
    {
      mode: dryRun ? "dry-run" : "apply",
      email: email ?? null,
      warning: apply
        ? "APLICANDO cambios: acreditará wallet y vinculará empresas."
        : "Solo simulación. Pasa --apply para ejecutar.",
    },
    null,
    2,
  ),
);

const results = await reconcileAllPaidUnclaimedPurchases({
  dryRun,
  email,
  source: "reconcile_script",
});

console.log(JSON.stringify({ count: results.length, results }, null, 2));

if (!apply) {
  console.log("\nPara aplicar: npm run reconcile:paid-unclaimed-purchases -- --apply [--email=...]");
}
