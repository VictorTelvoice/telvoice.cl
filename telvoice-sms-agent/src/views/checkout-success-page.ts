import { escapeHtml } from "../utils/html.js";
import type { CheckoutSuccessPageData } from "../services/checkoutSuccessService.js";

function summaryRow(label: string, value: string | null, total = false): string {
  if (!value) {
    return "";
  }
  const rowClass = total ? ' class="row row--total"' : ' class="row"';
  return `<div${rowClass}><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function renderOrderSummary(data: CheckoutSuccessPageData): string {
  const s = data.summary;
  if (!s) {
    return "";
  }

  const rows = [
    summaryRow("Producto", s.packageName),
    summaryRow("SMS incluidos", `${s.formatted.sms} mensajes`),
    summaryRow("Neto", s.formatted.net),
    summaryRow("IVA (19%)", s.formatted.tax),
    summaryRow("Total pagado", s.formatted.total, true),
    summaryRow("Correo de compra", s.customerEmail),
    summaryRow("Orden", s.orderRef),
    summaryRow(
      "Pago MP",
      data.mpPaymentId || s.mpPaymentId,
    ),
  ].filter(Boolean);

  if (!rows.length) {
    return "";
  }

  return `
    <div class="payment-order-summary">
      <h2>Lo que compraste</h2>
      <dl>${rows.join("")}</dl>
    </div>`;
}

function renderActivationBox(data: CheckoutSuccessPageData): string {
  const email = data.summary?.customerEmail;
  const emailText = email
    ? escapeHtml(email)
    : "el correo que ingresaste al comprar";

  if (data.activationHint === "panel") {
    return `
    <div class="payment-account-box">
      <h2 class="payment-account-box__title">Tu cuenta está lista</h2>
      <p class="payment-account-box__text">
        Ya activaste tu cuenta. Inicia sesión en el panel para usar tus SMS.
      </p>
      <a class="payment-btn payment-btn--primary" href="${escapeHtml(data.appUrl)}/login">
        Ir al panel
      </a>
    </div>`;
  }

  const claimButton =
    data.activationHint === "claim_button" && data.claimUrl
      ? `<a class="payment-btn payment-btn--primary" href="${escapeHtml(data.claimUrl)}">Activar cuenta con Google</a>`
      : "";

  const stepsBlock = `
      <ol class="payment-steps" style="margin:0 0 1rem;padding-left:0">
        <li><span class="payment-steps__num">1</span><span>Validamos tu compra y asignamos tu bolsa de mensajes.</span></li>
        <li><span class="payment-steps__num">2</span><span>Configuramos tu cuenta en la plataforma Telvoice.</span></li>
        <li><span class="payment-steps__num">3</span><span>Te enviamos al correo de la compra el enlace para activar tu cuenta con Google.</span></li>
      </ol>`;

  const emailHint = `<p class="payment-sub" style="margin:0 0 1rem;text-align:left">
          Te enviamos al correo de la compra (<strong>${emailText}</strong>) el enlace para activar tu cuenta con Google.
          Revisa también la carpeta de spam.
        </p>`;

  return `
    <div class="payment-account-box">
      <h2 class="payment-account-box__title">Estamos creando tu cuenta</h2>
      <p class="payment-account-box__text">
        Para usar tus SMS, activa tu cuenta con Google usando el mismo correo con el que compraste.
      </p>
      ${stepsBlock}
      ${emailHint}
      ${claimButton}
    </div>`;
}

function resolveHeadline(data: CheckoutSuccessPageData): {
  title: string;
  text: string;
  iconClass: string;
  confirmLayout: boolean;
} {
  if (data.confirmingPayment) {
    return {
      title: "Estamos confirmando tu pago",
      text: "Mercado Pago aprobó tu pago. En unos minutos recibirás el correo de activación con Google en el email de la compra.",
      iconClass: "payment-icon--pending",
      confirmLayout: true,
    };
  }

  const approved =
    data.mpStatus === "approved" ||
    data.summary?.paymentStatus === "paid";

  if (approved) {
    return {
      title: "¡Compra confirmada!",
      text: "Mercado Pago aprobó tu pago. Estamos preparando la activación de tu cuenta y la carga de tu bolsa SMS.",
      iconClass: "payment-icon--ok",
      confirmLayout: true,
    };
  }

  if (
    data.mpStatus === "pending" ||
    data.mpStatus === "in_process"
  ) {
    return {
      title: "Pago pendiente",
      text: "Tu pago está en proceso. Cuando Mercado Pago lo confirme, activaremos tu bolsa automáticamente.",
      iconClass: "payment-icon--pending",
      confirmLayout: false,
    };
  }

  if (
    data.mpStatus === "rejected" ||
    data.mpStatus === "failure" ||
    data.mpStatus === "cancelled"
  ) {
    return {
      title: "Pago no confirmado",
      text: "Mercado Pago no aprobó el pago. Puedes volver a intentarlo desde la sección de precios.",
      iconClass: "payment-icon--fail",
      confirmLayout: false,
    };
  }

  return {
    title: "Estado de tu compra",
    text: "Estamos verificando el pago con Mercado Pago. Si ya pagaste, revisa tu correo de activación en unos minutos.",
    iconClass: "payment-icon--pending",
    confirmLayout: Boolean(data.summary),
  };
}

export function renderCheckoutSuccessPage(
  data: CheckoutSuccessPageData,
): string {
  const headline = resolveHeadline(data);
  const cardClass = headline.confirmLayout
    ? "payment-card payment-card--confirm"
    : "payment-card";
  const bodyClass = headline.confirmLayout
    ? "payment-page payment-page--confirm"
    : "payment-page";

  const summaryHtml = renderOrderSummary(data);
  const activationHtml =
    headline.confirmLayout || data.summary || data.confirmingPayment
      ? renderActivationBox(data)
      : "";

  const metaParts: string[] = [];
  if (data.summary?.orderRef) {
    metaParts.push(`Orden: ${data.summary.orderRef}`);
  } else if (data.publicCheckoutRef) {
    metaParts.push(`Referencia: ${data.publicCheckoutRef}`);
  }
  if (data.mpPaymentId) {
    metaParts.push(`Pago MP: ${data.mpPaymentId}`);
  }
  const metaHtml = metaParts.length
    ? `<p class="payment-sub">${escapeHtml(metaParts.join(" · "))}</p>`
    : "";

  return `<!DOCTYPE html>
<html class="light" lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex" />
  <title>${escapeHtml(headline.title)} | Telvoice</title>
  <link rel="icon" href="/assets/telvoice-isotipo.png" type="image/png" />
  <meta name="theme-color" content="#0052cc" />
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&amp;display=swap" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&amp;family=Montserrat:wght@600;700&amp;display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/checkout-success.css" />
</head>
<body class="${bodyClass}">
  <header class="payment-header">
    <div class="payment-header-inner">
      <a href="${escapeHtml(data.publicSiteUrl)}/" class="payment-brand" aria-label="Telvoice.cl, inicio">
        <img src="/assets/telvoice-isotipo.png" alt="Telvoice" width="40" height="40" decoding="async" />
        <span class="payment-brand-text">Telvoice<span class="domain">.cl</span></span>
      </a>
    </div>
  </header>
  <main class="payment-main">
    <div class="${cardClass}">
      <span class="payment-icon ${headline.iconClass} material-symbols-outlined" aria-hidden="true">check_circle</span>
      <h1 class="payment-title">${escapeHtml(headline.title)}</h1>
      <p class="payment-text">${escapeHtml(headline.text)}</p>
      ${summaryHtml}
      ${metaHtml}
      ${activationHtml}
      <div class="payment-actions">
        <a class="payment-btn payment-btn--primary" href="${escapeHtml(data.appUrl)}/login">Ir al panel / Iniciar sesión</a>
        <a class="payment-btn payment-btn--secondary" href="${escapeHtml(data.publicSiteUrl)}/ayuda/">Centro de ayuda</a>
        <a class="payment-btn payment-btn--secondary" href="${escapeHtml(data.publicSiteUrl)}/">Volver al inicio</a>
      </div>
    </div>
  </main>
</body>
</html>`;
}
