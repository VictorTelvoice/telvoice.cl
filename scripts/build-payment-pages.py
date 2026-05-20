#!/usr/bin/env python3
"""Genera páginas de resultado de pago Mercado Pago."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PAGES = [
    {
        "slug": "pago-exitoso",
        "title": "Pago recibido | Telvoice.cl",
        "description": "Tu pago con Mercado Pago fue recibido. Telvoice validará la compra y activará tu bolsa SMS.",
        "icon": "check_circle",
        "icon_class": "payment-icon--ok",
        "heading": "Pago recibido",
        "text": "Tu pago fue recibido correctamente. Estamos validando la compra y activando tu bolsa SMS.",
        "sub": "Recibirás la confirmación en el correo ingresado durante la compra.",
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
        "sub": None,
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
        "sub": None,
        "primary": ("Volver a precios", "../index.html#precios"),
        "secondary": ("Volver al inicio", "../"),
    },
]


def render_page(p):
    sub = f'<p class="payment-sub">{p["sub"]}</p>' if p.get("sub") else ""
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
  <link rel="canonical" href="https://telvoice.cl/{p['slug']}/" />
  <link rel="icon" href="../assets/telvoice-isotipo.png" type="image/png" />
  <meta name="theme-color" content="#0052cc" />
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&amp;display=swap" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&amp;family=Montserrat:wght@600;700&amp;display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../css/payment-pages.css" />
</head>
<body class="payment-page bg-[#faf8ff] text-[#131b2e] font-[Inter,sans-serif] antialiased">
  <header class="border-b border-[#c3c6d6]/40 bg-[#faf8ff]/95 backdrop-blur-md">
    <div class="mx-auto flex max-w-[1440px] items-center gap-2 px-4 py-4 sm:px-10">
      <a href="../" class="flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0052cc]" aria-label="telvoice.cl, inicio">
        <img src="../assets/telvoice-isotipo.png" alt="" width="36" height="36" class="h-9 w-9 object-contain" decoding="async" />
        <span class="font-[Montserrat,sans-serif] text-xl font-bold lowercase">
          <span class="text-black">telvoice</span><span class="hero-grad-text">.cl</span>
        </span>
      </a>
    </div>
  </header>
  <main class="payment-main">
    <div class="payment-card">
      <span class="payment-icon {p['icon_class']} material-symbols-outlined" aria-hidden="true">{p['icon']}</span>
      <h1 class="payment-title">{p['heading']}</h1>
      <p class="payment-text">{p['text']}</p>
      {sub}
      <div class="payment-actions">
        <a class="payment-btn payment-btn--primary" href="{primary_href}">{primary_label}</a>
        {secondary}
      </div>
    </div>
  </main>
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
