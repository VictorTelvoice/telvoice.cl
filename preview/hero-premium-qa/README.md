# QA Hero Premium — Preview local

**Rama:** `feature/hero-premium-redesign`  
**Fecha:** 2026-06-11  
**URL local:** `python3 -m http.server 8877` → http://127.0.0.1:8877/index.html  
**Script QA:** `node scripts/qa-hero-premium.mjs http://127.0.0.1:8877`

> **No desplegado a producción.** Revisar capturas antes de merge/deploy.

---

## Capturas del hero

| Viewport | Archivo |
|----------|---------|
| Desktop 1440px | `hero-desktop-1440.png` |
| Desktop 1920px | `hero-desktop-1920.png` |
| Tablet 768px | `hero-tablet-768.png` |
| Mobile 390px | `hero-mobile-390.png` |
| Viewport completo 1440 (con agente cargado) | `viewport-1440-with-float.png` |
| Viewport completo 390 (con agente cargado) | `viewport-390-with-float.png` |

## Secciones posteriores (smoke visual)

| Sección | Archivo |
|---------|---------|
| Precios / calculadora | `section-calculadora.png` |
| Casos de uso | `section-casos-uso.png` |
| API | `section-api.png` |
| Contacto | `section-contacto.png` |

---

## Checklist de validación

| # | Criterio | Resultado |
|---|----------|-----------|
| 1 | Capturas desktop 1440 / 1920 | ✅ Generadas |
| 2 | Capturas mobile 390 / tablet 768 | ✅ Generadas |
| 3 | Jerarquía: título → subtítulo → CTA → teléfono | ✅ Título navy + línea azul; subtítulo gris; CTAs bajo beneficios; teléfono a la derecha (desktop) o debajo (mobile/tablet) |
| 4 | Robot flotante discreto vs agente embebido | ✅ En primera pantalla desktop el foco está en el mockup embebido; el launcher flotante no compite en el área central del hero (esquina inferior derecha, carga async) |
| 5 | “Comprar SMS” dominante / “Hablar con agente” secundario | ✅ Primary `rgb(11,92,255)` sólido; secondary blanco + borde `#DCE7F5` |
| 6 | Teléfono profesional, no infantil | ✅ Header azul sobrio, burbujas blancas, sin gradientes saturados en chat |
| 7 | Secciones precios, casos, API, contacto, ayuda | ✅ IDs presentes y renderizan; link `ayuda/` en nav |
| 8 | Interacciones | ✅ Ver tabla abajo |
| 9 | CSS renombrado | ✅ `telvoice-type-lab.css` → `telvoice-hero-typography.css` |
| 10 | Sin conflictos CSS duplicados | ✅ Ver sección “Arquitectura CSS” |

### Interacciones (automated)

| Acción | Estado |
|--------|--------|
| Comprar SMS → scroll `#calculadora` | ✅ |
| Hablar con agente → embed/panel agente | ✅ |
| Menú Precios (toggle) | ✅ |
| Agente IA de Ventas (nav) | ✅ |
| Responsive mobile (título + teléfono visibles) | ✅ |

---

## Arquitectura CSS (sin duplicados)

| Archivo | Responsabilidad |
|---------|-----------------|
| `telvoice-hero-typography.css` | Tipografía hero, eyebrow, CTAs (scoped `.tv-type-lab`) |
| `telvoice-hero-premium.css` | Fondo/atmosphere, beneficios, nav secundario, utilidades hero |
| `telvoice-hero-agent-embed.css` | Mockup teléfono + UI agente embebido |
| `telvoice-web-agent.css` | **Solo `@import`** del bundle agente (shared, lab, light, float, embed) |
| `#tva-boot-style` (inline) | CSS crítico anti-FOUC — subset mínimo, no compite con embed |

**Orden de carga en `index.html`:** typography → premium → web-agent (embed al final del bundle).

**Eliminado:** reglas duplicadas de `.hero-phone-float--agent` en premium (definición única en embed).

---

## Cómo reproducir

```bash
cd "/Users/victor/TELVOICE CHILE"
python3 -m http.server 8877
# otra terminal:
node scripts/qa-hero-premium.mjs http://127.0.0.1:8877
```

Requiere `playwright` (dev local): `npm install --no-save playwright && npx playwright install chromium`
