#!/usr/bin/env python3
"""Genera landings SEO públicas para Google Ads / Search."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PAGES = [
    {
        "slug": "sms-masivos-chile",
        "title": "SMS Masivos Chile para Empresas | Plataforma Telvoice",
        "description": "Envía SMS masivos en Chile con bolsas prepago, panel web, reportes DLR y API REST. Precios por volumen, pago online y soporte local.",
        "h1": "SMS masivos en Chile para empresas",
        "lead": "Telvoice.cl es la plataforma chilena para campañas SMS A2P: compra bolsas prepago, envía desde el panel o integra vía API REST hacia operadores móviles locales.",
        "sections": [
            (
                "¿Por qué SMS masivos en Chile?",
                "<p>El SMS sigue siendo el canal con mayor tasa de lectura para alertas, cobranza, logística y marketing transaccional. Telvoice entrega mensajería A2P con numeración chilena, factura electrónica y precios escalonados por volumen.</p>",
            ),
            (
                "Qué incluye la plataforma",
                "<ul><li>Bolsas prepago desde 1.000 SMS con pago online Mercado Pago (CLP, IVA incluido).</li><li>Panel web para envío rápido, masivo y reportería DLR.</li><li>API REST para integrar CRM, ERP, e-commerce o apps propias.</li><li>Soporte comercial y documentación en español.</li></ul>",
            ),
        ],
        "faqs": [
            ("¿Cuántos SMS puedo comprar?", "Desde 1.000 SMS en la calculadora online. Para volúmenes superiores a 120.000 SMS, cotiza con nuestro equipo comercial."),
            ("¿Necesito contrato?", "Las bolsas prepago se compran online sin permanencia. Empresas con alto volumen pueden acordar condiciones comerciales."),
            ("¿Puedo enviar campañas de marketing?", "Sí, cumpliendo la normativa chilena y nuestra política de uso responsable. Consulta requisitos de opt-in y horarios."),
        ],
        "primary_cta": ("Ver precios y comprar", "/#calculadora"),
        "primary_track": "checkout_start",
        "secondary_cta": ("Hablar con ventas", "/#contacto"),
        "secondary_track": "lead_contact_form",
    },
    {
        "slug": "comprar-sms-online-chile",
        "title": "Comprar SMS Online Chile | Pago Mercado Pago | Telvoice",
        "description": "Compra bolsas SMS online en Chile con pago Mercado Pago en CLP. Activación rápida, IVA incluido y acceso al panel Telvoice.",
        "h1": "Comprar SMS online en Chile",
        "lead": "Compra tu bolsa SMS en minutos: elige cantidad, paga con Mercado Pago y activa tu cuenta con Google para empezar a enviar.",
        "sections": [
            (
                "Cómo comprar SMS online",
                "<ol><li>Usa la calculadora en telvoice.cl para elegir la cantidad de SMS.</li><li>Completa tus datos de facturación (RUT, correo, WhatsApp).</li><li>Paga en Mercado Pago con tarjeta, débito o saldo MP.</li><li>Activa tu cuenta con Google usando el mismo correo de compra.</li></ol>",
            ),
            (
                "Precios transparentes",
                "<p>Los precios publicados incluyen IVA. El costo por SMS baja a mayor volumen. No modificamos montos en checkout: pagas exactamente lo que ves en la calculadora.</p>",
            ),
        ],
        "faqs": [
            ("¿Qué medios de pago aceptan?", "Mercado Pago: tarjetas de crédito y débito, saldo MP y otros medios habilitados en Chile."),
            ("¿Cuándo se acreditan los SMS?", "Tras la aprobación del pago, la bolsa se acredita automáticamente en tu panel."),
            ("¿Emiten factura?", "Sí, con los datos de RUT y razón social que ingreses al comprar."),
        ],
        "primary_cta": ("Comprar SMS ahora", "/#calculadora"),
        "primary_track": "checkout_start",
        "secondary_cta": ("Consultar por WhatsApp", "https://wa.me/56997980116?text=Hola%2C%20quiero%20comprar%20SMS%20online"),
        "secondary_track": "whatsapp_click",
    },
    {
        "slug": "api-sms-chile",
        "title": "API SMS Chile | Integración REST | Telvoice.cl",
        "description": "Integra envío de SMS en Chile con API REST Telvoice: autenticación por API key, sandbox, webhooks DLR y documentación para desarrolladores.",
        "h1": "API SMS Chile para desarrolladores",
        "lead": "Conecta tu software, CRM o automatización con la API REST de Telvoice para enviar SMS transaccionales y campañas desde Chile hacia móviles locales.",
        "sections": [
            (
                "Capacidades de la API",
                "<ul><li>Envío unitario y masivo vía HTTPS JSON.</li><li>Ambiente sandbox para pruebas sin impacto en producción.</li><li>Webhooks de entrega (DLR) y trazabilidad por message ID.</li><li>Rate limits configurables y scopes por API key.</li></ul>",
            ),
            (
                "Casos de uso",
                "<p>Notificaciones de pedidos, OTP, alertas de seguridad, recordatorios de pago, integraciones con n8n, Zapier, backends Node/Python y apps móviles.</p>",
            ),
        ],
        "faqs": [
            ("¿Cómo obtengo una API key?", "Tras comprar una bolsa SMS y activar tu cuenta, solicita acceso API desde el panel o contacto comercial."),
            ("¿Hay ambiente de prueba?", "Sí, Telvoice ofrece keys sandbox para desarrollo antes de pasar a producción."),
            ("¿Documentación disponible?", "Documentación PDF/HTML desde el panel cliente y guías en el centro de ayuda."),
        ],
        "primary_cta": ("Solicitar acceso API", "/#contacto"),
        "primary_track": "api_interest_click",
        "secondary_cta": ("Ver documentación en ayuda", "/ayuda/"),
        "secondary_track": None,
    },
    {
        "slug": "sms-otp-chile",
        "title": "SMS OTP Chile | Verificación por SMS | Telvoice",
        "description": "Envía códigos OTP por SMS en Chile para verificación de usuarios, login 2FA y onboarding. API REST, entrega rápida y precios por volumen.",
        "h1": "SMS OTP en Chile — verificación por SMS",
        "lead": "Implementa autenticación de dos factores, verificación de registro y recuperación de cuenta con códigos OTP entregados por SMS a móviles chilenos.",
        "sections": [
            (
                "OTP confiable para apps y fintech",
                "<p>Telvoice entrega SMS transaccionales con trazabilidad DLR. Integra vía API REST desde tu backend y controla expiración, reintentos y plantillas de mensaje.</p>",
            ),
            (
                "Buenas prácticas",
                "<ul><li>Códigos de 4–6 dígitos con TTL corto (2–5 minutos).</li><li>Limitar reenvíos por número para prevenir abuso.</li><li>Mensajes claros con nombre de marca y propósito del código.</li></ul>",
            ),
        ],
        "faqs": [
            ("¿Qué latencia tiene un OTP?", "Depende del operador; en condiciones normales la entrega es en segundos dentro de Chile."),
            ("¿Puedo usar la misma bolsa SMS?", "Sí, OTP y notificaciones consumen la misma bolsa prepago Telvoice."),
            ("¿Cumple normativa?", "Debes obtener consentimiento del usuario y cumplir la Ley 19.628 y políticas de operadores."),
        ],
        "primary_cta": ("Cotizar integración OTP", "/#contacto"),
        "primary_track": "api_interest_click",
        "secondary_cta": ("Comprar bolsa SMS", "/#calculadora"),
        "secondary_track": "checkout_start",
    },
]


def faq_schema(faqs, url):
    items = []
    for q, a in faqs:
        items.append(
            {
                "@type": "Question",
                "name": q,
                "acceptedAnswer": {"@type": "Answer", "text": a},
            }
        )
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": items,
        "url": url,
    }


def render_page(p):
    base_url = f"https://www.telvoice.cl/{p['slug']}/"
    faq_html = "".join(
        f"<dt>{q}</dt><dd>{a}</dd>" for q, a in p["faqs"]
    )
    sections_html = "".join(
        f'<section class="seo-section"><h2>{title}</h2>{body}</section>'
        for title, body in p["sections"]
    )
    import json

    schema_graph = [
        {
            "@type": "Organization",
            "@id": "https://www.telvoice.cl/#organization",
            "name": "Telvoice.cl",
            "url": "https://www.telvoice.cl/",
            "logo": "https://www.telvoice.cl/assets/telvoice-isotipo.png",
        },
        {
            "@type": "Service",
            "name": p["h1"],
            "description": p["description"],
            "provider": {"@id": "https://www.telvoice.cl/#organization"},
            "areaServed": {"@type": "Country", "name": "Chile"},
            "url": base_url,
        },
        faq_schema(p["faqs"], base_url),
    ]

    def cta(label, href, track):
        attrs = f'href="{href}" class="seo-btn seo-btn--primary"'
        if track:
            attrs = f'data-seo-track="{track}" ' + attrs.replace("seo-btn--primary", "seo-btn--primary")
        cls = "seo-btn seo-btn--primary" if label == p["primary_cta"][0] else "seo-btn seo-btn--secondary"
        if href.startswith("http"):
            extra = ' target="_blank" rel="noopener noreferrer"'
        else:
            extra = ""
        track_attr = f' data-seo-track="{track}"' if track else ""
        return f'<a href="{href}" class="{cls}"{track_attr}{extra}>{label}</a>'

    primary = cta(p["primary_cta"][0], p["primary_cta"][1], p.get("primary_track"))
    secondary = cta(p["secondary_cta"][0], p["secondary_cta"][1], p.get("secondary_track"))

    schema_json = json.dumps(
        {"@context": "https://schema.org", "@graph": schema_graph},
        ensure_ascii=False,
        indent=2,
    )

    return f"""<!DOCTYPE html>
<html class="light seo-page" lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="{p['description']}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <title>{p['title']}</title>
  <link rel="canonical" href="{base_url}" />
  <link rel="icon" href="../assets/telvoice-isotipo.png" type="image/png" />
  <meta name="theme-color" content="#0052cc" />
  <meta property="og:locale" content="es_CL" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="{base_url}" />
  <meta property="og:site_name" content="Telvoice.cl" />
  <meta property="og:title" content="{p['title']}" />
  <meta property="og:description" content="{p['description']}" />
  <meta property="og:image" content="https://www.telvoice.cl/assets/telvoice-isotipo.png" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="{p['title']}" />
  <meta name="twitter:description" content="{p['description']}" />
  <script src="../js/telvoice-analytics-bootstrap.js" data-root="../"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;family=Montserrat:wght@600;700&amp;display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../css/telvoice-seo-landing.css" />
  <link rel="stylesheet" href="../css/telvoice-public-nav.css?v=20260619" />
  <link rel="stylesheet" href="../css/telvoice-site-footer.css" />
  <script type="application/ld+json">
{schema_json}
  </script>
</head>
<body class="seo-page font-body-md antialiased">
  <div id="telvoice-public-nav" data-root="../"></div>
  <script src="../js/telvoice-public-brand.js"></script>
  <script src="../js/telvoice-public-nav.js?v=20260619"></script>
  <main class="seo-main">
    <p class="seo-eyebrow">Telvoice.cl · Chile</p>
    <h1>{p['h1']}</h1>
    <p class="seo-lead">{p['lead']}</p>
    {sections_html}
    <section class="seo-section">
      <h2>Preguntas frecuentes</h2>
      <dl class="seo-faq">{faq_html}</dl>
    </section>
    <div class="seo-cta-row">{primary}{secondary}</div>
  </main>
  <div id="telvoice-site-footer" data-root="../"></div>
  <script src="../js/telvoice-seo-landing.js"></script>
  <script src="../js/telvoice-site-footer.js"></script>
</body>
</html>
"""


def main():
    for p in PAGES:
        out_dir = ROOT / p["slug"]
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "index.html").write_text(render_page(p), encoding="utf-8")
        print(f"Wrote {out_dir / 'index.html'}")


if __name__ == "__main__":
    main()
