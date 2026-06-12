import type { NextFunction, Request, Response } from "express";
import { getBalanceByClientId } from "../services/balanceService.js";
import {
  applyCleanup,
  dryRunCleanup,
  generateReadOnlyAuditReport,
  getAuditSummary,
  getCleanupCandidates,
  getClientPurchaseAuditReport,
  getProtectedClientBundle,
} from "../services/adminDataAuditService.js";
import {
  getAuditGenerateJobStatus,
  startAuditGenerateJob,
} from "../services/adminDataAuditGenerateJob.js";
import { getTestClientBundle } from "../services/clientService.js";
import {
  renderAdminClientAuditPage,
  renderAdminDataCleanupPage,
} from "../views/admin-ui/sections/admin-data-audit-pages.js";

async function loadSmsBalance(): Promise<string | undefined> {
  try {
    const testClient = await getTestClientBundle();
    const balance = await getBalanceByClientId(testClient.client.id);
    return balance ? String(balance.available_units) : undefined;
  } catch {
    return undefined;
  }
}

function pageOpts(req: Request, smsBalance?: string) {
  return {
    admin: req.adminUser!,
    smsBalance,
    flash: typeof req.query.ok === "string" ? req.query.ok : undefined,
    error: typeof req.query.error === "string" ? req.query.error : undefined,
  };
}

function redirectCleanup(res: Response, result: { ok: boolean; message: string }): void {
  const q = result.ok ? "ok" : "error";
  res.redirect(`/admin/data-cleanup?${q}=${encodeURIComponent(result.message)}`);
}

export async function getAdminDataCleanupPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadSmsBalance();
    const showDryRun = req.query.dry_run === "1";
    const [summary, protectedBundle, candidates, dryRun, generationStatus] =
      await Promise.all([
      getAuditSummary(),
      getProtectedClientBundle("arturo.aguilar@talkchile.cl"),
      getCleanupCandidates(80),
      showDryRun ? dryRunCleanup() : Promise.resolve(null),
      Promise.resolve(getAuditGenerateJobStatus()),
    ]);

    res.type("html").send(
      renderAdminDataCleanupPage(pageOpts(req, smsBalance), {
        summary,
        protectedBundle,
        candidates,
        dryRun,
        generationStatus,
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function getAdminClientAuditPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadSmsBalance();
    const email =
      typeof req.query.email === "string" && req.query.email.trim()
        ? req.query.email.trim().toLowerCase()
        : "arturo.aguilar@talkchile.cl";
    const report = await getClientPurchaseAuditReport(email);
    res.type("html").send(renderAdminClientAuditPage(pageOpts(req, smsBalance), report));
  } catch (err) {
    next(err);
  }
}

export async function postAdminDataCleanupGenerate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { started, message } = startAuditGenerateJob(req.adminUser?.email);
    redirectCleanup(res, {
      ok: started,
      message: started
        ? `${message} Refresca la página en unos minutos para ver los conteos actualizados.`
        : message,
    });
  } catch (err) {
    next(err);
  }
}

export async function postAdminDataCleanupDryRun(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dry = await dryRunCleanup();
    res.redirect(
      `/admin/data-cleanup?dry_run=1&ok=${encodeURIComponent(`Dry-run: ${dry.archiveCandidates.length} archivo, ${dry.hardDeleteCandidates.length} hard delete candidatos.`)}`,
    );
  } catch (err) {
    next(err);
  }
}

export async function postAdminDataCleanupApply(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  try {
    const confirmation = String(req.body?.confirmation ?? "");
    const result = await applyCleanup({
      confirmation,
      actorEmail: req.adminUser?.email ?? "superadmin",
    });
    const msg = `Limpieza aplicada: ${result.archived} archivados, ${result.hardDeleted} eliminados, ${result.skippedProtected} protegidos omitidos.${result.errors.length ? ` Errores: ${result.errors.length}` : ""}`;
    redirectCleanup(res, { ok: result.errors.length === 0, message: msg });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al aplicar limpieza";
    redirectCleanup(res, { ok: false, message });
  }
}

/** JSON read-only report (CLI / API interna). */
export async function getAdminDataAuditReportJson(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const [report, generationStatus] = await Promise.all([
      generateReadOnlyAuditReport(),
      Promise.resolve(getAuditGenerateJobStatus()),
    ]);
    res.json({ ...report, generationStatus });
  } catch (err) {
    next(err);
  }
}
