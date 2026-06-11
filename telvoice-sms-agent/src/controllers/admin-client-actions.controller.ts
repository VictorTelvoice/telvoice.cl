import type { NextFunction, Request, Response } from "express";
import { requireSuperadmin, subjectFromAdmin } from "../auth/authorization.js";
import { getCurrentUserProfile } from "../services/userProfileService.js";
import {
  adminArchiveQaClient,
  adminReactivateClientSending,
  adminResendReceiptEmail,
  adminResendWelcomeEmail,
  adminSuspendClientSending,
  adminUpdateClientProfile,
  loadClientActionContext,
} from "../services/adminClientActionsService.js";
import { validateUuidParam } from "../utils/validation.js";
import { AppError } from "../utils/errors.js";

function redirectClientAction(
  res: Response,
  companyId: string,
  result: { success: boolean; message: string; dryRun?: boolean },
): void {
  const key = result.success ? "ok" : "error";
  const prefix = result.dryRun ? "[Dry-run] " : "";
  res.redirect(
    302,
    `/admin/clients/${companyId}?${key}=${encodeURIComponent(prefix + result.message)}`,
  );
}

function actionMeta(req: Request) {
  return {
    ipAddress: req.ip ?? req.socket?.remoteAddress ?? null,
    userAgent: req.get("user-agent") ?? null,
  };
}

function actorFromRequest(req: Request) {
  const admin = req.adminUser!;
  return {
    userId: admin.id,
    email: admin.email,
    role: admin.role,
  };
}

function parseDryRun(body: Record<string, unknown>): boolean {
  return body.dry_run === "1" || body.dryRun === "true" || body.dry_run === "on";
}

function parseProtectedOverride(body: Record<string, unknown>): boolean {
  return (
    body.protected_override === "1" ||
    body.protectedOverride === "true" ||
    body.protected_override === "on"
  );
}

function parseTestMode(body: Record<string, unknown>): boolean {
  return body.test_mode === "1" || body.testMode === "true" || body.test_mode === "on";
}

async function assertSuperAdminActor(req: Request): Promise<void> {
  const admin = req.adminUser;
  if (!admin) {
    throw new AppError("Sesión admin requerida.", 401);
  }
  const profile = req.userProfile ?? (await getCurrentUserProfile(admin));
  const subject = subjectFromAdmin(admin, profile);
  if (!requireSuperadmin(subject)) {
    throw new AppError("Solo superadmin puede ejecutar esta acción.", 403);
  }
}

async function withClientContext(
  req: Request,
  next: NextFunction,
  handler: (
    companyId: string,
    ctx: NonNullable<Awaited<ReturnType<typeof loadClientActionContext>>>,
  ) => Promise<void>,
): Promise<void> {
  try {
    await assertSuperAdminActor(req);
    const companyId = validateUuidParam(String(req.params.companyId), "companyId");
    const ctx = await loadClientActionContext(companyId);
    if (!ctx) {
      throw new AppError("Cliente no encontrado.", 404);
    }
    await handler(companyId, ctx);
  } catch (e) {
    next(e);
  }
}

export async function postAdminClientUpdateProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withClientContext(req, next, async (companyId, ctx) => {
    const body = req.body as Record<string, unknown>;
    const result = await adminUpdateClientProfile(
      ctx,
      actorFromRequest(req),
      {
        name: typeof body.name === "string" ? body.name : undefined,
        billing_email:
          typeof body.billing_email === "string" ? body.billing_email : undefined,
        country: typeof body.country === "string" ? body.country : undefined,
        contact_name:
          typeof body.contact_name === "string" ? body.contact_name : undefined,
        contact_phone:
          typeof body.contact_phone === "string" ? body.contact_phone : undefined,
        legal_name: typeof body.legal_name === "string" ? body.legal_name : undefined,
      },
      actionMeta(req),
      { dryRun: parseDryRun(body) },
    );
    redirectClientAction(res, companyId, result);
  });
}

export async function postAdminClientSuspendSending(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withClientContext(req, next, async (companyId, ctx) => {
    const body = req.body as Record<string, unknown>;
    const result = await adminSuspendClientSending(
      ctx,
      actorFromRequest(req),
      String(body.confirmation ?? ""),
      actionMeta(req),
      {
        dryRun: parseDryRun(body),
        protectedOverride: parseProtectedOverride(body),
      },
    );
    redirectClientAction(res, companyId, result);
  });
}

export async function postAdminClientReactivateSending(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withClientContext(req, next, async (companyId, ctx) => {
    const body = req.body as Record<string, unknown>;
    const result = await adminReactivateClientSending(
      ctx,
      actorFromRequest(req),
      String(body.confirmation ?? ""),
      actionMeta(req),
      {
        dryRun: parseDryRun(body),
        protectedOverride: parseProtectedOverride(body),
      },
    );
    redirectClientAction(res, companyId, result);
  });
}

export async function postAdminClientResendWelcome(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withClientContext(req, next, async (companyId, ctx) => {
    const body = req.body as Record<string, unknown>;
    const result = await adminResendWelcomeEmail(
      ctx,
      actorFromRequest(req),
      String(body.confirmation ?? ""),
      actionMeta(req),
      {
        dryRun: parseDryRun(body),
        testMode: parseTestMode(body),
      },
    );
    redirectClientAction(res, companyId, result);
  });
}

export async function postAdminClientResendReceipt(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withClientContext(req, next, async (companyId, ctx) => {
    const body = req.body as Record<string, unknown>;
    const invoiceId = String(body.invoice_id ?? body.invoiceId ?? "").trim();
    const result = await adminResendReceiptEmail(
      ctx,
      actorFromRequest(req),
      invoiceId,
      String(body.confirmation ?? ""),
      actionMeta(req),
      { dryRun: parseDryRun(body) },
    );
    redirectClientAction(res, companyId, result);
  });
}

export async function postAdminClientArchiveQa(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withClientContext(req, next, async (companyId, ctx) => {
    const body = req.body as Record<string, unknown>;
    const result = await adminArchiveQaClient(
      ctx,
      actorFromRequest(req),
      String(body.confirmation ?? ""),
      actionMeta(req),
      { dryRun: parseDryRun(body) },
    );
    redirectClientAction(res, companyId, result);
  });
}
