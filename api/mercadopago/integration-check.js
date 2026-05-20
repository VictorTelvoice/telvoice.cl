import {
  getAccountInfo,
  isSandbox,
  credentialsLookLikeTest,
} from "../../lib/mercadopago.js";

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body, null, 2));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Método no permitido." });
  }

  try {
    const account = await getAccountInfo();
    const sandboxEnv = isSandbox();
    const mismatch = sandboxEnv && !account.is_test_user;

    const testPayerEmail = (process.env.MERCADOPAGO_TEST_PAYER_EMAIL || "").trim();

    return json(res, 200, {
      ok: true,
      sandbox_env: sandboxEnv,
      collector_id: account.id,
      test_payer_email_configured: Boolean(testPayerEmail),
      test_payer_email_hint: testPayerEmail || "Configure MERCADOPAGO_TEST_PAYER_EMAIL con el email del Comprador de prueba (Cuentas de prueba → Comprador).",
      account,
      diagnosis: mismatch
        ? "MISMATCH_SELLER_PRODUCTION"
        : sandboxEnv
          ? "OK_SANDBOX"
          : "PRODUCTION_MODE",
      message: mismatch
        ? "El Access Token en Vercel pertenece a una cuenta REAL (vendedor producción), pero el checkout usa sandbox. Por eso Mercado Pago muestra «una de las partes es de prueba». Cree una cuenta de prueba VENDEDOR en Developers → Cuentas de prueba y use las credenciales de esa aplicación de prueba, o pida a MP migrar el cobrador de la app a la cuenta test."
        : sandboxEnv
          ? "La cuenta vendedora es de prueba y coincide con MERCADOPAGO_SANDBOX=true. Para pagar, use la cuenta COMPRADOR de prueba (Developers → Cuentas de prueba → Comprador) o tarjeta de prueba con titular APRO sin sesión real de Mercado Pago."
          : "Modo producción. Use credenciales de Producción y init_point (no sandbox).",
      test_buyer_help:
        "Developers → Tus integraciones → su app → Cuentas de prueba → Comprador: use ese usuario/clave en el checkout sandbox, o incógnito + tarjeta 4168818844447115 titular APRO.",
    });
  } catch (err) {
    console.error("[integration-check]", err);
    return json(res, 500, {
      ok: false,
      error: err.message || "No se pudo verificar la integración.",
    });
  }
}
