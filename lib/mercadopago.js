const MP_API = "https://api.mercadopago.com";

function getAccessToken() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN no configurado.");
  }
  return token;
}

export function siteUrl() {
  const url = (process.env.PUBLIC_SITE_URL || "https://www.telvoice.cl").replace(/\/$/, "");
  return url;
}

export function isSandbox() {
  return process.env.MERCADOPAGO_SANDBOX === "true";
}

function payerPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("569") && digits.length >= 11) {
    return { area_code: "9", number: digits.slice(3) };
  }
  if (digits.startsWith("56") && digits.length >= 11) {
    return { area_code: digits.slice(2, 3), number: digits.slice(3) };
  }
  if (digits.startsWith("9") && digits.length === 9) {
    return { area_code: "9", number: digits.slice(1) };
  }
  return { area_code: "", number: digits.slice(-8) };
}

export async function createCheckoutPreference({ order, plan, itemTitle }) {
  const base = siteUrl();
  const token = getAccessToken();

  const body = {
    items: [
      {
        title: itemTitle,
        quantity: 1,
        currency_id: "CLP",
        unit_price: plan.total_amount,
      },
    ],
    payer: (() => {
      const payer = {
        email: order.customer.email,
        name: order.customer.name,
      };
      const phone = payerPhone(order.customer.phone);
      if (phone) payer.phone = phone;
      return payer;
    })(),
    statement_descriptor: "Telvoice SMS",
    external_reference: order.id,
    metadata: {
      order_id: order.id,
      plan_id: plan.plan_id,
      plan_name: plan.name,
      sms_quantity: String(plan.sms_quantity),
      net_amount: String(plan.net_amount),
      tax_amount: String(plan.tax_amount),
      total_amount: String(plan.total_amount),
      source: "telvoice.cl",
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

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[mercadopago] create preference error", res.status, data);
    throw new Error(data.message || "No se pudo crear la preferencia de pago.");
  }

  return data;
}

export async function getPayment(paymentId) {
  const token = getAccessToken();
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[mercadopago] get payment error", res.status, data);
    throw new Error(data.message || "No se pudo consultar el pago.");
  }
  return data;
}

export function checkoutRedirectUrl(preference) {
  if (isSandbox()) {
    return preference.sandbox_init_point || preference.init_point;
  }
  return preference.init_point;
}
