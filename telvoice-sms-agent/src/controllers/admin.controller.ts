import type { NextFunction, Request, Response } from "express";
import { getBootstrapStatus } from "../config/bootstrap-status.js";
import { buildDlrCallbackUrl, env, isProduction } from "../config/env.js";
import {
  canAccessAdminPanel,
  canAccessClientPanel,
} from "../types/roles.js";
import { subjectFromAdmin } from "../auth/authorization.js";
import {
  authenticateAdminForAdminPanel,
  getAdminJwtCookieName,
  getClientJwtCookieName,
  getJwtCookieOptions,
  isAdminSignupOpen,
  registerGmailAdmin,
  signAdminToken,
} from "../services/adminAuthService.js";
import {
  ensureInternalProfileForAdmin,
  getCurrentUserProfile,
} from "../services/userProfileService.js";
import { getBalanceByClientId } from "../services/balanceService.js";
import { listTelegramUsersByClientId } from "../services/clientTelegramUserService.js";
import { getTestClientBundle } from "../services/clientService.js";
import { getClientById } from "../services/clientService.js";
import {
  fetchAsmscBalance,
} from "../services/sms.service.js";
import {
  getMessageById,
  getSmsMessageStats,
  listDlrEventsByMessageId,
  listRecentMessages,
} from "../services/smsMessageService.js";
import { parseAsmscBalanceSummary } from "../utils/asmsc-balance-summary.js";
import {
  renderAuthLoginPage,
  renderAuthRegisterPage,
} from "../views/admin-ui/auth-pages.js";
import {
  renderDashboardPage,
  renderInboxPageWrapper,
  renderMessageDetailPage,
  renderSettingsPage,
  renderTestClientPage,
} from "../views/admin-pages.js";
import { getAdminDashboardSnapshot } from "../services/adminDashboardService.js";
import { getConfiguredDlrWebhookUrl } from "../utils/dlr-callback.js";
import { validateUuidParam } from "../utils/validation.js";
import {
  adminLoginPath,
  isAdminPanelHost,
} from "../utils/panel-host.js";

export async function getLoginPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const error = typeof req.query.error === "string" ? req.query.error : undefined;
    const successMessage =
      typeof req.query.registered === "string"
        ? "Cuenta creada correctamente. Inicia sesión."
        : undefined;
    const nextPath =
      typeof req.query.next === "string" ? req.query.next : "/admin";
    const signupAvailable = await isAdminSignupOpen();

    res
      .type("html")
      .send(
        renderAuthLoginPage({
          error,
          next: nextPath,
          signupAvailable,
          successMessage,
          loginActionPath: adminLoginPath(req),
          brandSubtitle: isAdminPanelHost(req)
            ? "Panel administrativo · admin.telvoice.cl"
            : "Panel administrativo · agent.telvoice.cl",
        }),
      );
  } catch (error) {
    next(error);
  }
}

export async function getRegisterPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const open = await isAdminSignupOpen();
    if (!open) {
      res.redirect(
        `${adminLoginPath(req)}?error=${encodeURIComponent("Registro no disponible.")}`,
      );
      return;
    }

    const error = typeof req.query.error === "string" ? req.query.error : undefined;
    const nextPath =
      typeof req.query.next === "string" ? req.query.next : "/admin";

    res.type("html").send(renderAuthRegisterPage({ error, next: nextPath }));
  } catch (error) {
    next(error);
  }
}

export async function postRegister(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const open = await isAdminSignupOpen();
    const nextPath = sanitizeNextPath(String(req.body?.next ?? "/admin"), req);

    if (!open) {
      res.redirect(
        `${adminLoginPath(req)}?error=${encodeURIComponent("Registro no disponible.")}`,
      );
      return;
    }

    const email = String(req.body?.email ?? "").trim();
    const password = String(req.body?.password ?? "");
    const passwordConfirm = String(req.body?.password_confirm ?? "");
    const name = String(req.body?.name ?? "").trim();

    if (password !== passwordConfirm) {
      res.redirect(
        `/admin/register?error=${encodeURIComponent("Las contraseñas no coinciden.")}&next=${encodeURIComponent(nextPath)}`,
      );
      return;
    }

    const result = await registerGmailAdmin({ email, password, name });
    if ("error" in result) {
      res.redirect(
        `/admin/register?error=${encodeURIComponent(result.error)}&next=${encodeURIComponent(nextPath)}`,
      );
      return;
    }

    const regProfile = await getCurrentUserProfile(result.user);
    setSessionCookies(res, result.user, regProfile);
    res.redirect(
      resolvePostAuthRedirect(
        subjectFromAdmin(result.user, regProfile).role,
        nextPath,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function postLogin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const email = String(req.body?.email ?? "").trim();
    const password = String(req.body?.password ?? "");
    const nextPath = sanitizeNextPath(String(req.body?.next ?? "/admin"), req);

    if (!email || !password) {
      res.redirect(
        `${adminLoginPath(req)}?error=${encodeURIComponent("Correo y contraseña son obligatorios.")}&next=${encodeURIComponent(nextPath)}`,
      );
      return;
    }

    const admin = await authenticateAdminForAdminPanel(email, password);
    if (!admin) {
      res.redirect(
        `${adminLoginPath(req)}?error=${encodeURIComponent("Credenciales inválidas.")}&next=${encodeURIComponent(nextPath)}`,
      );
      return;
    }

    await ensureInternalProfileForAdmin(admin);
    const profile = await getCurrentUserProfile(admin);
    const sessionUser = {
      ...admin,
      role: subjectFromAdmin(admin, profile).role,
      companyId: profile?.companyId ?? admin.companyId,
    };

    if (
      isAdminPanelHost(req) &&
      canAccessClientPanel(sessionUser.role) &&
      !canAccessAdminPanel(sessionUser.role)
    ) {
      res.redirect(
        `${adminLoginPath(req)}?error=${encodeURIComponent("Esta cuenta es del panel cliente. Ingresa en agent.telvoice.cl.")}&next=${encodeURIComponent(nextPath)}`,
      );
      return;
    }

    setSessionCookies(res, sessionUser, profile);
    res.redirect(resolvePostAuthRedirect(sessionUser.role, nextPath));
  } catch (error) {
    next(error);
  }
}

function setSessionCookies(
  res: Response,
  admin: { id: string; email: string; name: string; role: string; companyId?: string | null },
  profile: Awaited<ReturnType<typeof getCurrentUserProfile>>,
): void {
  const subject = subjectFromAdmin(admin, profile);
  const token = signAdminToken({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: subject.role,
    companyId: subject.companyId ?? undefined,
  });
  const opts = getJwtCookieOptions();
  const cookiePath = { path: "/" };

  if (canAccessAdminPanel(subject.role)) {
    res.cookie(getAdminJwtCookieName(), token, opts);
    res.clearCookie(getClientJwtCookieName(), cookiePath);
    return;
  }

  if (canAccessClientPanel(subject.role)) {
    res.cookie(getClientJwtCookieName(), token, opts);
    res.clearCookie(getAdminJwtCookieName(), cookiePath);
    return;
  }

  res.cookie(getAdminJwtCookieName(), token, opts);
}

function resolvePostAuthRedirect(role: string, nextPath: string): string {
  if (canAccessClientPanel(role) && !canAccessAdminPanel(role)) {
    const appPath = nextPath.startsWith("/app") ? nextPath : "/app";
    return appPath;
  }
  if (canAccessAdminPanel(role) && nextPath.startsWith("/app")) {
    return "/admin";
  }
  return nextPath;
}

export function postLogout(req: Request, res: Response): void {
  const opts = { path: "/" };
  res.clearCookie(getAdminJwtCookieName(), opts);
  res.redirect(adminLoginPath(req));
}

/** Cierra solo la sesión del panel cliente (no afecta `/admin`). */
export function postClientLogout(_req: Request, res: Response): void {
  const opts = { path: "/" };
  res.clearCookie(getClientJwtCookieName(), opts);
  res.redirect("/login");
}

export async function getDashboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = req.adminUser!;
    const bootstrap = getBootstrapStatus();
    let testClient = null;
    let balance = null;
    let messages: Awaited<ReturnType<typeof listRecentMessages>> = [];
    let stats: Awaited<ReturnType<typeof getSmsMessageStats>> | null = null;
    let asmscBalance = parseAsmscBalanceSummary(null);
    let dbLoadError: string | null = bootstrap.warning;

    if (env.supabase.url && env.supabase.serviceRoleKey && !bootstrap.pgrestSchemaCacheIssue) {
      try {
        testClient = await getTestClientBundle();
        balance = await getBalanceByClientId(testClient.client.id);
        [messages, stats] = await Promise.all([
          listRecentMessages(),
          getSmsMessageStats(),
        ]);
        dbLoadError = null;
      } catch (dbError) {
        const msg =
          dbError instanceof Error ? dbError.message : "Error cargando datos";
        dbLoadError = dbLoadError ?? msg;
        console.error("[admin] Error cargando datos:", dbError);
      }
    }

    if (env.asmsc.apiId && env.asmsc.apiPassword) {
      try {
        const provider = await fetchAsmscBalance();
        asmscBalance = parseAsmscBalanceSummary(provider);
      } catch (balanceError) {
        asmscBalance = parseAsmscBalanceSummary(null, balanceError);
      }
    }

    let successMessage: string | null = null;
    if (typeof req.query.credited === "string" && req.query.credited) {
      const units = req.query.credited;
      const country =
        typeof req.query.country === "string" ? req.query.country : "CL";
      const available =
        typeof req.query.available === "string" ? req.query.available : "";
      successMessage = `Crédito aplicado: +${units} unidades (${country}). Disponible: ${available || "ver balance abajo"}.`;
    }

    let dashboardSnapshot = null;
    if (env.supabase.url && env.supabase.serviceRoleKey && !bootstrap.pgrestSchemaCacheIssue) {
      try {
        dashboardSnapshot = await getAdminDashboardSnapshot();
      } catch (dashErr) {
        console.error("[admin] dashboard snapshot failed:", dashErr);
        dbLoadError = dbLoadError ?? (dashErr instanceof Error ? dashErr.message : "Error métricas dashboard");
      }
    }

    res.type("html").send(
      renderDashboardPage({
        admin,
        serviceOk: !bootstrap.pgrestSchemaCacheIssue,
        testClient,
        balance,
        messages,
        stats,
        asmscBalance,
        dashboardSnapshot,
        supabaseConfigured: Boolean(
          env.supabase.url && env.supabase.serviceRoleKey,
        ),
        configWarning: dbLoadError,
        successMessage,
        dlrWebhookUrl: buildDlrCallbackUrl() ?? getConfiguredDlrWebhookUrl(),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getInboxPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = req.adminUser!;
    const bootstrap = getBootstrapStatus();
    let messages: Awaited<ReturnType<typeof listRecentMessages>> = [];
    let balance = null;

    if (env.supabase.url && env.supabase.serviceRoleKey && !bootstrap.pgrestSchemaCacheIssue) {
      try {
        const testClient = await getTestClientBundle();
        balance = await getBalanceByClientId(testClient.client.id);
        messages = await listRecentMessages();
      } catch (dbError) {
        console.error("[admin] Error cargando bandeja:", dbError);
      }
    }

    res.type("html").send(
      renderInboxPageWrapper({
        admin,
        messages,
        smsBalance: balance ? String(balance.available_units) : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getMessageDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const message = await getMessageById(id);
    const dlrEvents = await listDlrEventsByMessageId(id);
    const client = await getClientById(message.client_id);
    const simulatedParam =
      typeof req.query.simulated === "string" ? req.query.simulated : null;
    const simulated =
      simulatedParam === "delivered" || simulatedParam === "failed"
        ? simulatedParam
        : simulatedParam === "1"
          ? "delivered"
          : null;

    res.type("html").send(
      renderMessageDetailPage({
        admin: req.adminUser!,
        message,
        clientName: client?.company_name ?? message.client_id,
        dlrEvents,
        showSimulateDlr: !isProduction(),
        simulated,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getTestClientPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const bundle = await getTestClientBundle();
    const balance = await getBalanceByClientId(bundle.client.id);
    const telegramUsers = await listTelegramUsersByClientId(bundle.client.id);
    const success =
      typeof req.query.success === "string" ? req.query.success : undefined;
    const telegramTestResult =
      typeof req.query.telegram_test_result === "string"
        ? req.query.telegram_test_result
        : undefined;
    const telegramTestError =
      typeof req.query.telegram_test_error === "string"
        ? req.query.telegram_test_error
        : undefined;

    res.type("html").send(
      renderTestClientPage({
        admin: req.adminUser!,
        bundle,
        balance,
        telegramUsers,
        successMessage: success,
        telegramTestResult,
        telegramTestError,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export function getSettingsPage(req: Request, res: Response): void {
  res.type("html").send(
    renderSettingsPage({
      admin: req.adminUser!,
    }),
  );
}

function sanitizeNextPath(path: string, req: Request): string {
  if (isAdminPanelHost(req)) {
    if (path.startsWith("/admin") && !path.startsWith("//")) {
      return path;
    }
    return "/admin";
  }
  if (
    (path.startsWith("/admin") || path.startsWith("/app")) &&
    !path.startsWith("//")
  ) {
    return path;
  }
  return "/admin";
}
