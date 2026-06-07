import { env, isTransactionalEmailMock } from "../config/env.js";
import { getSupabase } from "../database/supabaseClient.js";
import type {
  EmailLogRow,
  SendTransactionalEmailInput,
  TransactionalTemplateKey,
} from "../types/email.js";
import type { SmsOrderRow } from "../types/wallet.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import {
  decryptClaimTokenFromMetadata,
  encryptClaimTokenForMetadata,
  generateClaimToken,
  hashClaimToken,
} from "../utils/claim-token.js";
import { getOrderById, getOrderWithDetails } from "./smsOrderService.js";
import { getCompanyBalance } from "./smsWalletService.js";
import {
  buildPaymentClaimUrlFromToken,
  orderRefLabel,
  renderPaymentReceivedPendingClaim,
  renderSimOpsPendingActivation,
  renderSimPaymentReceivedPendingActivation,
  renderWelcomeSmsCredited,
} from "./transactionalEmailTemplates.js";
import {
  buildInvoiceEmailSubject,
  sendInvoiceEmailIfNeeded,
} from "./billingEmailService.js";
import {
  ensureInvoiceForOrder,
  getAdminInvoiceById,
} from "./billingInvoiceService.js";
import { patchOrderFields } from "./smsOrderService.js";

export type LogEmailAttemptInput = {
  templateKey: string;
  subject: string;
  recipientEmail: string;
  status: EmailLogRow["status"];
  orderId?: string | null;
  invoiceId?: string | null;
  companyId?: string | null;
  userId?: string | null;
  provider?: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function resolveTransactionalProvider(): string {
  if (env.transactionalEmail.mode === "mock") {
    return "mock";
  }
  const p = env.transactionalEmail.provider;
  return p || "transactional";
}

function recipientFromOrder(order: SmsOrderRow): string | null {
  const candidates = [
    order.checkout_email,
    order.payer_email,
    (order.metadata?.checkout_email as string | undefined),
    (order.metadata?.payer_email as string | undefined),
  ];
  for (const c of candidates) {
    const t = c?.trim();
    if (t && t.includes("@")) {
      return normalizeEmail(t);
    }
  }
  return null;
}

export async function hasSentEmail(
  entityId: string,
  templateKey: TransactionalTemplateKey | string,
  entity: "order" | "invoice" = "order",
): Promise<boolean> {
  const column = entity === "invoice" ? "invoice_id" : "order_id";
  const { data, error } = await getSupabase()
    .from("email_logs")
    .select("id")
    .eq(column, entityId)
    .eq("template_key", templateKey)
    .eq("status", "sent")
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return false;
    }
    wrapSupabaseError(error, "hasSentEmail");
  }
  return Boolean(data);
}

export async function logEmailAttempt(
  input: LogEmailAttemptInput,
): Promise<EmailLogRow | null> {
  const now = new Date().toISOString();
  const row = {
    company_id: input.companyId ?? null,
    user_id: input.userId ?? null,
    order_id: input.orderId ?? null,
    invoice_id: input.invoiceId ?? null,
    recipient_email: input.recipientEmail,
    template_key: input.templateKey,
    subject: input.subject,
    status: input.status,
    provider: input.provider ?? resolveTransactionalProvider(),
    provider_message_id: input.providerMessageId ?? null,
    error_message: input.errorMessage ?? null,
    metadata: input.metadata ?? {},
    sent_at: input.status === "sent" ? now : null,
  };

  const { data, error } = await getSupabase()
    .from("email_logs")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      console.warn("[transactional-email] email_logs no disponible", error.message);
      return null;
    }
    wrapSupabaseError(error, "logEmailAttempt");
  }
  return data as EmailLogRow;
}

async function deliverEmail(
  input: SendTransactionalEmailInput,
): Promise<{ providerMessageId: string | null }> {
  if (isTransactionalEmailMock()) {
    return { providerMessageId: `mock-${Date.now()}` };
  }

  if (env.transactionalEmail.mode !== "provider") {
    throw new Error("EMAIL_MODE inválido; usa mock o provider.");
  }

  if (env.transactionalEmail.provider !== "resend") {
    throw new Error("EMAIL_PROVIDER no soportado (solo resend por ahora).");
  }

  const apiKey = env.transactionalEmail.resendApiKey?.trim();
  if (!apiKey) {
    throw new Error("Falta RESEND_API_KEY para envío real.");
  }

  const fromAddress = env.transactionalEmail.fromAddress?.trim();
  const fromName = env.transactionalEmail.fromName?.trim() || "Telvoice";
  if (!fromAddress || !fromAddress.includes("@")) {
    throw new Error("Falta EMAIL_FROM_ADDRESS válido.");
  }

  const replyTo = env.transactionalEmail.replyTo?.trim();
  if (!replyTo || !replyTo.includes("@")) {
    throw new Error("Falta EMAIL_REPLY_TO válido.");
  }

  const from = `${fromName} <${fromAddress}>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.recipientEmail],
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: replyTo,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
    message?: string;
  };

  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `Resend error HTTP ${res.status}`;
    throw new Error(msg);
  }

  return { providerMessageId: data.id ?? null };
}

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput,
): Promise<{ ok: boolean; skipped?: boolean; logId?: string; error?: string }> {
  const recipient = normalizeEmail(input.recipientEmail);
  if (!recipient.includes("@")) {
    await logEmailAttempt({
      templateKey: input.templateKey,
      subject: input.subject,
      recipientEmail: recipient || "(vacío)",
      status: "failed",
      orderId: input.orderId,
      invoiceId: input.invoiceId,
      companyId: input.companyId,
      userId: input.userId,
      errorMessage: "recipient_email inválido o vacío",
      metadata: input.metadata,
    });
    return { ok: false, error: "invalid_recipient" };
  }

  const entityId = input.invoiceId ?? input.orderId;
  const entityType = input.invoiceId ? "invoice" : "order";
  if (entityId && !input.skipIdempotency) {
    if (await hasSentEmail(entityId, input.templateKey, entityType)) {
      await logEmailAttempt({
        templateKey: input.templateKey,
        subject: input.subject,
        recipientEmail: recipient,
        status: "skipped",
        orderId: input.orderId,
        invoiceId: input.invoiceId,
        companyId: input.companyId,
        userId: input.userId,
        metadata: { ...input.metadata, reason: "already_sent" },
      });
      return { ok: true, skipped: true };
    }
  }

  const pending = await logEmailAttempt({
    templateKey: input.templateKey,
    subject: input.subject,
    recipientEmail: recipient,
    status: "pending",
    orderId: input.orderId,
    invoiceId: input.invoiceId,
    companyId: input.companyId,
    userId: input.userId,
    metadata: input.metadata,
  });

  try {
    const sent = await deliverEmail(input);
    if (pending?.id) {
      await getSupabase()
        .from("email_logs")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: sent.providerMessageId,
        })
        .eq("id", pending.id);
    } else {
      await logEmailAttempt({
        templateKey: input.templateKey,
        subject: input.subject,
        recipientEmail: recipient,
        status: "sent",
        orderId: input.orderId,
        invoiceId: input.invoiceId,
        companyId: input.companyId,
        userId: input.userId,
        providerMessageId: sent.providerMessageId,
        metadata: input.metadata,
      });
    }
    return { ok: true, logId: pending?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (pending?.id) {
      await getSupabase()
        .from("email_logs")
        .update({ status: "failed", error_message: msg })
        .eq("id", pending.id);
    } else {
      await logEmailAttempt({
        templateKey: input.templateKey,
        subject: input.subject,
        recipientEmail: recipient,
        status: "failed",
        orderId: input.orderId,
        invoiceId: input.invoiceId,
        companyId: input.companyId,
        errorMessage: msg,
        metadata: input.metadata,
      });
    }
    return { ok: false, error: msg, logId: pending?.id };
  }
}

async function resolveClaimTokenForOrder(order: SmsOrderRow): Promise<string | null> {
  const enc = order.metadata?.claim_token_enc;
  if (typeof enc === "string" && enc.length > 0) {
    const dec = decryptClaimTokenFromMetadata(enc);
    if (dec) {
      return dec;
    }
  }
  return null;
}

export async function rotateClaimTokenForOrder(orderId: string): Promise<string> {
  const token = generateClaimToken();
  const enc = encryptClaimTokenForMetadata(token);
  const order = await getOrderById(orderId);
  if (!order) {
    throw new Error("order_not_found");
  }
  await patchOrderFields(orderId, {
    metadata: {
      ...(order.metadata ?? {}),
      claim_token_enc: enc,
    },
  });
  const { error } = await getSupabase()
    .from("sms_orders")
    .update({
      claim_token_hash: hashClaimToken(token),
      claim_status: "unclaimed",
    })
    .eq("id", orderId);
  if (error) {
    wrapSupabaseError(error, "rotateClaimTokenForOrder");
  }
  return token;
}

export async function sendPaymentReceivedClaimEmail(
  orderId: string,
  options?: { skipIdempotency?: boolean; claimToken?: string },
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const order = await getOrderWithDetails(orderId);
  if (!order) {
    return { ok: false, error: "order_not_found" };
  }
  if (order.credit_status !== "pending_claim" || order.payment_status !== "paid") {
    return { ok: false, error: "order_not_pending_claim" };
  }

  const recipient = recipientFromOrder(order);
  if (!recipient) {
    await logEmailAttempt({
      templateKey: "payment_received_pending_claim",
      subject: "Pago recibido — activa tu cuenta Telvoice",
      recipientEmail: "(vacío)",
      status: "failed",
      orderId,
      errorMessage: "Sin email de checkout/payer",
    });
    return { ok: false, error: "missing_recipient" };
  }

  let claimToken = options?.claimToken ?? (await resolveClaimTokenForOrder(order));
  if (!claimToken) {
    claimToken = await rotateClaimTokenForOrder(orderId);
  }
  const claimUrl = buildPaymentClaimUrlFromToken(claimToken);
  const rendered = renderPaymentReceivedPendingClaim({
    recipientName: recipient.split("@")[0] ?? "Cliente",
    packageName: order.package_name ?? "Bolsa SMS",
    smsQuantity: order.sms_quantity,
    amount: Number(order.amount),
    currency: order.currency,
    orderId: order.id,
    orderRef: orderRefLabel(order.id, order.public_checkout_reference),
    claimUrl,
  });

  return sendTransactionalEmail({
    templateKey: "payment_received_pending_claim",
    subject: rendered.subject,
    recipientEmail: recipient,
    html: rendered.html,
    text: rendered.text,
    orderId,
    metadata: {
      claim_url: claimUrl,
      public_checkout_reference: order.public_checkout_reference,
    },
    skipIdempotency: options?.skipIdempotency,
  });
}

function opsNotifyEmails(): string[] {
  const raw =
    process.env.ORDER_NOTIFY_EMAIL?.trim() ||
    process.env.BILLING_NOTIFY_EMAIL?.trim() ||
    "billing@telvoice.net";
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

export async function sendSimPaymentReceivedEmails(
  orderId: string,
  options?: { skipIdempotency?: boolean },
): Promise<{ ok: boolean; customer?: { ok: boolean }; ops?: { ok: boolean }; error?: string }> {
  const order = await getOrderWithDetails(orderId);
  if (!order) {
    return { ok: false, error: "order_not_found" };
  }
  if (order.payment_status !== "paid") {
    return { ok: false, error: "order_not_paid" };
  }

  const meta = order.metadata ?? {};
  const planName =
    typeof meta.plan_name === "string"
      ? meta.plan_name
      : "Numeración SIM real";
  const planId = typeof meta.plan_id === "string" ? meta.plan_id : "sim_unknown";

  const recipient = recipientFromOrder(order);
  let customerResult: { ok: boolean; skipped?: boolean; error?: string } = {
    ok: false,
    error: "missing_recipient",
  };

  if (recipient) {
    let claimToken = await resolveClaimTokenForOrder(order);
    if (!claimToken) {
      claimToken = await rotateClaimTokenForOrder(orderId);
    }
    const claimUrl = buildPaymentClaimUrlFromToken(claimToken);
    const rendered = renderSimPaymentReceivedPendingActivation({
      recipientName: recipient.split("@")[0] ?? "Cliente",
      planName,
      includedSmsMonthly: order.sms_quantity,
      amount: Number(order.amount),
      currency: order.currency,
      orderRef: orderRefLabel(order.id, order.public_checkout_reference),
      claimUrl,
    });

    customerResult = await sendTransactionalEmail({
      templateKey: "sim_payment_received_pending_activation",
      subject: rendered.subject,
      recipientEmail: recipient,
      html: rendered.html,
      text: rendered.text,
      orderId,
      metadata: { claim_url: claimUrl, plan_id: planId },
      skipIdempotency: options?.skipIdempotency,
    });
  }

  const adminUrl = `${env.publicAppUrl.replace(/\/$/, "")}/admin/numeraciones?sim_pending=1`;
  const opsRendered = renderSimOpsPendingActivation({
    planName,
    planId,
    includedSmsMonthly: order.sms_quantity,
    amount: Number(order.amount),
    currency: order.currency,
    orderId: order.id,
    orderRef: orderRefLabel(order.id, order.public_checkout_reference),
    checkoutEmail: recipient ?? order.checkout_email ?? "—",
    payerName:
      typeof meta.payer_name === "string" ? meta.payer_name : null,
    companyName:
      typeof meta.company_name === "string" ? meta.company_name : null,
    phone: typeof meta.phone === "string" ? meta.phone : null,
    taxId: typeof meta.tax_id === "string" ? meta.tax_id : null,
    adminUrl,
  });

  let anyOpsOk = false;
  for (const to of opsNotifyEmails()) {
    const r = await sendTransactionalEmail({
      templateKey: "sim_ops_pending_activation",
      subject: opsRendered.subject,
      recipientEmail: to,
      html: opsRendered.html,
      text: opsRendered.text,
      orderId,
      metadata: { plan_id: planId, admin_url: adminUrl },
      skipIdempotency: options?.skipIdempotency,
    });
    if (r.ok) anyOpsOk = true;
  }

  return {
    ok: customerResult.ok || anyOpsOk,
    customer: customerResult,
    ops: { ok: anyOpsOk },
  };
}

export async function sendWelcomeAndSmsCreditedEmail(
  orderId: string,
  options?: { skipIdempotency?: boolean },
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const order = await getOrderWithDetails(orderId);
  if (!order?.company_id) {
    return { ok: false, error: "order_missing_company" };
  }
  if (order.credit_status !== "credited") {
    return { ok: false, error: "order_not_credited" };
  }

  const recipient = recipientFromOrder(order);
  if (!recipient) {
    await logEmailAttempt({
      templateKey: "welcome_sms_credited",
      subject: "Bienvenido a Telvoice — tus SMS ya están disponibles",
      recipientEmail: "(vacío)",
      status: "failed",
      orderId,
      companyId: order.company_id,
      errorMessage: "Sin email de checkout/payer",
    });
    return { ok: false, error: "missing_recipient" };
  }

  const balance = await getCompanyBalance(order.company_id, "CL");
  const rendered = renderWelcomeSmsCredited({
    recipientName: recipient.split("@")[0] ?? "Cliente",
    packageName: order.package_name ?? "Bolsa SMS",
    smsCredited: order.sms_quantity,
    availableBalance: balance.availableSms,
    dashboardUrl: `${env.publicAppUrl}/app/dashboard?welcome=1`,
  });

  const result = await sendTransactionalEmail({
    templateKey: "welcome_sms_credited",
    subject: rendered.subject,
    recipientEmail: recipient,
    html: rendered.html,
    text: rendered.text,
    orderId,
    companyId: order.company_id,
    skipIdempotency: options?.skipIdempotency,
  });

  const meta = { ...(order.metadata ?? {}) };
  delete meta.claim_token_enc;
  await patchOrderFields(orderId, { metadata: meta });

  return result;
}

export async function sendInvoiceReceiptEmail(
  invoiceId: string,
  options?: { skipIdempotency?: boolean },
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const detail = await getAdminInvoiceById(invoiceId);
  if (!detail) {
    return { ok: false, error: "invoice_not_found" };
  }

  const recipient =
    detail.customer_email?.trim() ||
    detail.company?.billing_email?.trim() ||
    "";
  const subject = buildInvoiceEmailSubject(detail);

  if (!options?.skipIdempotency && (await hasSentEmail(invoiceId, "invoice_receipt", "invoice"))) {
    return { ok: true, skipped: true };
  }

  const emailResult = await sendInvoiceEmailIfNeeded(invoiceId, {
    source: "transactional_claim",
    skipIfAlreadySent: !options?.skipIdempotency,
  });

  if (emailResult.success) {
    if (!emailResult.skipped) {
      await logEmailAttempt({
        templateKey: "invoice_receipt",
        subject,
        recipientEmail: recipient || emailResult.toEmail || "(billing)",
        status: "sent",
        orderId: detail.order_id,
        invoiceId,
        companyId: detail.company_id,
        provider: "billing",
        providerMessageId: emailResult.emailLogId ?? null,
        metadata: { billing_email_log_id: emailResult.emailLogId },
      });
    }
    return { ok: true, skipped: emailResult.skipped };
  }

  await logEmailAttempt({
    templateKey: "invoice_receipt",
    subject,
    recipientEmail: recipient || "(vacío)",
    status: "failed",
    orderId: detail.order_id,
    invoiceId,
    companyId: detail.company_id,
    errorMessage: emailResult.message,
  });
  return { ok: false, error: emailResult.message };
}

export async function sendPostClaimEmailsBestEffort(
  orderId: string,
): Promise<void> {
  try {
    await sendWelcomeAndSmsCreditedEmail(orderId);
  } catch (err) {
    console.error("[transactional-email] welcome failed", orderId, err);
  }

  try {
    const invoice = await ensureInvoiceForOrder(orderId);
    if (invoice?.id) {
      await sendInvoiceReceiptEmail(invoice.id);
    }
  } catch (err) {
    console.error("[transactional-email] invoice failed", orderId, err);
  }
}

export async function listEmailLogsForOrder(
  orderId: string,
  limit = 20,
): Promise<EmailLogRow[]> {
  const { data, error } = await getSupabase()
    .from("email_logs")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listEmailLogsForOrder");
  }
  return (data ?? []) as EmailLogRow[];
}

export async function listEmailLogs(options: {
  limit?: number;
  status?: string;
  templateKey?: string;
}): Promise<EmailLogRow[]> {
  let q = getSupabase()
    .from("email_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);

  if (options.status) {
    q = q.eq("status", options.status);
  }
  if (options.templateKey) {
    q = q.eq("template_key", options.templateKey);
  }

  const { data, error } = await q;
  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listEmailLogs");
  }
  return (data ?? []) as EmailLogRow[];
}
