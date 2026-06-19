import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import {
  type AgentAddonDefinition,
  type AgentAddonId,
} from "../utils/agentAddons.js";
import {
  simCheckoutItemDescription,
  simCheckoutItemTitle,
  type SimPlanDefinition,
} from "../utils/simPlans.js";

const MP_API = "https://api.mercadopago.com";

export interface MercadoPagoPayerInput {
  email: string;
  name: string;
  phone?: string | null;
}

export interface CreateSmsPreferenceInput {
  smsQuantity: number;
  itemTitle: string;
  itemDescription: string;
  totalAmount: number;
  payer: MercadoPagoPayerInput;
  externalReference?: string;
}

export interface CreateClientPanelPreferenceInput {
  orderId: string;
  companyId: string;
  packageId: string;
  smsQuantity: number;
  totalAmount: number;
  itemTitle: string;
  itemDescription: string;
  payer: MercadoPagoPayerInput;
}

export type MercadoPagoPaymentRecord = {
  id: number | string;
  status: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  currency_id?: string;
  date_approved?: string | null;
  payment_method_id?: string | null;
  payer?: { email?: string };
  card?: {
    last_four_digits?: string;
    expiration_month?: number;
    expiration_year?: number;
    cardholder?: { name?: string };
  };
  metadata?: Record<string, unknown>;
};

function resolvePayerEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  if (!env.mercadopago.sandbox) {
    return trimmed;
  }
  const testEmail = env.mercadopago.testPayerEmail;
  if (testEmail) {
    return testEmail;
  }
  if (/@testuser\.com$/i.test(trimmed)) {
    return trimmed;
  }
  throw new AppError(
    "En modo prueba configure MERCADOPAGO_TEST_PAYER_EMAIL o use un email @testuser.com del comprador de prueba.",
    503,
    "MP_SANDBOX_PAYER",
  );
}

function payerPhone(phone: string | null | undefined): {
  area_code: string;
  number: string;
} | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) {
    return null;
  }
  if (digits.startsWith("569") && digits.length >= 11) {
    return { area_code: "9", number: digits.slice(3) };
  }
  if (digits.startsWith("9") && digits.length === 9) {
    return { area_code: "9", number: digits.slice(1) };
  }
  return { area_code: "", number: digits.slice(-8) };
}

export function checkoutRedirectUrl(preference: {
  init_point?: string;
  sandbox_init_point?: string;
}): string {
  if (env.mercadopago.sandbox) {
    const url = preference.sandbox_init_point;
    if (!url) {
      throw new AppError(
        "Mercado Pago no devolvió URL sandbox. Verifique MERCADOPAGO_ACCESS_TOKEN (pestaña Prueba).",
        502,
        "MP_NO_SANDBOX_URL",
      );
    }
    return url;
  }
  const url = preference.init_point;
  if (!url) {
    throw new AppError("Mercado Pago no devolvió URL de pago.", 502, "MP_NO_URL");
  }
  return url;
}

export async function createSmsCheckoutPreference(
  input: CreateSmsPreferenceInput,
): Promise<{ checkout_url: string; preference_id: string | null }> {
  const token = env.mercadopago.accessToken;
  if (!token) {
    throw new AppError(
      "MercadoPago no configurado en el agente (MERCADOPAGO_ACCESS_TOKEN).",
      503,
      "MP_NOT_CONFIGURED",
    );
  }

  const payerEmail = resolvePayerEmail(input.payer.email);
  const base = env.publicSiteUrl;
  const externalReference = input.externalReference ?? randomUUID();

  const payer: Record<string, unknown> = {
    email: payerEmail,
    name: input.payer.name.trim().slice(0, 80) || "Cliente Telvoice",
  };
  const phone = payerPhone(input.payer.phone);
  if (phone) {
    payer.phone = phone;
  }
  if (env.mercadopago.sandbox) {
    payer.name = "APRO";
    payer.identification = { type: "Otro", number: "123456789" };
  }

  const body = {
    items: [
      {
        title: input.itemTitle.slice(0, 256),
        description: input.itemDescription.slice(0, 256),
        quantity: 1,
        currency_id: "CLP",
        unit_price: input.totalAmount,
      },
    ],
    payer,
    statement_descriptor: "Telvoice SMS",
    locale: "es-CL",
    external_reference: externalReference,
    metadata: {
      source: "telegram_agent",
      sms_quantity: String(input.smsQuantity),
      total_amount: String(input.totalAmount),
    },
    back_urls: {
      success: `${base}/pago-exitoso`,
      failure: `${base}/pago-fallido`,
      pending: `${base}/pago-pendiente`,
    },
    notification_url: `${base}/api/mercadopago/webhook`,
    auto_return: "approved",
  };

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
  };

  if (!res.ok) {
    console.error("[mercadoPagoService] preference error", res.status, data);
    throw new AppError(
      data.message ?? "No se pudo crear la preferencia de MercadoPago.",
      502,
      "MP_PREFERENCE_FAILED",
    );
  }

  return {
    checkout_url: checkoutRedirectUrl(data),
    preference_id: data.id ?? null,
  };
}

function appPaymentReturnUrl(kind: "success" | "failure" | "pending"): string {
  const override =
    kind === "success"
      ? env.mercadopago.successUrlApp
      : kind === "failure"
        ? env.mercadopago.failureUrlApp
        : env.mercadopago.pendingUrlApp;
  if (override) {
    return override;
  }
  return `${env.publicAppUrl}/app/payments/mercadopago/${kind}`;
}

export async function createClientPanelCheckoutPreference(
  input: CreateClientPanelPreferenceInput,
): Promise<{
  checkout_url: string;
  preference_id: string | null;
  init_point: string | null;
  sandbox_init_point: string | null;
}> {
  const token = env.mercadopago.accessToken;
  if (!token) {
    throw new AppError(
      "MercadoPago no configurado (MERCADOPAGO_ACCESS_TOKEN).",
      503,
      "MP_NOT_CONFIGURED",
    );
  }

  const payerEmail = resolvePayerEmail(input.payer.email);
  const payer: Record<string, unknown> = {
    email: payerEmail,
    name: input.payer.name.trim().slice(0, 80) || "Cliente Telvoice",
  };
  const phone = payerPhone(input.payer.phone);
  if (phone) {
    payer.phone = phone;
  }
  if (env.mercadopago.sandbox) {
    payer.name = "APRO";
    payer.identification = { type: "Otro", number: "123456789" };
  }

  const body = {
    items: [
      {
        title: input.itemTitle.slice(0, 256),
        description: input.itemDescription.slice(0, 256),
        quantity: 1,
        currency_id: "CLP",
        unit_price: input.totalAmount,
      },
    ],
    payer,
    statement_descriptor: "Telvoice SMS",
    locale: "es-CL",
    external_reference: input.orderId,
    metadata: {
      source: "client_panel",
      checkout_mode: "mercadopago",
      customer_visible: true,
      order_id: input.orderId,
      company_id: input.companyId,
      package_id: input.packageId,
      sms_quantity: String(input.smsQuantity),
      total_amount: String(input.totalAmount),
    },
    back_urls: {
      success: appPaymentReturnUrl("success"),
      failure: appPaymentReturnUrl("failure"),
      pending: appPaymentReturnUrl("pending"),
    },
    notification_url: `${env.publicAppUrl}/api/mercadopago/webhook`,
    auto_return: "approved",
  };

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
  };

  if (!res.ok) {
    console.error("[mercadoPagoService] client_panel preference error", res.status);
    throw new AppError(
      data.message ?? "No se pudo crear la preferencia de MercadoPago.",
      502,
      "MP_PREFERENCE_FAILED",
    );
  }

  return {
    checkout_url: checkoutRedirectUrl(data),
    preference_id: data.id ?? null,
    init_point: data.init_point ?? null,
    sandbox_init_point: data.sandbox_init_point ?? null,
  };
}

export async function createPublicLandingCheckoutPreference(input: {
  orderId: string;
  packageId: string;
  smsQuantity: number;
  totalAmount: number;
  itemTitle: string;
  itemDescription: string;
  payer: MercadoPagoPayerInput;
  publicCheckoutReference: string;
}): Promise<{
  checkout_url: string;
  preference_id: string | null;
}> {
  const token = env.mercadopago.accessToken;
  if (!token) {
    throw new AppError(
      "MercadoPago no configurado (MERCADOPAGO_ACCESS_TOKEN).",
      503,
      "MP_NOT_CONFIGURED",
    );
  }

  const payerEmail = resolvePayerEmail(input.payer.email);
  const payer: Record<string, unknown> = {
    email: payerEmail,
    name: input.payer.name.trim().slice(0, 80) || "Cliente Telvoice",
  };
  if (env.mercadopago.sandbox) {
    payer.name = "APRO";
    payer.identification = { type: "Otro", number: "123456789" };
  }

  const successUrl = `${env.publicAppUrl}/checkout/success?ref=${encodeURIComponent(input.publicCheckoutReference)}`;
  const failureUrl = `${env.publicSiteUrl}/pago-error`;
  const pendingUrl = `${env.publicSiteUrl}/pago-pendiente`;

  const body = {
    items: [
      {
        title: input.itemTitle.slice(0, 256),
        description: input.itemDescription.slice(0, 256),
        quantity: 1,
        currency_id: "CLP",
        unit_price: input.totalAmount,
      },
    ],
    payer,
    statement_descriptor: "Telvoice SMS",
    locale: "es-CL",
    external_reference: input.orderId,
    metadata: {
      source: "landing",
      checkout_mode: "mercadopago",
      claim_required: true,
      order_id: input.orderId,
      package_id: input.packageId,
      public_checkout_reference: input.publicCheckoutReference,
    },
    back_urls: {
      success: successUrl,
      failure: failureUrl,
      pending: pendingUrl,
    },
    notification_url: `${env.publicAppUrl}/api/mercadopago/webhook`,
    auto_return: "approved",
  };

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
  };

  if (!res.ok) {
    console.error("[mercadoPagoService] landing preference error", res.status);
    throw new AppError(
      data.message ?? "No se pudo crear la preferencia de MercadoPago.",
      502,
      "MP_PREFERENCE_FAILED",
    );
  }

  return {
    checkout_url: checkoutRedirectUrl(data),
    preference_id: data.id ?? null,
  };
}

export async function createPublicSimCheckoutPreference(input: {
  orderId: string;
  planId: string;
  smsQuantity: number;
  totalAmount: number;
  itemTitle: string;
  itemDescription: string;
  payer: MercadoPagoPayerInput;
  publicCheckoutReference: string;
}): Promise<{
  checkout_url: string;
  preference_id: string | null;
}> {
  const token = env.mercadopago.accessToken;
  if (!token) {
    throw new AppError(
      "MercadoPago no configurado (MERCADOPAGO_ACCESS_TOKEN).",
      503,
      "MP_NOT_CONFIGURED",
    );
  }

  const payerEmail = resolvePayerEmail(input.payer.email);
  const payer: Record<string, unknown> = {
    email: payerEmail,
    name: input.payer.name.trim().slice(0, 80) || "Cliente Telvoice",
  };
  if (env.mercadopago.sandbox) {
    payer.name = "APRO";
    payer.identification = { type: "Otro", number: "123456789" };
  }

  const successUrl = `${env.publicAppUrl}/checkout/success?ref=${encodeURIComponent(input.publicCheckoutReference)}`;
  const failureUrl = `${env.publicSiteUrl}/pago-error`;
  const pendingUrl = `${env.publicSiteUrl}/pago-pendiente`;

  const body = {
    items: [
      {
        title: input.itemTitle.slice(0, 256),
        description: input.itemDescription.slice(0, 256),
        quantity: 1,
        currency_id: "CLP",
        unit_price: input.totalAmount,
      },
    ],
    payer,
    statement_descriptor: "Telvoice SIM",
    locale: "es-CL",
    external_reference: input.orderId,
    metadata: {
      source: "landing_sim_checkout",
      checkout_mode: "mercadopago",
      claim_required: true,
      product_type: "sim_subscription",
      order_id: input.orderId,
      plan_id: input.planId,
      public_checkout_reference: input.publicCheckoutReference,
    },
    back_urls: {
      success: successUrl,
      failure: failureUrl,
      pending: pendingUrl,
    },
    notification_url: `${env.publicAppUrl}/api/mercadopago/webhook`,
    auto_return: "approved",
  };

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
  };

  if (!res.ok) {
    console.error("[mercadoPagoService] sim landing preference error", res.status);
    throw new AppError(
      data.message ?? "No se pudo crear la preferencia de MercadoPago.",
      502,
      "MP_PREFERENCE_FAILED",
    );
  }

  return {
    checkout_url: checkoutRedirectUrl(data),
    preference_id: data.id ?? null,
  };
}

/** Suscripción recurrente — numeración SIM landing pública (mensual o anual). */
export async function createPublicSimSubscriptionPreapproval(input: {
  orderId: string;
  plan: SimPlanDefinition;
  billingCycle: "monthly" | "annual";
  chargeAmount: number;
  pricingMetadata: Record<string, string | number>;
  payer: MercadoPagoPayerInput;
  publicCheckoutReference: string;
}): Promise<{
  checkout_url: string;
  preapproval_id: string | null;
}> {
  const isAnnual = input.billingCycle === "annual";
  const reasonSuffix = isAnnual ? " (anual)" : "";
  const preapproval = await createMercadoPagoPreapproval({
    externalReference: input.orderId,
    reason: `${simCheckoutItemTitle(input.plan)}${reasonSuffix}`.slice(0, 256),
    payerEmail: input.payer.email,
    backUrl: `${env.publicSiteUrl}/pago-exitoso?ref=${encodeURIComponent(input.publicCheckoutReference)}&type=sim_subscription`,
    recurring: {
      frequency: isAnnual ? 12 : 1,
      frequency_type: "months",
      transaction_amount: input.chargeAmount,
    },
    metadata: {
      source: "landing_sim_checkout",
      checkout_mode: "mercadopago_subscription",
      product_type: "sim_subscription",
      order_id: input.orderId,
      plan_id: input.plan.plan_id,
      public_checkout_reference: input.publicCheckoutReference,
      billing_cycle: input.billingCycle,
      billing_mode: "subscription",
      recurring: "true",
      ...Object.fromEntries(
        Object.entries(input.pricingMetadata).map(([key, value]) => [
          key,
          String(value),
        ]),
      ),
    },
  });

  return {
    checkout_url: preapproval.checkout_url,
    preapproval_id: preapproval.preapproval_id,
  };
}

/** Suscripción recurrente — numeración SIM panel cliente autenticado (mensual o anual). */
export async function createClientPanelSimSubscriptionPreapproval(input: {
  orderId: string;
  companyId: string;
  plan: SimPlanDefinition;
  billingCycle: "monthly" | "annual";
  chargeAmount: number;
  pricingMetadata: Record<string, string | number>;
  payer: MercadoPagoPayerInput;
}): Promise<{
  checkout_url: string;
  preapproval_id: string | null;
}> {
  const isAnnual = input.billingCycle === "annual";
  const reasonSuffix = isAnnual ? " (anual)" : "";
  const preapproval = await createMercadoPagoPreapproval({
    externalReference: input.orderId,
    reason: `${simCheckoutItemTitle(input.plan)}${reasonSuffix}`.slice(0, 256),
    payerEmail: input.payer.email,
    backUrl: `${env.publicAppUrl}/app/payments/mercadopago/pending?sim=1`,
    recurring: {
      frequency: isAnnual ? 12 : 1,
      frequency_type: "months",
      transaction_amount: input.chargeAmount,
    },
    metadata: {
      source: "client_panel_sim_subscription",
      checkout_mode: "mercadopago_subscription",
      product_type: "sim_subscription",
      order_id: input.orderId,
      company_id: input.companyId,
      plan_id: input.plan.plan_id,
      billing_cycle: input.billingCycle,
      billing_mode: "subscription",
      recurring: "true",
      ...Object.fromEntries(
        Object.entries(input.pricingMetadata).map(([key, value]) => [
          key,
          String(value),
        ]),
      ),
    },
  });

  return {
    checkout_url: preapproval.checkout_url,
    preapproval_id: preapproval.preapproval_id,
  };
}

export async function createPublicSimAgentBundlePreference(input: {
  orderId: string;
  plan: SimPlanDefinition;
  agentAddonId: AgentAddonId;
  agentAddon: AgentAddonDefinition | null;
  totalAmount: number;
  payer: MercadoPagoPayerInput;
  publicCheckoutReference: string;
}): Promise<{
  checkout_url: string;
  preference_id: string | null;
}> {
  const token = env.mercadopago.accessToken;
  if (!token) {
    throw new AppError(
      "MercadoPago no configurado (MERCADOPAGO_ACCESS_TOKEN).",
      503,
      "MP_NOT_CONFIGURED",
    );
  }

  const payerEmail = resolvePayerEmail(input.payer.email);
  const payer: Record<string, unknown> = {
    email: payerEmail,
    name: input.payer.name.trim().slice(0, 80) || "Cliente Telvoice",
  };
  if (env.mercadopago.sandbox) {
    payer.name = "APRO";
    payer.identification = { type: "Otro", number: "123456789" };
  }

  const simTitle = simCheckoutItemTitle(input.plan);
  const items: Array<Record<string, unknown>> = [
    {
      title: simTitle.slice(0, 256),
      description: simCheckoutItemDescription(input.plan).slice(0, 256),
      quantity: 1,
      currency_id: "CLP",
      unit_price: input.totalAmount,
    },
  ];

  const successUrl = `${env.publicAppUrl}/checkout/success?ref=${encodeURIComponent(input.publicCheckoutReference)}`;
  const failureUrl = `${env.publicSiteUrl}/pago-error`;
  const pendingUrl = `${env.publicSiteUrl}/pago-pendiente`;

  const body = {
    items,
    payer,
    statement_descriptor: "Telvoice",
    locale: "es-CL",
    external_reference: input.orderId,
    metadata: {
      source: "landing_sim_agent_builder",
      checkout_mode: "mercadopago",
      product_type: "sim_agent_bundle",
      sim_plan_id: input.plan.plan_id,
      sim_plan_name: input.plan.name,
      included_sms_monthly: input.plan.sms_quantity,
      agent_addon_id: input.agentAddonId,
      agent_addon_name: input.agentAddon?.name ?? null,
      requires_manual_activation: true,
      account_creation_mode: "post_payment_auto",
      activation_status: "pending_payment",
      order_id: input.orderId,
      public_checkout_reference: input.publicCheckoutReference,
    },
    back_urls: {
      success: successUrl,
      failure: failureUrl,
      pending: pendingUrl,
    },
    notification_url: `${env.publicAppUrl}/api/mercadopago/webhook`,
    auto_return: "approved",
  };

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
  };

  if (!res.ok) {
    console.error("[mercadoPagoService] sim agent bundle preference error", res.status);
    throw new AppError(
      data.message ?? "No se pudo crear la preferencia de MercadoPago.",
      502,
      "MP_PREFERENCE_FAILED",
    );
  }

  return {
    checkout_url: checkoutRedirectUrl(data),
    preference_id: data.id ?? null,
  };
}

export async function getMercadoPagoPayment(
  paymentId: string,
): Promise<MercadoPagoPaymentRecord> {
  const token = env.mercadopago.accessToken;
  if (!token) {
    throw new AppError("MercadoPago no configurado.", 503, "MP_NOT_CONFIGURED");
  }

  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = (await res.json().catch(() => ({}))) as MercadoPagoPaymentRecord & {
    message?: string;
  };

  if (!res.ok) {
    console.error("[mercadoPagoService] get payment error", res.status);
    throw new AppError(
      data.message ?? "No se pudo consultar el pago en MercadoPago.",
      502,
      "MP_PAYMENT_FETCH_FAILED",
    );
  }

  return data;
}

export type MercadoPagoPreapprovalRecord = {
  id?: string;
  status?: string;
  external_reference?: string;
  init_point?: string;
  sandbox_init_point?: string;
  payer_email?: string;
  reason?: string;
  auto_recurring?: {
    transaction_amount?: number;
    currency_id?: string;
  };
};

export async function createMercadoPagoPreapproval(input: {
  externalReference: string;
  reason: string;
  payerEmail: string;
  backUrl: string;
  metadata?: Record<string, string>;
  recurring: {
    frequency: number;
    frequency_type: "months";
    transaction_amount: number;
  };
}): Promise<{
  preapproval_id: string | null;
  checkout_url: string;
  init_point: string | null;
  sandbox_init_point: string | null;
}> {
  const token = env.mercadopago.accessToken;
  if (!token) {
    throw new AppError(
      "MercadoPago no configurado (MERCADOPAGO_ACCESS_TOKEN).",
      503,
      "MP_NOT_CONFIGURED",
    );
  }

  const payerEmail = resolvePayerEmail(input.payerEmail);
  const body = {
    reason: input.reason.slice(0, 256),
    external_reference: input.externalReference,
    payer_email: payerEmail,
    auto_recurring: {
      frequency: input.recurring.frequency,
      frequency_type: input.recurring.frequency_type,
      transaction_amount: Math.round(input.recurring.transaction_amount),
      currency_id: "CLP",
    },
    back_url: input.backUrl,
    notification_url: `${env.publicAppUrl}/api/mercadopago/webhook`,
    status: "pending",
    metadata: input.metadata ?? {},
  };

  const res = await fetch(`${MP_API}/preapproval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as MercadoPagoPreapprovalRecord & {
    message?: string;
  };

  if (!res.ok) {
    console.error("[mercadoPagoService] preapproval error", res.status, data);
    throw new AppError(
      data.message ?? "No se pudo crear la suscripción en MercadoPago.",
      502,
      "MP_PREAPPROVAL_FAILED",
    );
  }

  return {
    preapproval_id: data.id ?? null,
    checkout_url: checkoutRedirectUrl(data),
    init_point: data.init_point ?? null,
    sandbox_init_point: data.sandbox_init_point ?? null,
  };
}

export type MercadoPagoAuthorizedPaymentRecord = {
  id?: number | string;
  preapproval_id?: string;
  payment?: {
    id?: number | string;
    status?: string;
    transaction_amount?: number;
  };
  status?: string;
};

export async function getMercadoPagoAuthorizedPayment(
  authorizedPaymentId: string,
): Promise<MercadoPagoAuthorizedPaymentRecord> {
  const token = env.mercadopago.accessToken;
  if (!token) {
    throw new AppError("MercadoPago no configurado.", 503, "MP_NOT_CONFIGURED");
  }

  const res = await fetch(`${MP_API}/authorized_payments/${authorizedPaymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = (await res.json().catch(() => ({}))) as MercadoPagoAuthorizedPaymentRecord & {
    message?: string;
  };

  if (!res.ok) {
    console.error("[mercadoPagoService] get authorized_payment error", res.status);
    throw new AppError(
      data.message ?? "No se pudo consultar el cobro autorizado en MercadoPago.",
      502,
      "MP_AUTHORIZED_PAYMENT_FETCH_FAILED",
    );
  }

  return data;
}

export async function searchMercadoPagoAuthorizedPaymentsByPreapproval(
  preapprovalId: string,
): Promise<MercadoPagoAuthorizedPaymentRecord[]> {
  const token = env.mercadopago.accessToken;
  if (!token) {
    throw new AppError("MercadoPago no configurado.", 503, "MP_NOT_CONFIGURED");
  }

  const res = await fetch(
    `${MP_API}/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId.trim())}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  const data = (await res.json().catch(() => ({}))) as {
    results?: MercadoPagoAuthorizedPaymentRecord[];
    message?: string;
  };

  if (!res.ok) {
    console.error("[mercadoPagoService] search authorized_payments error", res.status);
    throw new AppError(
      data.message ?? "No se pudo buscar cobros autorizados en MercadoPago.",
      502,
      "MP_AUTHORIZED_PAYMENT_SEARCH_FAILED",
    );
  }

  return data.results ?? [];
}

export async function getMercadoPagoPreapproval(
  preapprovalId: string,
): Promise<MercadoPagoPreapprovalRecord> {
  const token = env.mercadopago.accessToken;
  if (!token) {
    throw new AppError("MercadoPago no configurado.", 503, "MP_NOT_CONFIGURED");
  }

  const res = await fetch(`${MP_API}/preapproval/${preapprovalId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = (await res.json().catch(() => ({}))) as MercadoPagoPreapprovalRecord & {
    message?: string;
  };

  if (!res.ok) {
    console.error("[mercadoPagoService] get preapproval error", res.status);
    throw new AppError(
      data.message ?? "No se pudo consultar la suscripción en MercadoPago.",
      502,
      "MP_PREAPPROVAL_FETCH_FAILED",
    );
  }

  return data;
}
