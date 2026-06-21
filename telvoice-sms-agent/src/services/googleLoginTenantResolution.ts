import { findCompanyCandidatesByEmail } from "./billingPurchaseReconciliationService.js";

export type TenantResolutionAction =
  | "preserve_existing"
  | "link_single_candidate"
  | "blocked_multiple_candidates"
  | "no_candidate";

export type TenantResolutionResult = {
  companyId: string | null;
  action: TenantResolutionAction;
  tenantConflictDetected: boolean;
  candidateCount: number;
  candidateIds: string[];
};

/** Reglas puras de aislamiento tenant (testeable sin I/O). */
export function resolveTenantFromCandidates(input: {
  currentCompanyId: string | null;
  candidateIds: string[];
}): TenantResolutionResult {
  const candidateIds = [...new Set(input.candidateIds.filter(Boolean))];
  const { currentCompanyId } = input;

  if (currentCompanyId) {
    const otherCandidates = candidateIds.filter((id) => id !== currentCompanyId);
    return {
      companyId: currentCompanyId,
      action: "preserve_existing",
      tenantConflictDetected: otherCandidates.length > 0,
      candidateCount: candidateIds.length,
      candidateIds,
    };
  }

  if (candidateIds.length === 0) {
    return {
      companyId: null,
      action: "no_candidate",
      tenantConflictDetected: false,
      candidateCount: 0,
      candidateIds,
    };
  }

  if (candidateIds.length === 1) {
    return {
      companyId: candidateIds[0] ?? null,
      action: "link_single_candidate",
      tenantConflictDetected: false,
      candidateCount: 1,
      candidateIds,
    };
  }

  return {
    companyId: null,
    action: "blocked_multiple_candidates",
    tenantConflictDetected: true,
    candidateCount: candidateIds.length,
    candidateIds,
  };
}

function maskEmailForLog(email: string): string {
  const at = email.indexOf("@");
  if (at <= 1) return "***";
  return `${email.slice(0, 2)}***${email.slice(at)}`;
}

function logTenantResolution(
  event: "tenant_conflict_detected" | "tenant_resolution_blocked" | "tenant_linked_single",
  payload: Record<string, unknown>,
): void {
  console.info(JSON.stringify({ event, at: new Date().toISOString(), ...payload }));
}

/** Resuelve company_id para login Google sin auto-relink por wallet score. */
export async function resolveCompanyForClientLogin(
  email: string,
  currentCompanyId: string | null,
): Promise<TenantResolutionResult> {
  const candidates = await findCompanyCandidatesByEmail(email);
  const result = resolveTenantFromCandidates({
    currentCompanyId,
    candidateIds: candidates.map((c) => c.id),
  });

  const maskedEmail = maskEmailForLog(email);

  if (result.action === "preserve_existing" && result.tenantConflictDetected) {
    logTenantResolution("tenant_conflict_detected", {
      email: maskedEmail,
      currentCompanyId,
      otherCandidateIds: result.candidateIds.filter((id) => id !== currentCompanyId),
      candidateCount: result.candidateCount,
    });
  } else if (result.action === "link_single_candidate" && result.companyId) {
    logTenantResolution("tenant_linked_single", {
      email: maskedEmail,
      companyId: result.companyId,
    });
  } else if (result.action === "blocked_multiple_candidates") {
    logTenantResolution("tenant_resolution_blocked", {
      email: maskedEmail,
      reason: "multiple_candidates",
      candidateIds: result.candidateIds,
      candidateCount: result.candidateCount,
    });
  }

  return result;
}
