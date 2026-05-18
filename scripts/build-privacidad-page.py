#!/usr/bin/env python3
"""Genera content/politica-de-privacidad.html y politica-de-privacidad/index.html."""

from pathlib import Path

from legal_common import render_content_fragment, render_sections
from privacidad_sections import SECTIONS

ROOT = Path(__file__).resolve().parents[1]


def render_page(content_html: str) -> str:
    return f"""<!DOCTYPE html>
<html class="light" lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="Política de privacidad y tratamiento de datos personales de Telvoice.cl para servicios de compra online de bolsas SMS, campañas, API y mensajería empresarial." />
  <title>Política de Privacidad | Telvoice.cl</title>
  <link rel="canonical" href="https://telvoice.cl/politica-de-privacidad/" />
  <link rel="icon" href="../assets/telvoice-isotipo.png" type="image/png" sizes="any" />
  <meta name="theme-color" content="#0052cc" />
  <meta property="og:locale" content="es_CL" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://telvoice.cl/politica-de-privacidad/" />
  <meta property="og:site_name" content="Telvoice" />
  <meta property="og:title" content="Política de Privacidad | Telvoice.cl" />
  <meta property="og:description" content="Política de privacidad y tratamiento de datos personales de Telvoice.cl para servicios de compra online de bolsas SMS, campañas, API y mensajería empresarial." />
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&amp;display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
  <link href="https://fonts.googleapis.com" rel="preconnect" />
  <link crossorigin href="https://fonts.gstatic.com" rel="preconnect" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&amp;family=Montserrat:wght@600;700&amp;display=swap" rel="stylesheet" />
  <script id="tailwind-config">
    tailwind.config = {{
      theme: {{
        extend: {{
          colors: {{
            primary: "#0052cc",
            background: "#faf8ff",
            surface: "#faf8ff",
            "on-background": "#131b2e",
            "on-surface-variant": "#434654",
            "on-primary": "#ffffff",
            "outline-variant": "#c3c6d6",
            "surface-container-low": "#f2f3ff",
          }},
          spacing: {{ "margin-page": "40px", "container-max": "1440px" }},
          fontFamily: {{
            h2: ["Montserrat", "sans-serif"],
            h3: ["Montserrat", "sans-serif"],
            "body-md": ["Inter", "sans-serif"],
            "body-lg": ["Inter", "sans-serif"],
            "body-sm": ["Inter", "sans-serif"],
            "label-caps": ["Montserrat", "sans-serif"],
          }},
          fontSize: {{
            h2: ["32px", {{ lineHeight: "40px", fontWeight: "600" }}],
            h3: ["24px", {{ lineHeight: "32px", fontWeight: "600" }}],
            "body-lg": ["18px", {{ lineHeight: "28px" }}],
            "body-md": ["16px", {{ lineHeight: "24px" }}],
            "body-sm": ["14px", {{ lineHeight: "20px" }}],
            "label-caps": ["12px", {{ lineHeight: "16px", fontWeight: "700" }}],
          }},
        }},
      }},
    }};
  </script>
  <link rel="stylesheet" href="../css/legal-pages.css" />
</head>
<body class="bg-background text-on-background font-body-md antialiased">
  <nav class="legal-nav bg-surface/90 backdrop-blur-md sticky top-0 z-50 border-b border-outline-variant/30 w-full">
    <div class="flex justify-between items-center gap-4 py-4 pl-8 pr-4 sm:pl-12 sm:pr-6 md:pl-20 md:pr-8 lg:pl-28 lg:pr-10 max-w-container-max mx-auto">
      <a href="../" class="flex items-center gap-2 shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="telvoice.cl, ir al inicio">
        <img src="../assets/telvoice-isotipo.png" alt="" width="36" height="36" class="h-9 w-9 object-contain" decoding="async" />
        <span class="font-h3 text-h3 font-bold tracking-tight lowercase inline-flex items-baseline">
          <span class="text-black">telvoice</span><span class="font-h3 text-body-lg font-bold hero-grad-text">.cl</span>
        </span>
      </a>
      <ul class="hidden lg:flex gap-1 items-center">
        <li><a class="font-body-md text-on-surface-variant hover:text-primary px-4 py-2 rounded-full hover:bg-surface-container-low" href="../index.html#precios">Precios</a></li>
        <li><a class="font-body-md text-on-surface-variant hover:text-primary px-4 py-2 rounded-full hover:bg-surface-container-low" href="../index.html#casos-uso">Casos de uso</a></li>
        <li><a class="font-body-md text-on-surface-variant hover:text-primary px-4 py-2 rounded-full hover:bg-surface-container-low" href="../index.html#api">API</a></li>
        <li><a class="font-body-md text-on-surface-variant hover:text-primary px-4 py-2 rounded-full hover:bg-surface-container-low" href="../index.html#empresas">Empresas</a></li>
        <li><a class="font-body-md text-on-surface-variant hover:text-primary px-4 py-2 rounded-full hover:bg-surface-container-low" href="../index.html#contacto">Contacto</a></li>
      </ul>
      <button type="button" id="menu-toggle" class="lg:hidden inline-flex items-center justify-center w-11 h-11 rounded-full border border-outline-variant/60" aria-expanded="false" aria-controls="mobile-panel" aria-label="Abrir menú">
        <span class="material-symbols-outlined" id="menu-icon-open">menu</span>
        <span class="material-symbols-outlined hidden" id="menu-icon-close">close</span>
      </button>
    </div>
    <div id="mobile-panel" class="hidden lg:hidden border-t border-outline-variant/30 bg-surface/95 py-4 pl-8 pr-4 sm:pl-12 md:pl-20 max-w-container-max mx-auto">
      <ul class="flex flex-col gap-1">
        <li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="../index.html#precios">Precios</a></li>
        <li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="../index.html#casos-uso">Casos de uso</a></li>
        <li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="../index.html#api">API</a></li>
        <li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="../index.html#empresas">Empresas</a></li>
        <li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="../index.html#contacto">Contacto</a></li>
      </ul>
    </div>
  </nav>

  <main class="legal-page">
    <article class="legal-doc mx-auto">
      <header class="legal-doc-header">
        <p class="legal-eyebrow">Documento legal</p>
        <h1>Política de Privacidad</h1>
        <p class="legal-lead">Política sobre recopilación, uso, tratamiento y protección de datos personales en Telvoice.cl.</p>
        <p class="legal-updated"><strong>Última actualización:</strong> 18 de mayo de 2026</p>
        <dl class="legal-meta">
          <div><dt>Titular del servicio</dt><dd>Telefoniachile Ltda</dd></div>
          <div><dt>RUT / Identificación tributaria</dt><dd>76.287.242-0</dd></div>
          <div><dt>Domicilio comercial</dt><dd>Av Caupolicán 222, Temuco, Chile</dd></div>
          <div><dt>Correo de contacto</dt><dd><a href="mailto:contacto@telvoice.cl">contacto@telvoice.cl</a></dd></div>
          <div><dt>Correo para asuntos legales o cumplimiento</dt><dd><a href="mailto:legal@telvoice.cl">legal@telvoice.cl</a></dd></div>
          <div><dt>Sitio web</dt><dd><a href="https://telvoice.cl/">telvoice.cl</a></dd></div>
        </dl>
      </header>
{content_html}
    </article>
  </main>

  <footer class="legal-footer bg-primary text-on-primary" role="contentinfo">
    <div class="max-w-container-max mx-auto px-4 sm:px-margin-page pt-12 pb-6">
      <div class="grid grid-cols-1 gap-10 border-b border-on-primary/20 pb-10 md:grid-cols-2 lg:grid-cols-12">
        <div class="lg:col-span-4">
          <a href="../" class="inline-flex items-center gap-2 text-on-primary" aria-label="telvoice.cl, ir al inicio">
            <img src="../assets/telvoice-isotipo.png" alt="" width="40" height="40" class="h-10 w-10 object-contain" />
            <span class="font-h3 text-h3 font-bold lowercase">telvoice<span class="text-body-lg">.cl</span></span>
          </a>
          <p class="mt-4 max-w-sm font-body-md text-on-primary/85">SMS masivos para empresas en Chile: bolsas prepago, precios por volumen, pago online y API.</p>
        </div>
        <div class="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-8">
          <div>
            <p class="font-label-caps text-label-caps uppercase tracking-wider text-on-primary/55">Telvoice.cl</p>
            <ul class="mt-4 space-y-3">
              <li><a class="text-on-primary/90 hover:text-on-primary" href="../index.html#precios">Bolsas SMS</a></li>
              <li><a class="text-on-primary/90 hover:text-on-primary" href="../index.html#api">API SMS</a></li>
              <li><a class="text-on-primary/90 hover:text-on-primary" href="../index.html#contacto">Contacto</a></li>
            </ul>
          </div>
          <div>
            <p class="font-label-caps text-label-caps uppercase tracking-wider text-on-primary/55">Legal</p>
            <ul class="mt-4 space-y-3">
              <li><a class="text-on-primary/90 hover:text-on-primary" href="../terminos-y-condiciones/">Términos y condiciones</a></li>
              <li><a class="text-on-primary font-semibold" href="./" aria-current="page">Política de privacidad</a></li>
              <li><a class="text-on-primary/90 hover:text-on-primary" href="../uso-responsable/">Uso responsable</a></li>
            </ul>
          </div>
        </div>
      </div>
      <p class="pt-8 font-body-sm text-on-primary/65">© 2026 Telvoice.cl. Todos los derechos reservados.</p>
    </div>
  </footer>
  <script src="../js/telvoice-legal-nav.js"></script>
</body>
</html>
"""


def main():
    fragment = render_content_fragment(SECTIONS, "privacidad_sections.py")
    page = render_page(fragment)
    page = page.replace("<div", "<div").replace("</div>", "</div>")

    (ROOT / "content" / "politica-de-privacidad.html").write_text(fragment, encoding="utf-8")
    (ROOT / "politica-de-privacidad" / "index.html").write_text(page, encoding="utf-8")
    print("Generated content/politica-de-privacidad.html and politica-de-privacidad/index.html")


if __name__ == "__main__":
    main()
