import type { NextFunction, Request, Response } from "express";
import { canOperateClientPanel } from "../types/roles.js";
import { isMercadoPagoConfigured } from "../config/env.js";
import { validateUuidParam } from "../utils/validation.js";
import {
  assertOrderBelongsToCompany,
  resolveMercadoPagoInitPoint,
  startClientPanelMercadoPagoCheckout,
} from "../services/mercadoPagoClientPanelService.js";
import type { AppPageContext } from "../views/app-ui/app-page-wrap.js";
import { renderNoCompanyPage } from "../views/app-ui/app-page-wrap.js";
import { wrapAppPage } from "../views/app-ui/app-page-wrap.js";
import { renderPageHeader } from "../views/admin-ui/page-kit.js";
import { escapeHtml } from "../utils/html.js";
import { findCompanyById } from "../services/companyService.js";
import { getCompanyBalance } from "../services/smsWalletService.js";
async function buildAppContext(req: Request): Promise<AppPageContext | null> {
  const profile = req.userProfile;
  if (!profile?.companyId) {
    return null;
  }
  const company = await findCompanyById(profile.companyId);
  if (!company) {
    return null;
  }
  const balance = await getCompanyBalance(profile.companyId);
  return { profile, company, balance };
}

export async function postAppBuySmsMercadoPago(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const profile = req.userProfile;
    if (!profile?.companyId) {
      res.redirect("/app/buy-sms?error=Empresa%20no%20asociada");
      return;
    }
    if (!canOperateClientPanel(profile.role)) {
      res.redirect("/app/buy-sms?error=No%20tienes%20permiso%20para%20comprar");
      return;
    }
    if (!isMercadoPagoConfigured()) {
      res.redirect(
        "/app/buy-sms?error=MercadoPago%20no%20est%C3%A1%20disponible.%20Usa%20pago%20manual.",
      );
      return;
    }

    const packageId = validateUuidParam(
      String(req.body?.package_id ?? ""),
      "package_id",
    );

    const checkout = await startClientPanelMercadoPagoCheckout({
      companyId: profile.companyId,
      packageId,
      createdBy: profile.profileId ?? profile.adminUserId ?? undefined,
      payer: {
        email: profile.email,
        name: profile.fullName,
        phone: null,
      },
    });

    res.redirect(checkout.checkoutUrl);
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "No se pudo iniciar el pago";
    res.redirect(`/app/buy-sms?error=${encodeURIComponent(msg)}`);
  }
}

function renderMpReturnPage(
  ctx: AppPageContext,
  kind: "success" | "failure" | "pending",
  orderId: string | null,
): string {
  const titles = {
    success: "Pago recibido",
    failure: "Pago no completado",
    pending: "Pago pendiente",
  };
  const texts = {
    success:
      "Mercado Pago registró tu pago. Si fue aprobado, los SMS se acreditarán en tu saldo en breve. Esta pantalla solo informa; la acreditación la confirma el sistema automáticamente.",
    failure:
      "El pago no se completó. Puedes reintentar desde Mis órdenes o contactar a soporte.",
    pending:
      "Tu pago está pendiente de confirmación. Revisa Mis órdenes en unos minutos.",
  };

  const orderLink = orderId
    ? `<p><a href="/app/orders/${escapeHtml(orderId)}">Ver detalle de la orden</a></p>`
    : "";

  const body = `
    ${renderPageHeader({ title: titles[kind], subtitle: "Mercado Pago · Panel cliente" })}
    <section class="tv-panel">
      <div class="tv-panel__body">
        <p>${escapeHtml(texts[kind])}</p>
        ${orderLink}
        <p class="field-hint">Referencia: ${escapeHtml(orderId ?? "—")}</p>
      </div>
    </section>`;

  return wrapAppPage(ctx, "orders", titles[kind], body);
}

export async function getAppMercadoPagoReturn(
  req: Request,
  res: Response,
  next: NextFunction,
  kind: "success" | "failure" | "pending",
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      const profile = req.userProfile;
      if (!profile) {
        res.redirect("/admin/login?next=%2Fapp");
        return;
      }
      res.type("html").send(renderNoCompanyPage(profile));
      return;
    }

    const orderId =
      typeof req.query.external_reference === "string"
        ? req.query.external_reference.trim()
        : null;

    res.type("html").send(renderMpReturnPage(ctx, kind, orderId));
  } catch (error) {
    next(error);
  }
}

export async function getAppMercadoPagoContinuePay(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const profile = req.userProfile;
    if (!profile?.companyId) {
      res.redirect("/app/orders");
      return;
    }
    const orderId = validateUuidParam(String(req.params.id), "id");
    const order = await assertOrderBelongsToCompany(orderId, profile.companyId);
    const url = resolveMercadoPagoInitPoint(order);
    if (!url || order.payment_status !== "pending") {
      res.redirect(`/app/orders/${orderId}`);
      return;
    }
    res.redirect(url);
  } catch {
    res.redirect("/app/orders");
  }
}
