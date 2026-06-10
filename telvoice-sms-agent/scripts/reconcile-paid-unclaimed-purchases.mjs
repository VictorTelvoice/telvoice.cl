#!/usr/bin/env node
/**
 * Reconciliación de compras pagadas sin crédito wallet.
 * Dry-run por defecto. Usar --apply para ejecutar.
 *
 * Flags:
 *   --apply                 Ejecutar (requiere --email o --all)
 *   --email=user@domain.com Alcance por email
 *   --all                   Apply masivo (excluye QA/manual_review/conflicts)
 *   --force-manual-review   Permite órdenes en manual_review
 *   --include-qa            Permite órdenes QA/test
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
const dryRun = hasFlag("--dry-run") || !apply;
const email = arg("email")?.trim().toLowerCase() ?? undefined;
const all = hasFlag("--all");
const forceManualReview = hasFlag("--force-manual-review");
const includeQa = hasFlag("--include-qa");

const { reconcileAllPaidUnclaimedPurchases } = await import(
  "../src/services/billingPurchaseReconciliationService.ts"
);

console.log(
  JSON.stringify(
    {
      mode: dryRun ? "dry-run" : "apply",
      email: email ?? null,
      all,
      forceManualReview,
      includeQa,
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
  all,
  forceManualReview,
  includeQa,
  source: "reconcile_script",
});

console.log(JSON.stringify({ count: results.length, results }, null, 2));

if (!apply) {
  console.log(
    "\nPara aplicar una orden por email:",
  );
  console.log(
    "  npm run reconcile:paid-unclaimed-purchases -- --apply --email=user@domain.com",
  );
}
