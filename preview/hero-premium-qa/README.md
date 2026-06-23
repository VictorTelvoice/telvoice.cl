# QA scroll — landing telvoice.cl

Script **read-only** para repetir el QA automatizado de fluidez de scroll (commit de referencia `2b45dd9`). No forma parte del build ni del runtime del sitio.

## Requisitos

- Node.js 18+
- Chromium de Playwright (solo en tu máquina, no en Vercel)

```bash
npm install playwright-core@1.49.0 --no-save
npx playwright-core install chromium
```

## Comando

Desde la raíz del repo:

```bash
node scripts/qa-scroll-browser-only.mjs
```

Opcional — otra URL (preview/staging):

```bash
QA_BASE_URL="https://tu-preview.vercel.app/" node scripts/qa-scroll-browser-only.mjs
```

## Qué valida

| Check | Mobile 390px | Desktop 1440px |
|-------|--------------|----------------|
| Consola sin errores JS | ✓ | ✓ |
| Hero slider: altura estable al autoplay | ✓ | ✓ |
| Hero slider: avanza de slide | ✓ | ✓ |
| Agente embebido del hero (`tva-root--ready`) | ✓ | ✓ |
| Agente flotante oculto vía `localStorage` | escenario aparte | — |
| Embed del hero sigue activo con flotante oculto | ✓ | — |
| CTAs: Comprar SMS, Hablar con el agente | ✓ | ✓ |
| CTAs slide 2: Solicitar número, Ver casos | ✓ | ✓ |
| Toggle agente presente en header | ✓ | ✓ |
| Scroll hero → footer (sin crash) | ✓ | ✓ |

## Salida

- `qa-reports/scroll-browser-YYYY-MM-DD/report.json` — resultado estructurado
- `qa-reports/scroll-browser-YYYY-MM-DD/*-footer.png` — captura al llegar al footer
- Exit code `0` = todo OK, `1` = algún check falló

## No cubre (validación manual)

- iPhone Safari / Android Chrome en dispositivo real
- Grabación de video de scroll
- Lighthouse (usar Chrome DevTools aparte)

## Pendiente conocido (fuera de este QA)

El toggle del agente en header hoy **minimiza** al menú; el comportamiento deseado (Ocultar/Mostrar agente con persistencia clara) se abordará en un commit separado post-cierre de scroll.
