import type { NextFunction, Request, Response } from "express";
import { renderAdminEmailLogsPage } from "../views/admin-ui/sections/admin-email-logs-pages.js";
import { sendPostPurchaseNotifications } from "../services/postPurchaseNotificationService.js";
import {
  listEmailLogs,
  listEmailLogsForOrder,
  sendInvoiceReceiptEmail,
  sendPaymentReceivedClaimEmail,
  sendWelcomeAndSmsCreditedEmail,
} from "../services/transactionalEmailService.js";
import { getInvoiceByOrderId } from "../services/billingInvoiceService.js";
import { getOrderById } from "../services/smsOrderService.js";
import { validateUuidParam } from "../utils/validation.js";
import { getSupabase } from "../database/supabaseClient.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

function flash(req: Request): { ok?: string; error?: string } {
  return {
    ok: typeof req.query.ok === "string" ? req.query.ok : undefined,
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

export async function getAdminEmailLogsPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const status =
      typeof req.query.status === "string" ? req.query.status.trim() : undefined;
    const template =
      typeof req.query.template === "string" ? req.query.template.trim() : undefined;

    const logs = await listEmailLogs({
      limit: 200,
      status: status || undefined,
      templateKey: template || undefined,
    });

    res.type("html").send(
      renderAdminEmailLogsPage({
        admin: req.adminUser!,
        logs,
        filterStatus: status,
        filterTemplate: template,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postResendEmailLog(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const logId = validateUuidParam(String(req.params.id), "id");
    const { data, error } = await getSupabase()
      .from("email_logs")
      .select("*")
      .eq("id", logId)
      .maybeSingle();
    if (error) {
      wrapSupabaseError(error, "postResendEmailLog");
    }
    if (!data) {
      redirectWith(res, "/admin/email-logs", { error: "Registro no encontrado." });
      return;
    }

    const log = data as {
      template_key: string;
      order_id: string | null;
      invoice_id: string | null;
    };

    if (log.template_key === "payment_received_pending_claim" && log.order_id) {
      await sendPaymentReceivedClaimEmail(log.order_id, { skipIdempotency: true });
    } else if (log.template_key === "welcome_sms_credited" && log.order_id) {
      await sendWelcomeAndSmsCreditedEmail(log.order_id, { skipIdempotency: true });
    } else if (log.template_key === "invoice_receipt" && log.invoice_id) {
      await sendInvoiceReceiptEmail(log.invoice_id, { skipIdempotency: true });
    } else if (log.template_key === "purchase_activation_notice" && log.order_id) {
      const order = await getOrderById(log.order_id);
      const email = order?.checkout_email ?? order?.payer_email;
      if (!email?.includes("@")) {
        redirectWith(res, "/admin/email-logs", {
          error: "Orden sin email para reenviar aviso de bolsa activa.",
        });
        return;
      }
      await sendPostPurchaseNotifications(email, {
        dryRun: false,
        sendActivationNotice: true,
        isResend: true,
        resendReason: "admin_email_log_resend",
        requestedBy: req.adminUser?.id ?? null,
      });
    } else {
      redirectWith(res, "/admin/email-logs", {
        error: "Template no soportado para reenvío automático.",
      });
      return;
    }

    redirectWith(res, "/admin/email-logs", {
      ok: "Reenvío registrado (mock si EMAIL_MODE=mock).",
    });
  } catch (error) {
    redirectWith(res, "/admin/email-logs", {
      error: error instanceof Error ? error.message : "Error al reenviar",
    });
  }
}

export async function postResendOrderClaimEmail(
  req: Request,
  res: Response,
): Promise<void> {
  const orderId = validateUuidParam(String(req.params.id), "id");
  try {
    const result = await sendPaymentReceivedClaimEmail(orderId, {
      skipIdempotency: true,
    });
    redirectWith(res, `/admin/orders/${orderId}`, {
      ok: result.ok
        ? "Email de activación reenviado."
        : `No se pudo reenviar: ${result.error ?? "error"}`,
    });
  } catch (error) {
    redirectWith(res, `/admin/orders/${orderId}`, {
      error: error instanceof Error ? error.message : "Error",
    });
  }
}

export async function postResendOrderInvoiceEmail(
  req: Request,
  res: Response,
): Promise<void> {
  const orderId = validateUuidParam(String(req.params.id), "id");
  try {
    const invoice = await getInvoiceByOrderId(orderId);
    if (!invoice?.id) {
      redirectWith(res, `/admin/orders/${orderId}`, {
        error: "No hay comprobante para esta orden. Sincroniza billing primero.",
      });
      return;
    }
    const result = await sendInvoiceReceiptEmail(invoice.id, {
      skipIdempotency: true,
    });
    redirectWith(res, `/admin/orders/${orderId}`, {
      ok: result.ok
        ? "Comprobante reenviado (mock si aplica)."
        : `No se pudo reenviar: ${result.error ?? "error"}`,
    });
  } catch (error) {
    redirectWith(res, `/admin/orders/${orderId}`, {
      error: error instanceof Error ? error.message : "Error",
    });
  }
}

export async function getOrderEmailLogsForAdmin(orderId: string) {
  return listEmailLogsForOrder(orderId);
}

export async function loadOrderDetailEmailContext(orderId: string) {
  const order = await getOrderById(orderId);
  const invoice = order ? await getInvoiceByOrderId(orderId) : null;
  const logs = await listEmailLogsForOrder(orderId);
  return { logs, invoiceId: invoice?.id ?? null };
}
