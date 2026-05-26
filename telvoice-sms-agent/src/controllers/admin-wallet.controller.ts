import type { NextFunction, Request, Response } from "express";
import { listCompanies, findCompanyById } from "../services/companyService.js";
import {
  cancelPendingOrder,
  confirmOrderCredit,
  createOrder,
  getOrderWithDetails,
  listSmsOrders,
  markOrderPaid,
} from "../services/smsOrderService.js";
import { listTransactionsForOrder } from "../services/walletTransactionService.js";
import {
  ensureBillingForCreditedOrder,
  getBillingOrderSummary,
} from "../services/billingSyncService.js";
import { insertAuditLog } from "../services/auditLogService.js";
import {
  buildPricingCatalogSummary,
  createSmsPackage,
  listSmsPackages,
  toggleSmsPackage,
  updateSmsPackage,
  validateSmsPackageInput,
} from "../services/smsPackageService.js";
import {
  defaultCommercialMetadata,
  type PackageMetadata,
} from "../utils/package-metadata.js";
import { AppError } from "../utils/errors.js";
import {
  getCompanyBalance,
  listWalletsForAdmin,
  manualCreditWallet,
  manualDebitWallet,
} from "../services/smsWalletService.js";
import { listTransactionsByCompany } from "../services/walletTransactionService.js";
import { getCompanyRatePlan } from "../services/companyRatePlanService.js";
import { listSmsRatePlans } from "../services/smsRatePlanService.js";
import { listSmsProviders } from "../services/smsProviderService.js";
import { isMissingTableError } from "../utils/db-table.js";
import { renderWalletRatePlanBlock } from "../views/admin-ui/sections/superadmin-telco-pages.js";
import { validateUuidParam } from "../utils/validation.js";
import {
  renderSaOrderDetailPage,
  renderSaOrdersPage,
  renderSaPricingPage,
  renderSaWalletDetailPage,
  renderSaWalletsPage,
} from "../views/admin-ui/sections/superadmin-wallet-pages.js";

function flash(req: Request): { flash?: string; error?: string } {
  return {
    flash: typeof req.query.ok === "string" ? req.query.ok : undefined,
    error: typeof req.query.error === "string" ? req.query.error : undefined,
  };
}

function redirectWith(
  res: Response,
  path: string,
  params: { ok?: string; error?: string },
): void {
  const q = new URLSearchParams();
  if (params.ok) {
    q.set("ok", params.ok);
  }
  if (params.error) {
    q.set("error", params.error);
  }
  const qs = q.toString();
  res.redirect(qs ? `${path}?${qs}` : path);
}

function parseBoolForm(value: unknown): boolean {
  if (value === true || value === 1) {
    return true;
  }
  const s = String(value ?? "").toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes" || s === "activa";
}

function parseSmsPackageFormBody(body: Record<string, unknown>): {
  name: string;
  country: string;
  smsQuantity: number;
  totalPrice: number;
  unitPrice: number;
  currency: string;
  packageType: string;
  sortOrder: number;
  isActive: boolean;
  metadata: PackageMetadata;
} {
  const name = String(body.name ?? "").trim();
  const smsQuantity = Number(body.sms_quantity);
  const totalPrice = Number(body.total_price);
  const unitRaw = body.unit_price;
  const unitProvided =
    unitRaw !== undefined &&
    unitRaw !== null &&
    String(unitRaw).trim() !== "";
  const unitPrice = unitProvided ? Number(unitRaw) : undefined;

  const { unitPrice: resolvedUnit } = validateSmsPackageInput({
    name,
    smsQuantity,
    totalPrice,
    unitPrice,
  });

  return {
    name,
    country: String(body.country ?? "CL").trim() || "CL",
    smsQuantity,
    totalPrice,
    unitPrice: resolvedUnit,
    currency: String(body.currency ?? "CLP").trim() || "CLP",
    packageType: String(body.package_type ?? "prepaid").trim() || "prepaid",
    sortOrder: Number.isFinite(Number(body.sort_order))
      ? Number(body.sort_order)
      : 0,
    isActive: parseBoolForm(body.is_active),
    metadata: {
      customer_visible: parseBoolForm(
        body.customer_visible ?? defaultCommercialMetadata(name).customer_visible,
      ),
      channel:
        String(body.channel ?? defaultCommercialMetadata(name).channel ?? "web").trim() ||
        "web",
      segment:
        String(body.segment ?? defaultCommercialMetadata(name).segment ?? "standard").trim() ||
        "standard",
    },
  };
}

async function walletTablesReady(): Promise<boolean> {
  const { getSupabase } = await import("../database/supabaseClient.js");
  const { error } = await getSupabase().from("sms_packages").select("id").limit(1);
  if (!error) {
    return true;
  }
  if (isMissingTableError(error)) {
    return false;
  }
  return false;
}

export async function getSaPricingPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tablesReady = await walletTablesReady();
    const packages = tablesReady ? await listSmsPackages() : [];
    const catalogSummary = tablesReady
      ? buildPricingCatalogSummary(packages)
      : null;
    res.type("html").send(
      renderSaPricingPage({
        admin: req.adminUser!,
        packages,
        catalogSummary,
        tablesReady,
        useMock: !tablesReady,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postCreateSmsPackage(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!(await walletTablesReady())) {
      redirectWith(res, "/admin/pricing", {
        error:
          "La tabla sms_packages no existe. Aplica la migración 011 antes de crear bolsas.",
      });
      return;
    }
    const parsed = parseSmsPackageFormBody(
      (req.body ?? {}) as Record<string, unknown>,
    );
    await createSmsPackage({
      name: parsed.name,
      country: parsed.country,
      smsQuantity: parsed.smsQuantity,
      totalPrice: parsed.totalPrice,
      unitPrice: parsed.unitPrice,
      currency: parsed.currency,
      packageType: parsed.packageType,
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive,
      metadata: parsed.metadata,
    });
    redirectWith(res, "/admin/pricing", { ok: "Bolsa creada correctamente." });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "No se pudo crear la bolsa.";
    redirectWith(res, "/admin/pricing", { error: msg });
  }
}

export async function postUpdateSmsPackage(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!(await walletTablesReady())) {
      redirectWith(res, "/admin/pricing", {
        error:
          "La tabla sms_packages no existe. Aplica la migración 011_wallets_packages_orders.sql antes de editar bolsas.",
      });
      return;
    }

    const id = validateUuidParam(String(req.params.id), "id");
    const parsed = parseSmsPackageFormBody(
      (req.body ?? {}) as Record<string, unknown>,
    );

    const updated = await updateSmsPackage(id, {
      name: parsed.name,
      country: parsed.country,
      smsQuantity: parsed.smsQuantity,
      totalPrice: parsed.totalPrice,
      unitPrice: parsed.unitPrice,
      currency: parsed.currency,
      packageType: parsed.packageType,
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive,
      metadata: parsed.metadata,
    });

    await insertAuditLog({
      actorUserId: req.adminUser?.id,
      actorRole: req.adminUser?.role,
      action: "pricing.update",
      entityType: "sms_package",
      entityId: id,
      metadata: {
        name: updated.name,
        sms_quantity: updated.sms_quantity,
        total_price: updated.total_price,
      },
      ipAddress: req.ip,
    });

    redirectWith(res, "/admin/pricing", { ok: "Bolsa actualizada correctamente." });
  } catch (error) {
    const msg =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo actualizar la bolsa.";
    redirectWith(res, "/admin/pricing", { error: msg });
  }
}

export async function postToggleSmsPackage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id), "id");
    await toggleSmsPackage(id);
    redirectWith(res, "/admin/pricing", { ok: "Estado de bolsa actualizado." });
  } catch (error) {
    next(error);
  }
}

export async function getSaWalletsPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ready = await walletTablesReady();
    const companies = await listCompanies(200);
    const wallets = ready ? await listWalletsForAdmin() : [];
    res.type("html").send(
      renderSaWalletsPage({
        admin: req.adminUser!,
        wallets,
        companies,
        useMock: !ready || (wallets.length === 0 && companies.length === 0),
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getSaWalletDetailPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const companyId = validateUuidParam(String(req.params.companyId), "companyId");
    const company = await findCompanyById(companyId);
    if (!company) {
      res.redirect("/admin/wallets?error=Empresa%20no%20encontrada");
      return;
    }

    const balance = await getCompanyBalance(companyId);
    const transactions = await listTransactionsByCompany(companyId, 30);
    const [ratePlanAssignment, ratePlans, providers] = await Promise.all([
      getCompanyRatePlan(companyId),
      listSmsRatePlans(),
      listSmsProviders(),
    ]);
    const ratePlanHtml = renderWalletRatePlanBlock({
      companyId,
      assignment: ratePlanAssignment,
      ratePlans,
      providers,
    });

    const walletRow = {
      ...balance,
      companyName: company.name,
      lastTransactionAt: transactions[0]?.created_at ?? null,
    };

    res.type("html").send(
      renderSaWalletDetailPage({
        admin: req.adminUser!,
        company,
        balance: walletRow,
        transactions,
        ratePlanHtml,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postWalletCredit(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const companyId = validateUuidParam(String(req.params.companyId), "companyId");
    const smsAmount = Number(req.body?.sms_amount);
    const description = String(req.body?.description ?? "Carga manual Superadmin");
    await manualCreditWallet({
      companyId,
      smsAmount,
      description,
      actorUserId: req.adminUser?.id,
    });
    redirectWith(res, `/admin/wallets/${companyId}`, {
      ok: `Se acreditaron ${smsAmount} SMS.`,
    });
  } catch (error) {
    const companyId = req.params.companyId;
    const msg =
      error instanceof Error ? error.message : "Error al cargar saldo.";
    redirectWith(res, `/admin/wallets/${companyId}`, { error: msg });
  }
}

export async function postWalletDebit(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const companyId = validateUuidParam(String(req.params.companyId), "companyId");
    const smsAmount = Number(req.body?.sms_amount);
    const description = String(req.body?.description ?? "Ajuste manual Superadmin");
    await manualDebitWallet({
      companyId,
      smsAmount,
      description,
      actorUserId: req.adminUser?.id,
    });
    redirectWith(res, `/admin/wallets/${companyId}`, {
      ok: `Se descontaron ${smsAmount} SMS.`,
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Error al descontar saldo.";
    redirectWith(res, `/admin/wallets/${req.params.companyId}`, { error: msg });
  }
}

export async function postWalletQuickCredit(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const companyId = validateUuidParam(
      String(req.body?.company_id),
      "company_id",
    );
    const smsAmount = Number(req.body?.sms_amount);
    const description = String(req.body?.description ?? "Carga manual Superadmin");
    await manualCreditWallet({
      companyId,
      smsAmount,
      description,
      actorUserId: req.adminUser?.id,
    });
    redirectWith(res, "/admin/wallets", {
      ok: `Saldo cargado: ${smsAmount} SMS.`,
    });
  } catch (error) {
    redirectWith(res, "/admin/wallets", {
      error: error instanceof Error ? error.message : "Error",
    });
  }
}

export async function getSaOrdersPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ready = await walletTablesReady();
    const [orders, packages, companies] = ready
      ? await Promise.all([
          listSmsOrders(),
          listSmsPackages(true),
          listCompanies(200),
        ])
      : [[], [], await listCompanies(200)];

    res.type("html").send(
      renderSaOrdersPage({
        admin: req.adminUser!,
        orders,
        packages,
        companies,
        useMock: !ready || orders.length === 0,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postCreateOrder(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const companyId = validateUuidParam(String(req.body?.company_id), "company_id");
    const packageId = validateUuidParam(String(req.body?.package_id), "package_id");
    await createOrder({
      companyId,
      packageId,
      createdBy: req.adminUser?.id,
      paymentReference: String(req.body?.payment_reference ?? "") || undefined,
    });
    redirectWith(res, "/admin/orders", { ok: "Orden creada (pendiente de pago)." });
  } catch (error) {
    redirectWith(res, "/admin/orders", {
      error: error instanceof Error ? error.message : "Error",
    });
  }
}

export async function getSaOrderDetailPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orderId = validateUuidParam(String(req.params.id), "id");
    const order = await getOrderWithDetails(orderId);
    if (!order) {
      redirectWith(res, "/admin/orders", { error: "Orden no encontrada." });
      return;
    }
    const [transactions, company, billingSummary] = await Promise.all([
      listTransactionsForOrder(orderId),
      findCompanyById(order.company_id),
      getBillingOrderSummary(orderId),
    ]);
    res.type("html").send(
      renderSaOrderDetailPage({
        admin: req.adminUser!,
        order,
        transactions,
        company,
        billingSummary,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postMarkOrderPaid(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const orderId = validateUuidParam(String(req.params.id), "id");
    await markOrderPaid(orderId, req.adminUser?.id);
    redirectWith(res, `/admin/orders/${orderId}`, {
      ok: "Orden marcada como pagada.",
    });
  } catch (error) {
    redirectWith(res, `/admin/orders/${req.params.id}`, {
      error: error instanceof Error ? error.message : "Error",
    });
  }
}

export async function postCreditOrder(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const orderId = validateUuidParam(String(req.params.id), "id");
    const result = await confirmOrderCredit(orderId, req.adminUser?.id, {
      allowManualWithoutPaid: true,
    });
    const msg = result.alreadyCredited
      ? "La orden ya estaba acreditada (sin duplicar saldo)."
      : `Orden acreditada: ${result.order.sms_quantity} SMS.`;
    const syncResult = await ensureBillingForCreditedOrder(orderId, {
      source: "admin_manual_credit",
      actorType: "superadmin",
      actorId: req.adminUser?.id ?? null,
    });
    if (!syncResult.ok) {
      console.error(
        "[billing-sync] admin_manual_credit failed",
        orderId,
        syncResult.error ?? "unknown",
      );
    }
    redirectWith(res, `/admin/orders/${orderId}`, { ok: msg });
  } catch (error) {
    redirectWith(res, `/admin/orders/${req.params.id}`, {
      error: error instanceof Error ? error.message : "Error al acreditar",
    });
  }
}

export async function postSyncOrderBilling(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const orderId = validateUuidParam(String(req.params.id), "id");
    const result = await ensureBillingForCreditedOrder(orderId, {
      source: "admin_manual_sync",
      actorType: "superadmin",
      actorId: req.adminUser?.id ?? null,
    });
    if (!result.ok) {
      const errMsg =
        result.error === "order_not_paid_or_credited"
          ? "La orden debe estar pagada y acreditada para sincronizar Billing."
          : result.error === "order_not_found"
            ? "Orden no encontrada."
            : `No se pudo sincronizar Billing (${result.error ?? "error"}).`;
      redirectWith(res, `/admin/orders/${orderId}`, { error: errMsg });
      return;
    }
    const parts: string[] = [];
    if (result.invoiceCreated) {
      parts.push("comprobante creado");
    } else {
      parts.push("comprobante ya existía");
    }
    if (result.emailSent) {
      parts.push("email mock registrado");
    } else if (result.emailSkipped) {
      parts.push("email omitido (ya enviado)");
    } else if (result.emailFailed) {
      parts.push("email mock falló (revisar email de facturación)");
    }
    redirectWith(res, `/admin/orders/${orderId}`, {
      ok: `Billing sincronizado: ${parts.join(" · ")}.`,
    });
  } catch (error) {
    redirectWith(res, `/admin/orders/${req.params.id}`, {
      error: error instanceof Error ? error.message : "Error al sincronizar Billing",
    });
  }
}

export async function postCancelPendingOrder(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const orderId = validateUuidParam(String(req.params.id), "id");
    await cancelPendingOrder(orderId, req.adminUser?.id);
    redirectWith(res, `/admin/orders/${orderId}`, {
      ok: "Orden pendiente cancelada. No se modificó el saldo.",
    });
  } catch (error) {
    redirectWith(res, `/admin/orders/${req.params.id}`, {
      error: error instanceof Error ? error.message : "No se pudo cancelar",
    });
  }
}
