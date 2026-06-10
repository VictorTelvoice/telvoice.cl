#!/usr/bin/env node
/**
 * Reconciliación REVIEW_REQUIRED con compras MP pagadas.
 * Dry-run por defecto.
 *
 * Flags:
 *   --dry-run               Simulación (default)
 *   --apply                 Ejecutar (requiere --email)
 *   --email=user@domain.com Alcance por email
 *   --all --confirm="ACTIVAR COMPRAS MP REALES"  Apply masivo (no usar sin aprobación)
 *   --force-manual-review   Permite manual_review (escape genérico; evitar)
 *   --resolve-manual-review Resuelve manual_review con validación MP+email
 *   --company-id=UUID       Company exacta si hay múltiples candidatas
 *   --confirm="..."         Requerido con --resolve-manual-review:
 *                           RESOLVER MANUAL REVIEW MP
 *   --include-qa            Permite QA/test
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
const confirm = arg("confirm") ?? undefined;
const forceManualReview = hasFlag("--force-manual-review");
const resolveManualReview = hasFlag("--resolve-manual-review");
const companyId = arg("company-id")?.trim() ?? undefined;
const includeQa = hasFlag("--include-qa");

const { reconcileReviewRequiredPaidPurchases } = await import(
  "../src/services/reviewRequiredPaidPurchaseService.ts"
);

console.log(
  JSON.stringify(
    {
      mode: dryRun ? "dry-run" : "apply",
      email: email ?? null,
      all,
      forceManualReview,
      resolveManualReview,
      companyId: companyId ?? null,
      includeQa,
      warning: apply
        ? "APLICANDO: acreditará wallet, asignará rate plan y actualizará flags PROD_REAL."
        : "Solo simulación. Pasa --apply --email=... para ejecutar.",
    },
    null,
    2,
  ),
);

const { summary, results } = await reconcileReviewRequiredPaidPurchases({
  dryRun,
  email,
  all,
  confirm,
  forceManualReview,
  resolveManualReview,
  companyId,
  includeQa,
  actorEmail: "reconcile_script",
});

console.log(JSON.stringify({ summary, count: results.length, results }, null, 2));

if (!apply) {
  console.log(
    "\nPara activar una cuenta por email:",
  );
  console.log(
    "  npm run reconcile:review-required-paid-purchases -- --apply --email=user@domain.com",
  );
}
