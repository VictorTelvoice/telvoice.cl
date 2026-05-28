import { env } from "../config/env.js";
import { listActiveCompanyRatePlans } from "./companyRatePlanService.js";
import { findCompanyById } from "./companyService.js";
import { getOrCreateCompanyWallet } from "./smsWalletService.js";

/** Empresa explícita en allowlist QA/demo (SMS_LIVE_TEST_ALLOWED_COMPANY_IDS). */
export function isCompanyInLiveTestAllowlist(companyId: string): boolean {
  const allowed = env.smsProvider.liveTestAllowedCompanyIds;
  return allowed.length > 0 && allowed.includes(companyId);
}

/**
 * Cliente pagado con rate plan CL activo y live_enabled.
 * No exige saldo > 0 (el envío valida saldo aparte).
 */
export async function companyHasOperationalRatePlan(
  companyId: string,
): Promise<boolean> {
  const company = await findCompanyById(companyId);
  if (!company || company.status !== "active") {
    return false;
  }

  const wallet = await getOrCreateCompanyWallet(companyId);
  if (wallet.status !== "active") {
    return false;
  }

  const country = env.defaultRetailRatePlan.country;
  const plans = await listActiveCompanyRatePlans(companyId, country);
  return plans.some((p) => p.live_enabled === true);
}

/**
 * Autorización para /app/send-sms y campañas:
 * - allowlist explícita (QA/demo), o
 * - allowlist vacía (modo abierto legacy), o
 * - rate plan operativo cuando ALLOW_RATE_PLAN_COMPANIES_TO_SEND=true
 */
export async function isCompanyAuthorizedForPanelSmsSend(
  companyId: string,
): Promise<boolean> {
  const allowed = env.smsProvider.liveTestAllowedCompanyIds;

  if (allowed.includes(companyId)) {
    return true;
  }

  if (
    env.smsProvider.allowRatePlanCompaniesToSend &&
    (await companyHasOperationalRatePlan(companyId))
  ) {
    return true;
  }

  if (allowed.length === 0) {
    return true;
  }

  return false;
}
