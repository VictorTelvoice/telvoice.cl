import { createPgClient } from "../database/pgClient.js";
import { getSupabase } from "../database/supabaseClient.js";
import type {
  ClientActionActor,
  ClientActionContext,
  ClientActionPermissions,
  ClientActionRequestMeta,
  ClientActionResult,
  UpdateClientProfileInput,
} from "../types/adminClientActions.js";
import type { AdminClientAuditInfo } from "../types/adminClientsList.js";
import type { CompanyRow } from "../types/tenant.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import {
  companyNameLooksQa,
  emailLooksQa,
  PROTECTED_CLIENT_EMAILS,
} from "./adminDataAuditClassifier.js";
import { insertAdminActionLog } from "./adminActionLogService.js";
import { insertAuditLog } from "./auditLogService.js";
import { resendInvoiceEmail } from "./billingEmailService.js";
import { sendWelcomeAndSmsCreditedEmail } from "./transactionalEmailService.js";
import { isBillingEmailMock, isTransactionalEmailMock } from "../config/env.js";

const PROD_REAL_CLASSIFICATIONS = new Set(["PROD_REAL", "PROD_INTERNAL"]);
const QA_CLASSIFICATIONS = new Set(["QA_TEST", "DEMO_SEED"]);

export function assertLiteralConfirmation(
  actual: string,
  expected: string,
  label = "Confirmación",
): void {
  if (actual.trim() !== expected) {
    throw new AppError(
      `${label} incorrecta. Debe ser exactamente: ${expected}`,
      400,
    );
  }
}

function rowToCompany(row: Record<string, unknown>): CompanyRow {
  return {
    id: String(row.id),
    name: String(row.name),
    legal_name: row.legal_name != null ? String(row.legal_name) : null,
    rut: row.rut != null ? String(row.rut) : null,
    billing_email: row.billing_email != null ? String(row.billing_email) : null,
    contact_name: row.contact_name != null ? String(row.contact_name) : null,
    contact_phone: row.contact_phone != null ? String(row.contact_phone) : null,
    country: String(row.country ?? "CL"),
    status: row.status as CompanyRow["status"],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function buildAuditInfo(
  company: CompanyRow,
  flag: {
    classification: string;
    protected: boolean;
    reason: string | null;
    archivedAt?: string | null;
  } | null,
): AdminClientAuditInfo {
  const archivedAt = flag?.archivedAt ?? null;
  if (flag?.classification) {
    const billingEmail = normalizeAuditEmail(company.billing_email);
    const protectedFlag =
      Boolean(flag.protected) || PROTECTED_CLIENT_EMAILS.has(billingEmail);
    return {
      classification: flag.classification as AdminClientAuditInfo["classification"],
      protected: protectedFlag,
      reason: flag.reason,
      hasFlag: true,
      archivedAt,
    };
  }
  const email = normalizeAuditEmail(company.billing_email ?? company.name);
  const protectedClient = PROTECTED_CLIENT_EMAILS.has(email);
  return {
    classification: protectedClient ? "PROD_REAL" : "REVIEW_REQUIRED",
    protected: protectedClient,
    reason: null,
    hasFlag: false,
    archivedAt,
  };
}

function normalizeAuditEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isHeuristicQa(company: CompanyRow): boolean {
  return (
    companyNameLooksQa(company.name) ||
    emailLooksQa(company.billing_email ?? "") ||
    emailLooksQa(company.name)
  );
}

export async function loadClientActionContext(
  companyId: string,
): Promise<ClientActionContext | null> {
  const client = createPgClient();
  await client.connect();
  try {
    const res = await client.query(
      `
      SELECT
        c.id, c.name, c.legal_name, c.rut, c.billing_email, c.contact_name,
        c.contact_phone, c.country, c.status, c.metadata, c.created_at, c.updated_at,
        f.classification AS audit_classification,
        f.protected AS audit_protected,
        f.reason AS audit_reason,
        f.archived_at::text AS archived_at
      FROM companies c
      LEFT JOIN admin_data_audit_flags f
        ON f.entity_type = 'company' AND f.entity_id = c.id::text
      WHERE c.id = $1::uuid
      `,
      [companyId],
    );
    if (res.rows.length === 0) return null;

    const row = res.rows[0]!;
    const company = rowToCompany(row);
    const archivedAt =
      row.archived_at != null ? String(row.archived_at) : null;
    const flag =
      row.audit_classification != null
        ? {
            classification: String(row.audit_classification),
            protected: Boolean(row.audit_protected),
            reason: row.audit_reason != null ? String(row.audit_reason) : null,
            archivedAt,
          }
        : archivedAt
          ? {
              classification: "QA_TEST",
              protected: false,
              reason: null,
              archivedAt,
            }
          : null;
    const audit = buildAuditInfo(company, flag);
    const classification = audit.classification;
    const isProdReal =
      audit.protected || PROD_REAL_CLASSIFICATIONS.has(classification);
    const isQa =
      QA_CLASSIFICATIONS.has(classification) || isHeuristicQa(company);

    const orderRes = await client.query(
      `
      SELECT id::text
      FROM sms_orders
      WHERE company_id = $1::uuid AND credit_status = 'credited'
      ORDER BY credited_at DESC NULLS LAST, created_at DESC
      LIMIT 1
      `,
      [companyId],
    );

    return {
      company,
      audit,
      archivedAt,
      classification,
      isProdReal,
      isQa,
      isProtected: audit.protected,
      welcomeOrderId:
        orderRes.rows[0]?.id != null ? String(orderRes.rows[0].id) : null,
    };
  } finally {
    await client.end();
  }
}

export function getClientActionPermissions(
  ctx: ClientActionContext,
): ClientActionPermissions {
  const archived = Boolean(ctx.archivedAt);
  const active = ctx.company.status === "active";

  const updateProfile: ClientActionPermissions["updateProfile"] = archived
    ? { allowed: false, reason: "Cuenta archivada." }
    : { allowed: true };

  const suspendSending: ClientActionPermissions["suspendSending"] = (() => {
    if (archived) return { allowed: false, reason: "Cuenta archivada." };
    if (!active) {
      return { allowed: false, reason: `Estado actual: ${ctx.company.status}` };
    }
    if (ctx.isProtected) {
      return {
        allowed: true,
        needsProtectedOverride: true,
        reason: "Cliente protected: requiere override explícito.",
      };
    }
    return { allowed: true };
  })();

  const reactivateSending: ClientActionPermissions["reactivateSending"] = (() => {
    if (archived) return { allowed: false, reason: "Cuenta archivada." };
    if (ctx.company.status !== "suspended") {
      return {
        allowed: false,
        reason: `Solo aplica si está suspendida (actual: ${ctx.company.status}).`,
      };
    }
    if (ctx.isProtected) {
      return {
        allowed: true,
        needsProtectedOverride: true,
        reason: "Cliente protected: requiere override explícito.",
      };
    }
    return { allowed: true };
  })();

  const resendWelcome: ClientActionPermissions["resendWelcome"] = (() => {
    if (archived) return { allowed: false, reason: "Cuenta archivada." };
    if (!ctx.welcomeOrderId) {
      return { allowed: false, reason: "Sin orden acreditada para bienvenida." };
    }
    const email =
      ctx.company.billing_email?.trim() ||
      normalizeAuditEmail(ctx.company.name);
    if (!email.includes("@")) {
      return { allowed: false, reason: "Sin email válido en la cuenta." };
    }
    if (ctx.isQa) {
      return {
        allowed: true,
        reason: "QA: usar modo test o dry-run.",
      };
    }
    return { allowed: true };
  })();

  const resendReceipt: ClientActionPermissions["resendReceipt"] = {
    allowed: !archived,
    reason: archived ? "Cuenta archivada." : undefined,
  };

  const archiveQa: ClientActionPermissions["archiveQa"] = (() => {
    if (archived) return { allowed: false, reason: "Ya archivada." };
    if (ctx.isProdReal) {
      return { allowed: false, reason: "No permitido en PROD_REAL." };
    }
    if (ctx.isProtected) {
      return { allowed: false, reason: "Cliente protected." };
    }
    if (!ctx.isQa) {
      return { allowed: false, reason: "Solo cuentas QA/Test." };
    }
    return { allowed: true };
  })();

  return {
    updateProfile,
    suspendSending,
    reactivateSending,
    resendWelcome,
    resendReceipt,
    archiveQa,
  };
}

async function recordAction(
  actor: ClientActionActor,
  ctx: ClientActionContext,
  actionType: ClientActionResult["actionType"],
  previousState: Record<string, unknown>,
  newState: Record<string, unknown>,
  metadata: Record<string, unknown>,
  meta: ClientActionRequestMeta,
  dryRun?: boolean,
): Promise<void> {
  const fullMeta = { ...metadata, dryRun: dryRun === true };
  await insertAdminActionLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    companyId: ctx.company.id,
    actionType,
    previousState,
    newState,
    metadata: fullMeta,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  await insertAuditLog({
    actorUserId: actor.userId,
    actorRole: actor.role,
    companyId: ctx.company.id,
    action: actionType,
    entityType: "company",
    entityId: ctx.company.id,
    metadata: { ...fullMeta, previousState, newState },
    ipAddress: meta.ipAddress ?? null,
  });
}

function pickProfileUpdates(
  ctx: ClientActionContext,
  input: UpdateClientProfileInput,
): Partial<CompanyRow> {
  const updates: Partial<CompanyRow> = {};
  const protectedOnlyNonCritical = ctx.isProtected;

  const set = (
    key: keyof UpdateClientProfileInput,
    field: keyof CompanyRow,
    critical: boolean,
  ) => {
    const val = input[key];
    if (val === undefined) return;
    const trimmed = String(val).trim();
    if (critical && protectedOnlyNonCritical) return;
    (updates as Record<string, unknown>)[field] = trimmed || null;
  };

  set("name", "name", true);
  set("billing_email", "billing_email", true);
  set("legal_name", "legal_name", true);
  if (input.country !== undefined) {
    const country = String(input.country).trim().toUpperCase().slice(0, 2);
    if (country.length === 2) {
      updates.country = country;
    }
  }
  set("contact_name", "contact_name", false);
  set("contact_phone", "contact_phone", false);

  return updates;
}

export async function adminUpdateClientProfile(
  ctx: ClientActionContext,
  actor: ClientActionActor,
  input: UpdateClientProfileInput,
  meta: ClientActionRequestMeta,
  options?: { dryRun?: boolean },
): Promise<ClientActionResult> {
  const perms = getClientActionPermissions(ctx);
  if (!perms.updateProfile.allowed) {
    throw new AppError(perms.updateProfile.reason ?? "Acción no permitida.", 403);
  }

  const updates = pickProfileUpdates(ctx, input);
  if (Object.keys(updates).length === 0) {
    throw new AppError(
      ctx.isProtected
        ? "Sin campos editables (protected: solo contacto y país)."
        : "No hay cambios para aplicar.",
      400,
    );
  }

  const previousState = {
    name: ctx.company.name,
    billing_email: ctx.company.billing_email,
    country: ctx.company.country,
    contact_name: ctx.company.contact_name,
    contact_phone: ctx.company.contact_phone,
    legal_name: ctx.company.legal_name,
  };

  const newState = { ...previousState, ...updates };

  if (options?.dryRun) {
    return {
      success: true,
      dryRun: true,
      actionType: "client.update_profile",
      message: "Dry-run: se actualizarían los datos de la cuenta.",
      previousState,
      newState,
      metadata: { fields: Object.keys(updates) },
    };
  }

  const { error } = await getSupabase()
    .from("companies")
    .update(updates)
    .eq("id", ctx.company.id);

  if (error) wrapSupabaseError(error, "adminUpdateClientProfile");

  await recordAction(
    actor,
    ctx,
    "client.update_profile",
    previousState,
    newState,
    { fields: Object.keys(updates) },
    meta,
  );

  return {
    success: true,
    actionType: "client.update_profile",
    message: "Datos de cuenta actualizados.",
    previousState,
    newState,
  };
}

export async function adminSuspendClientSending(
  ctx: ClientActionContext,
  actor: ClientActionActor,
  confirmation: string,
  meta: ClientActionRequestMeta,
  options?: { protectedOverride?: boolean; dryRun?: boolean },
): Promise<ClientActionResult> {
  const perms = getClientActionPermissions(ctx);
  if (!perms.suspendSending.allowed) {
    throw new AppError(perms.suspendSending.reason ?? "Acción no permitida.", 403);
  }
  if (perms.suspendSending.needsProtectedOverride && !options?.protectedOverride) {
    throw new AppError(
      "Cliente protected: marca override explícito para suspender envío.",
      403,
    );
  }

  assertLiteralConfirmation(
    confirmation,
    `SUSPENDER ENVIO ${ctx.company.id}`,
  );

  const previousState = { status: ctx.company.status };
  const newState = { status: "suspended" };

  if (options?.dryRun) {
    return {
      success: true,
      dryRun: true,
      actionType: "client.suspend_sending",
      message: "Dry-run: la cuenta quedaría suspendida para envío SMS.",
      previousState,
      newState,
    };
  }

  const { error } = await getSupabase()
    .from("companies")
    .update({ status: "suspended" })
    .eq("id", ctx.company.id);

  if (error) wrapSupabaseError(error, "adminSuspendClientSending");

  await recordAction(
    actor,
    ctx,
    "client.suspend_sending",
    previousState,
    newState,
    { protectedOverride: options?.protectedOverride === true },
    meta,
  );

  return {
    success: true,
    actionType: "client.suspend_sending",
    message: "Envío SMS suspendido para esta cuenta.",
    previousState,
    newState,
  };
}

export async function adminReactivateClientSending(
  ctx: ClientActionContext,
  actor: ClientActionActor,
  confirmation: string,
  meta: ClientActionRequestMeta,
  options?: { protectedOverride?: boolean; dryRun?: boolean },
): Promise<ClientActionResult> {
  const perms = getClientActionPermissions(ctx);
  if (!perms.reactivateSending.allowed) {
    throw new AppError(
      perms.reactivateSending.reason ?? "Acción no permitida.",
      403,
    );
  }
  if (
    perms.reactivateSending.needsProtectedOverride &&
    !options?.protectedOverride
  ) {
    throw new AppError(
      "Cliente protected: marca override explícito para reactivar envío.",
      403,
    );
  }

  assertLiteralConfirmation(
    confirmation,
    `REACTIVAR ENVIO ${ctx.company.id}`,
  );

  const previousState = { status: ctx.company.status };
  const newState = { status: "active" };

  if (options?.dryRun) {
    return {
      success: true,
      dryRun: true,
      actionType: "client.reactivate_sending",
      message: "Dry-run: la cuenta quedaría activa para envío SMS.",
      previousState,
      newState,
    };
  }

  const { error } = await getSupabase()
    .from("companies")
    .update({ status: "active" })
    .eq("id", ctx.company.id);

  if (error) wrapSupabaseError(error, "adminReactivateClientSending");

  await recordAction(
    actor,
    ctx,
    "client.reactivate_sending",
    previousState,
    newState,
    { protectedOverride: options?.protectedOverride === true },
    meta,
  );

  return {
    success: true,
    actionType: "client.reactivate_sending",
    message: "Envío SMS reactivado.",
    previousState,
    newState,
  };
}

export async function adminResendWelcomeEmail(
  ctx: ClientActionContext,
  actor: ClientActionActor,
  confirmation: string,
  meta: ClientActionRequestMeta,
  options?: { dryRun?: boolean; testMode?: boolean },
): Promise<ClientActionResult> {
  const perms = getClientActionPermissions(ctx);
  if (!perms.resendWelcome.allowed) {
    throw new AppError(perms.resendWelcome.reason ?? "Acción no permitida.", 403);
  }

  if (ctx.isQa && !options?.testMode && !options?.dryRun) {
    throw new AppError(
      "Cuenta QA: usa modo test o dry-run para reenviar bienvenida.",
      403,
    );
  }

  assertLiteralConfirmation(
    confirmation,
    `REENVIAR BIENVENIDA ${ctx.company.id}`,
  );

  const orderId = ctx.welcomeOrderId;
  if (!orderId) {
    throw new AppError("Sin orden acreditada.", 400);
  }

  const previousState = { orderId, welcomeSent: "unknown" };
  const emailMode = isTransactionalEmailMock() ? "mock" : "provider";

  if (options?.dryRun) {
    return {
      success: true,
      dryRun: true,
      actionType: "client.resend_welcome",
      message: `Dry-run: se reenviaría bienvenida (orden ${orderId}, modo ${emailMode}).`,
      previousState,
      newState: { wouldSend: true, orderId, emailMode },
      metadata: { testMode: options?.testMode === true },
    };
  }

  const result = await sendWelcomeAndSmsCreditedEmail(orderId, {
    skipIdempotency: true,
  });

  if (!result.ok) {
    throw new AppError(
      `No se pudo reenviar bienvenida: ${result.error ?? "error desconocido"}`,
      400,
    );
  }

  const newState = { orderId, sent: true, skipped: result.skipped === true };

  await recordAction(
    actor,
    ctx,
    "client.resend_welcome",
    previousState,
    newState,
    { orderId, emailMode, testMode: options?.testMode === true },
    meta,
  );

  return {
    success: true,
    actionType: "client.resend_welcome",
    message: result.skipped
      ? "Bienvenida ya estaba registrada; reenvío omitido por idempotencia."
      : "Bienvenida reenviada y registrada en email_logs.",
    previousState,
    newState,
  };
}

export async function adminResendReceiptEmail(
  ctx: ClientActionContext,
  actor: ClientActionActor,
  invoiceId: string,
  meta: ClientActionRequestMeta,
  options?: { dryRun?: boolean },
): Promise<ClientActionResult> {
  const perms = getClientActionPermissions(ctx);
  if (!perms.resendReceipt.allowed) {
    throw new AppError(perms.resendReceipt.reason ?? "Acción no permitida.", 403);
  }

  if (!invoiceId?.trim()) {
    throw new AppError("Debes seleccionar una factura/comprobante.", 400);
  }

  const client = createPgClient();
  await client.connect();
  let invoiceRow: Record<string, unknown> | null = null;
  try {
    const res = await client.query(
      `
      SELECT id::text, invoice_number, company_id::text, status, payment_status
      FROM billing_invoices
      WHERE id = $1::uuid AND company_id = $2::uuid
      `,
      [invoiceId, ctx.company.id],
    );
    invoiceRow = res.rows[0] ?? null;
  } finally {
    await client.end();
  }

  if (!invoiceRow) {
    throw new AppError("Comprobante no encontrado para este cliente.", 404);
  }

  const previousState = {
    invoiceId,
    invoiceNumber: invoiceRow.invoice_number,
    status: invoiceRow.status,
  };

  const emailMode = isBillingEmailMock() ? "mock" : "provider";

  if (options?.dryRun) {
    return {
      success: true,
      dryRun: true,
      actionType: "client.resend_receipt",
      message: `Dry-run: se reenviaría comprobante ${invoiceRow.invoice_number ?? invoiceId} (modo ${emailMode}).`,
      previousState,
      newState: { wouldSend: true, invoiceId, isResend: true },
    };
  }

  const result = await resendInvoiceEmail(invoiceId, {
    actorType: "superadmin",
    actorId: actor.userId,
    source: "admin_client_resend_receipt",
    isResend: true,
  });

  if (!result.success) {
    throw new AppError(result.message || "Error al reenviar comprobante.", 400);
  }

  const newState = {
    invoiceId,
    sent: !result.skipped,
    skipped: result.skipped === true,
    emailLogId: result.emailLogId,
  };

  await recordAction(
    actor,
    ctx,
    "client.resend_receipt",
    previousState,
    newState,
    { isResend: true, emailMode },
    meta,
  );

  return {
    success: true,
    actionType: "client.resend_receipt",
    message: result.skipped
      ? "Comprobante ya enviado; reenvío registrado como omitido."
      : result.message || "Comprobante reenviado.",
    previousState,
    newState,
  };
}

export async function adminArchiveQaClient(
  ctx: ClientActionContext,
  actor: ClientActionActor,
  confirmation: string,
  meta: ClientActionRequestMeta,
  options?: { dryRun?: boolean },
): Promise<ClientActionResult> {
  const perms = getClientActionPermissions(ctx);
  if (!perms.archiveQa.allowed) {
    throw new AppError(perms.archiveQa.reason ?? "Acción no permitida.", 403);
  }

  assertLiteralConfirmation(confirmation, `ARCHIVAR QA ${ctx.company.id}`);

  const previousState = {
    companyStatus: ctx.company.status,
    archivedAt: ctx.archivedAt,
  };
  const newState = {
    companyStatus: "blocked",
    archivedAt: new Date().toISOString(),
  };

  if (options?.dryRun) {
    return {
      success: true,
      dryRun: true,
      actionType: "client.archive_qa",
      message: "Dry-run: la cuenta QA quedaría archivada (sin borrar datos).",
      previousState,
      newState,
    };
  }

  const now = new Date().toISOString();

  const { error: companyError } = await getSupabase()
    .from("companies")
    .update({ status: "blocked" })
    .eq("id", ctx.company.id);

  if (companyError) wrapSupabaseError(companyError, "adminArchiveQaClient.status");

  const { error: flagError } = await getSupabase()
    .from("admin_data_audit_flags")
    .upsert(
      {
        entity_type: "company",
        entity_id: ctx.company.id,
        classification: ctx.classification || "QA_TEST",
        protected: false,
        archived_at: now,
        metadata: {
          archived_by_admin: true,
          archived_at: now,
          actor_email: actor.email,
        },
      },
      { onConflict: "entity_type,entity_id" },
    );

  if (flagError) wrapSupabaseError(flagError, "adminArchiveQaClient.flag");

  await recordAction(
    actor,
    ctx,
    "client.archive_qa",
    previousState,
    newState,
    {},
    meta,
  );

  return {
    success: true,
    actionType: "client.archive_qa",
    message: "Cuenta QA archivada (datos conservados).",
    previousState,
    newState,
  };
}
