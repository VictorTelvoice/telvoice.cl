import type { CompanyRow } from "../types/tenant.js";
import { AppError } from "../utils/errors.js";
import { findCompanyById } from "./companyService.js";

/** Mensaje unificado cuando la cuenta no puede enviar SMS por estado operativo. */
export const COMPANY_SEND_SUSPENDED_MESSAGE =
  "Cuenta suspendida para envío SMS. Contacta a Telvoice.";

/**
 * Valida que la empresa pueda crear/enviar SMS (panel, API, campañas, cola).
 * No valida saldo ni wallet — eso ocurre después en cada flujo.
 */
export async function assertCompanyCanSendSms(
  companyId: string,
): Promise<CompanyRow> {
  const company = await findCompanyById(companyId);
  if (!company) {
    throw new AppError("Empresa no encontrada.", 404);
  }
  if (company.status !== "active") {
    const msg =
      company.status === "suspended" || company.status === "blocked"
        ? COMPANY_SEND_SUSPENDED_MESSAGE
        : `La cuenta empresa está en estado «${company.status}»; no permite envíos.`;
    throw new AppError(msg, 403);
  }
  return company;
}
