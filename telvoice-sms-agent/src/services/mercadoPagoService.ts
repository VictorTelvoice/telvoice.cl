import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

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
