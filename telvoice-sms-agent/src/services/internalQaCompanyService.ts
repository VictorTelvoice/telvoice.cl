import { env } from "../config/env.js";
import { getSupabase } from "../database/supabaseClient.js";
import { AppError } from "../utils/errors.js";
import { findCompanyById } from "./companyService.js";
import { APP_VERIFY_TEST_SOURCE } from "./smsLiveTestLimiterService.js";

export type InternalQaContextView = {
  companyId: string;
  companyIdShort: string;
  companyName: string;
  alias: string;
  availableSms: number | null;
};

export function formatShortCompanyId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length <= 13) {
    return trimmed;
  }
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}

/** Empresa demo Telvoice usada históricamente en scripts QA. */
export const DEFAULT_INTERNAL_QA_COMPANY_ID =
  "6cd1db92-d5c7-45e0-8548-df8907843350";

export const ADMIN_VERIFY_TEST_SOURCE = "admin_verify_test";

export function resolveInternalQaCompanyId(): string {
  const configured = env.internalQa.companyId?.trim();
  return configured || DEFAULT_INTERNAL_QA_COMPANY_ID;
}

export function isVerifyTestSendSource(source: string | null | undefined): boolean {
  return (
    source === APP_VERIFY_TEST_SOURCE ||
    source === ADMIN_VERIFY_TEST_SOURCE ||
    source === "app_send_sms_live_test"
  );
}

export function companyMetadataFlaggedInternalQa(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.internal_qa === true;
}

export async function isInternalQaCompany(companyId: string): Promise<boolean> {
  if (companyId === resolveInternalQaCompanyId()) {
    return true;
  }
  const company = await findCompanyById(companyId);
  if (!company) {
    return false;
  }
  return companyMetadataFlaggedInternalQa(
    company.metadata as Record<string, unknown> | undefined,
  );
}

/** Bloquea VERIFY_TEST / QA admin contra clientes comerciales reales. */
export async function assertInternalQaCompanyForTestSend(
  companyId: string,
): Promise<void> {
  if (await isInternalQaCompany(companyId)) {
    return;
  }
  const qaId = resolveInternalQaCompanyId();
  throw new AppError(
    `Los envíos VERIFY_TEST/QA solo pueden usar la empresa interna Telvoice QA. ` +
      `Configura INTERNAL_QA_COMPANY_ID (${qaId}) y no uses cuentas de clientes reales.`,
    403,
  );
}

/** Etiqueta superadmin para mensajes QA internos. */
export function resolveAdminMessageCompanyLabel(
  companyName: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): string {
  const source =
    metadata && typeof metadata.source === "string" ? metadata.source : null;
  if (
    metadata?.internal_test === true ||
    source === APP_VERIFY_TEST_SOURCE ||
    source === ADMIN_VERIFY_TEST_SOURCE
  ) {
    return "Telvoice QA";
  }
  return companyName?.trim() || "—";
}

/** Datos de solo lectura para la tarjeta QA en /admin/test (superadmin). */
export async function getInternalQaContextView(): Promise<InternalQaContextView> {
  const companyId = resolveInternalQaCompanyId();
  const company = await findCompanyById(companyId);
  const companyName =
    company?.name?.trim() ||
    company?.legal_name?.trim() ||
    "Empresa Demo Telvoice";

  let availableSms: number | null = null;
  const { data, error } = await getSupabase()
    .from("company_sms_wallets")
    .select("available_sms")
    .eq("company_id", companyId)
    .eq("country", "CL")
    .maybeSingle();

  if (!error && data) {
    availableSms = Number(data.available_sms);
  }

  return {
    companyId,
    companyIdShort: formatShortCompanyId(companyId),
    companyName,
    alias: "Telvoice QA",
    availableSms,
  };
}
