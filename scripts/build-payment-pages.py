#!/usr/bin/env python3
"""Genera páginas de resultado de pago Mercado Pago."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

HEADER = """  <header class="payment-header">
    <div class="payment-header-inner">
      <a href="../" class="payment-brand" aria-label="Telvoice.cl, inicio">
        <img src="../assets/telvoice-isotipo.png" alt="Telvoice" width="40" height="40" decoding="async" />
        <span class="payment-brand-text">Telvoice<span class="domain">.cl</span></span>
      </a>
    </div>
  </header>"""

ORDER_BLOCK = """      <div id="payment-order-summary" class="payment-order-summary" hidden></div>
      <p id="payment-return-meta" class="payment-sub" hidden></p>
      <p id="payment-email-note" class="payment-sub" hidden></p>"""

SCRIPT_TAG = '  <script src="../js/payment-return.js"></script>'

PAGES = [
    {
        "slug": "pago-exitoso",
        "title": "Pago recibido | Telvoice.cl",
        "description": "Tu pago con Mercado Pago fue recibido. Telvoice validará la compra y activará tu bolsa SMS.",
        "icon": "check_circle",
        "icon_class": "payment-icon--ok",
        "heading": "Pago recibido",
        "text": "Tu pago fue recibido correctamente. Estamos validando la compra y activando tu bolsa SMS.",
        "primary": ("Volver al inicio", "../"),
        "secondary": None,
    },
    {
        "slug": "pago-pendiente",
        "title": "Pago pendiente | Telvoice.cl",
        "description": "Tu pago con Mercado Pago está pendiente de confirmación.",
        "icon": "schedule",
        "icon_class": "payment-icon--pending",
        "heading": "Pago pendiente",
        "text": "Tu pago está siendo procesado. Te notificaremos cuando Mercado Pago confirme el resultado.",
        "primary": ("Volver al inicio", "../"),
        "secondary": None,
    },
    {
        "slug": "pago-fallido",
        "title": "Pago no completado | Telvoice.cl",
        "description": "El pago con Mercado Pago no fue completado.",
        "icon": "cancel",
        "icon_class": "payment-icon--fail",
        "heading": "El pago no fue completado",
        "text": "No pudimos confirmar el pago. Puedes intentarlo nuevamente o contactarnos para recibir ayuda.",
        "primary": ("Volver a precios", "../index.html#precios"),
        "secondary": ("Volver al inicio", "../"),
    },
]


def render_page(p):
    secondary = ""
    if p.get("secondary"):
        label, href = p["secondary"]
        secondary = (
            f'<a class="payment-btn payment-btn--secondary" href="{href}">{label}</a>'
        )
    primary_label, primary_href = p["primary"]
    return f"""<!DOCTYPE html>
<html class="light" lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="{p['description']}" />
  <title>{p['title']}</title>
  <link rel="canonical" href="https://www.telvoice.cl/{p['slug']}/" />
  <link rel="icon" href="../assets/telvoice-isotipo.png" type="image/png" />
  <meta name="theme-color" content="#0052cc" />
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&amp;display=swap" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&amp;family=Montserrat:wght@600;700&amp;display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../css/payment-pages.css" />
</head>
<body class="payment-page">
{HEADER}
  <main class="payment-main">
    <div class="payment-card">
      <span class="payment-icon {p['icon_class']} material-symbols-outlined" aria-hidden="true">{p['icon']}</span>
      <h1 id="payment-return-title" class="payment-title">{p['heading']}</h1>
      <p id="payment-return-text" class="payment-text">{p['text']}</p>
{ORDER_BLOCK}
      <div class="payment-actions">
        <a class="payment-btn payment-btn--primary" href="{primary_href}">{primary_label}</a>
        {secondary}
      </div>
    </div>
  </main>
{SCRIPT_TAG}
</body>
</html>
"""


def main():
    for p in PAGES:
        out_dir = ROOT / p["slug"]
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "index.html").write_text(render_page(p), encoding="utf-8")
        print("Wrote", out_dir / "index.html")


if __name__ == "__main__":
    main()
