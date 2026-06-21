/**
 * Casos unitarios de aislamiento tenant en login Google.
 *
 * Uso:
 *   npx tsx scripts/test-google-login-tenant-isolation.ts
 */
import assert from "node:assert/strict";
import {
  resolveTenantFromCandidates,
  type TenantResolutionResult,
} from "../src/services/googleLoginTenantResolution.js";

const LICAN = "54601663-f35f-4c26-9410-a9d2dc0ad697";
const GOCLUB = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function expectResult(
  actual: TenantResolutionResult,
  expected: Partial<TenantResolutionResult>,
  label: string,
): void {
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(
      actual[key as keyof TenantResolutionResult],
      value,
      `${label}: ${key}`,
    );
  }
}

function testCase1ExistingProfilePreservesTenantDespiteHigherWalletCandidate(): void {
  const result = resolveTenantFromCandidates({
    currentCompanyId: LICAN,
    candidateIds: [LICAN, GOCLUB],
  });
  expectResult(
    result,
    {
      companyId: LICAN,
      action: "preserve_existing",
      tenantConflictDetected: true,
      candidateCount: 2,
    },
    "caso 1",
  );
  console.log("✓ caso 1: perfil existente conserva Licantravel aunque exista candidato GoClub");
}

function testCase2NoProfileSingleCandidateLinks(): void {
  const result = resolveTenantFromCandidates({
    currentCompanyId: null,
    candidateIds: [LICAN],
  });
  expectResult(
    result,
    {
      companyId: LICAN,
      action: "link_single_candidate",
      tenantConflictDetected: false,
      candidateCount: 1,
    },
    "caso 2",
  );
  console.log("✓ caso 2: sin company_id + un candidato → vincula al único");
}

function testCase3NoProfileMultipleCandidatesBlocked(): void {
  const result = resolveTenantFromCandidates({
    currentCompanyId: null,
    candidateIds: [LICAN, GOCLUB],
  });
  expectResult(
    result,
    {
      companyId: null,
      action: "blocked_multiple_candidates",
      tenantConflictDetected: true,
      candidateCount: 2,
    },
    "caso 3",
  );
  console.log("✓ caso 3: sin company_id + dos candidatos → bloqueado, sin score");
}

function testCase4SameEmailTwoBillingCompaniesBlocked(): void {
  const result = resolveTenantFromCandidates({
    currentCompanyId: null,
    candidateIds: [LICAN, GOCLUB],
  });
  assert.equal(result.action, "blocked_multiple_candidates");
  assert.equal(result.companyId, null);
  console.log("✓ caso 4: mismo email en billing_email de dos companies → no auto-resuelve");
}

function testCase5CookieDoesNotInfluenceResolution(): void {
  const result = resolveTenantFromCandidates({
    currentCompanyId: LICAN,
    candidateIds: [GOCLUB, LICAN],
  });
  assert.equal(result.companyId, LICAN);
  assert.equal(result.action, "preserve_existing");
  console.log("✓ caso 5: perfil Licantravel prevalece; cookie no arrastra tenant GoClub");
}

function testNoCandidateAllowsNewCompanyPath(): void {
  const result = resolveTenantFromCandidates({
    currentCompanyId: null,
    candidateIds: [],
  });
  expectResult(
    result,
    { companyId: null, action: "no_candidate", tenantConflictDetected: false },
    "sin candidatos",
  );
  console.log("✓ sin candidatos → flujo crea company nueva (bootstrap)");
}

function testExistingCompanyZeroWalletStillPreserved(): void {
  const result = resolveTenantFromCandidates({
    currentCompanyId: LICAN,
    candidateIds: [GOCLUB],
  });
  assert.equal(result.companyId, LICAN);
  assert.equal(result.tenantConflictDetected, true);
  console.log("✓ regresión: company_id existente nunca se reemplaza por wallet score");
}

function main(): void {
  console.log("=== test:google-login-tenant-isolation ===\n");
  testCase1ExistingProfilePreservesTenantDespiteHigherWalletCandidate();
  testCase2NoProfileSingleCandidateLinks();
  testCase3NoProfileMultipleCandidatesBlocked();
  testCase4SameEmailTwoBillingCompaniesBlocked();
  testCase5CookieDoesNotInfluenceResolution();
  testNoCandidateAllowsNewCompanyPath();
  testExistingCompanyZeroWalletStillPreserved();
  console.log("\nTodas las pruebas pasaron.");
}

main();
