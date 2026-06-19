import type { NextFunction, Request, Response } from "express";
import { subjectFromAdmin, requireSuperadmin } from "../auth/authorization.js";
import { createQuickQuote } from "../services/commercialQuoteService.js";
import {
  getAllSmsPricingTiers,
  getActiveSmsPricingTiers,
} from "../services/pricing/smsPricingService.js";
import { ValidationError } from "../utils/errors.js";
import { validateUuidParam } from "../utils/validation.js";
import {
  renderCalculatorTestPage,
  renderLeadsListPage,
  renderProductFormPage,
  renderProductsListPage,
} from "../views/admin-pages.js";
import {
  createSmsProduct,
  getSmsProductById,
  listAllSmsProducts,
  updateSmsProduct,
} from "../services/smsProductService.js";
import {
  listPublicLeads,
  updatePublicLeadStatus,
} from "../services/publicLeadService.js";
import type { PublicLeadStatus } from "../types/commercial.js";

function parseProductForm(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Datos del formulario inválidos.");
  }
  const r = body as Record<string, unknown>;
  const product_name = String(r.product_name ?? "").trim();
  const sms_quantity = Number(r.sms_quantity);
  const price_amount = Number(r.price_amount);
  const unit_price = Number(r.unit_price);

  if (!product_name) {
    throw new ValidationError("product_name es obligatorio.");
  }
  if (!Number.isFinite(sms_quantity) || sms_quantity < 1) {
    throw new ValidationError("sms_quantity inválido.");
  }
  if (!Number.isFinite(price_amount) || price_amount < 0) {
    throw new ValidationError("price_amount inválido.");
  }
  if (!Number.isFinite(unit_price) || unit_price < 0) {
    throw new ValidationError("unit_price inválido.");
  }

  return {
    country_code: String(r.country_code ?? "CL").trim().toUpperCase(),
    country_name: String(r.country_name ?? "Chile").trim(),
    product_name,
    description: String(r.description ?? "").trim() || null,
    sms_quantity: Math.round(sms_quantity),
    currency: String(r.currency ?? "CLP").trim(),
    price_amount: Math.round(price_amount),
    unit_price,
    checkout_url: String(r.checkout_url ?? "").trim() || null,
    is_featured: r.is_featured === "1" || r.is_featured === "on",
    is_active: r.is_active === "1" || r.is_active === "on",
    product_type:
      r.product_type === "custom_quote" ? "custom_quote" as const : "sms_bundle" as const,
  };
}

export async function getProductsList(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const products = await listAllSmsProducts();
    res.type("html").send(
      renderProductsListPage({
        admin: req.adminUser!,
        products,
        successMessage:
          typeof req.query.success === "string" ? req.query.success : undefined,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export function getProductNewForm(req: Request, res: Response): void {
  res.type("html").send(
    renderProductFormPage({
      admin: req.adminUser!,
      mode: "create",
      error: typeof req.query.error === "string" ? req.query.error : undefined,
    }),
  );
}

export async function postCreateProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await createSmsProduct(parseProductForm(req.body));
    res.redirect(
      `/admin/products?success=${encodeURIComponent("Producto creado.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      res.type("html").send(
        renderProductFormPage({
          admin: req.adminUser!,
          mode: "create",
          error: error.message,
          values: req.body as Record<string, unknown>,
        }),
      );
      return;
    }
    next(error);
  }
}

export async function getProductEditForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const product = await getSmsProductById(id);
    res.type("html").send(
      renderProductFormPage({
        admin: req.adminUser!,
        mode: "edit",
        product,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postEditProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await updateSmsProduct(id, parseProductForm(req.body));
    res.redirect(
      `/admin/products?success=${encodeURIComponent("Producto actualizado.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      try {
        const product = await getSmsProductById(
          validateUuidParam(String(req.params.id ?? ""), "id"),
        );
        res.type("html").send(
          renderProductFormPage({
            admin: req.adminUser!,
            mode: "edit",
            product,
            error: error.message,
            values: req.body as Record<string, unknown>,
          }),
        );
        return;
      } catch {
        /* fall through */
      }
    }
    next(error);
  }
}

export async function getLeadsList(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const status =
      typeof req.query.status === "string"
        ? (req.query.status as PublicLeadStatus)
        : undefined;
    const leads = await listPublicLeads({ status, limit: 200 });
    res.type("html").send(
      renderLeadsListPage({
        admin: req.adminUser!,
        leads,
        filterStatus: status,
        successMessage:
          typeof req.query.success === "string" ? req.query.success : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getCalculatorTest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tiers = await getActiveSmsPricingTiers("CL");
    const allTiers = await getAllSmsPricingTiers("CL");
    const subject = subjectFromAdmin(req.adminUser!, req.userProfile);
    const isSuperAdmin = requireSuperadmin(subject);
    const quantityRaw =
      typeof req.query.quantity === "string"
        ? Number(req.query.quantity)
        : undefined;

    let quote = null;
    if (quantityRaw !== undefined && Number.isFinite(quantityRaw) && quantityRaw > 0) {
      quote = await createQuickQuote(quantityRaw, "CL");
    }

    res.type("html").send(
      renderCalculatorTestPage({
        admin: req.adminUser!,
        tiers,
        allTiers,
        isSuperAdmin,
        quantity: quantityRaw,
        quote,
        successMessage:
          typeof req.query.success === "string" ? req.query.success : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postCalculatorTest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const quantity = Number((req.body as Record<string, unknown>).quantity);
    if (!Number.isFinite(quantity) || quantity < 1) {
      throw new ValidationError("Indica una cantidad válida de SMS.");
    }
    const tiers = await getActiveSmsPricingTiers("CL");
    const allTiers = await getAllSmsPricingTiers("CL");
    const subject = subjectFromAdmin(req.adminUser!, req.userProfile);
    const isSuperAdmin = requireSuperadmin(subject);
    const quote = await createQuickQuote(quantity, "CL");
    res.type("html").send(
      renderCalculatorTestPage({
        admin: req.adminUser!,
        tiers,
        allTiers,
        isSuperAdmin,
        quantity,
        quote,
      }),
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const tiers = await getActiveSmsPricingTiers("CL");
      const allTiers = await getAllSmsPricingTiers("CL");
      const subject = subjectFromAdmin(req.adminUser!, req.userProfile);
      const isSuperAdmin = requireSuperadmin(subject);
      res.type("html").send(
        renderCalculatorTestPage({
          admin: req.adminUser!,
          tiers,
          allTiers,
          isSuperAdmin,
          error: error.message,
        }),
      );
      return;
    }
    next(error);
  }
}

export async function postUpdateLeadStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const status = String((req.body as Record<string, unknown>).status ?? "");
    if (!["new", "contacted", "closed"].includes(status)) {
      throw new ValidationError("status inválido.");
    }
    await updatePublicLeadStatus(id, status as PublicLeadStatus);
    res.redirect(
      `/admin/leads?success=${encodeURIComponent("Estado del lead actualizado.")}`,
    );
  } catch (error) {
    next(error);
  }
}
