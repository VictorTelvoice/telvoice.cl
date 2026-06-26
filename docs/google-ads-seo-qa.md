# QA — Google Ads, GTM y SEO técnico (Telvoice.cl)

Auditoría e implementación para preparación de campañas Google Ads y SEO.

## Resumen de cambios

| Objetivo | Estado | Archivos principales |
|----------|--------|----------------------|
| Eliminar UI sandbox MP en producción | ✅ | `index.html`, `js/telvoice-app.js` |
| Bloquear endpoint diagnóstico sandbox en prod | ✅ | `api/mercadopago/integration-check.js` |
| GTM / GA4 en páginas públicas | ✅ | `js/telvoice-analytics.js`, `js/telvoice-config.js` |
| Eventos dataLayer estándar | ✅ | `js/telvoice-app.js`, `js/payment-return.js` |
| `purchase_success` en `/pago-exitoso` | ✅ | `js/payment-return.js` |
| Landings SEO | ✅ | `/sms-masivos-chile/`, `/comprar-sms-online-chile/`, `/api-sms-chile/`, `/sms-otp-chile/` |
| Sitemap / noindex pagos | ✅ | `sitemap.xml`, `pago-*/index.html` |

**No modificado (por restricción):** precios, lógica checkout productivo (`/api/public/checkout`, `create-preference`), rutas de pago MP.

---

## Configuración GTM (requerida antes de deploy)

1. Crear contenedor en [Google Tag Manager](https://tagmanager.google.com/).
2. En `js/telvoice-config.js`, asignar:

```javascript
gtmContainerId: "GTM-XXXXXXX",
```

**Alternativa sin editar archivo** (inyección en Vercel o snippet previo):

```html
<script>
  window.__TELVOICE_PUBLIC_ENV__ = { GTM_CONTAINER_ID: "GTM-XXXXXXX" };
</script>
```

3. En GTM, crear tags GA4 Event con disparadores Custom Event para:

| Evento dataLayer | Uso sugerido |
|------------------|--------------|
| `checkout_start` | Inicio checkout (Enhanced Ecommerce funnel) |
| `purchase_success` | Conversión compra (transaction_id, value, currency, sms_quantity) |
| `lead_contact_form` | Lead formulario contacto |
| `high_volume_quote` | Cotización alto volumen (agente) |
| `whatsapp_click` | Clic WhatsApp |
| `api_interest_click` | Interés API |

4. **Enhanced Conversions:** mapear `buyer_email` o `user_data.email` del evento `purchase_success` en GA4 (solo en página de éxito, post-pago aprobado).

---

## Checklist QA manual

### Mercado Pago / sandbox

- [ ] Home (`/`): modal compra **no** muestra texto de tarjetas de prueba, APRO ni `@testuser.com`
- [ ] View-source de `/` sin strings `4168`, `APRO`, `Modo prueba`, `sandbox_init_point` en HTML
- [ ] `GET /api/mercadopago/integration-check` responde **404** con `MERCADOPAGO_SANDBOX=false` (producción)
- [ ] Checkout real redirige a `init_point` / `checkout_url` de producción (no URL sandbox)

### GTM / eventos

- [ ] Tag Assistant / GTM Preview: contenedor carga en `/`, landings SEO, `/ayuda/`, `/pago-exitoso`
- [ ] Modal compra → submit válido → dataLayer `checkout_start` con `plan_id`, `sms_quantity`, `value`, `currency: CLP`
- [ ] Formulario `#lead-form` enviado → `lead_contact_form`
- [ ] Clic cotizar alto volumen → `high_volume_quote`
- [ ] Clic WhatsApp → `whatsapp_click`
- [ ] Clic CTA API → `api_interest_click`
- [ ] `/pago-exitoso?collection_status=approved&external_reference=…` → `purchase_success` con `transaction_id`, `value`, `currency`, `sms_quantity`, `buyer_email` (si API summary responde)

### SEO técnico

- [ ] Cada URL indexable tiene `<title>` único y `<meta name="description">`
- [ ] `<link rel="canonical">` apunta a `https://www.telvoice.cl/…`
- [ ] `/robots.txt` referencia sitemap
- [ ] `/sitemap.xml` incluye landings SEO y **no** incluye `#hash` ni páginas `noindex`
- [ ] `/pago-exitoso`, `/pago-fallido`, `/pago-pendiente`, `/pago-error` tienen `noindex, nofollow`
- [ ] Landings SEO tienen Open Graph y schema (`Organization`, `Service`, `FAQPage`)
- [ ] Home conserva schema existente (Organization, Product/Service, FAQ)

### Landings SEO

- [ ] `/sms-masivos-chile/` — 200, contenido, CTA a calculadora
- [ ] `/comprar-sms-online-chile/` — 200
- [ ] `/api-sms-chile/` — 200
- [ ] `/sms-otp-chile/` — 200

---

## Comandos de validación local

```bash
# Desde la raíz del repo
cd "/Users/victor/TELVOICE CHILE"

# 1. Sin referencias sandbox en HTML público (debe dar 0 en index.html)
rg -i '4168|APRO|Modo prueba|sandbox_init_point|testuser\.com|tarjeta.*prueba' index.html pago-exitoso/ sms-masivos-chile/

# 2. GTM/analytics presente en páginas clave
rg -l 'telvoice-analytics' index.html pago-exitoso/index.html ayuda/index.html sms-masivos-chile/index.html

# 3. Eventos dataLayer implementados
rg 'checkout_start|purchase_success|lead_contact_form|high_volume_quote|whatsapp_click|api_interest_click' js/

# 4. Sitemap incluye landings SEO
rg 'sms-masivos-chile|comprar-sms-online|api-sms-chile|sms-otp-chile' sitemap.xml

# 5. Pagos con noindex
rg 'noindex' pago-exitoso/index.html pago-fallido/index.html pago-pendiente/index.html pago-error/index.html

# 6. Regenerar landings SEO (si editas scripts/build-seo-landings.py)
python3 scripts/build-seo-landings.py

# 7. Servidor local (opcional)
npx --yes serve -l 3456 .
# Abrir http://localhost:3456/ y verificar dataLayer en consola:
#   dataLayer.filter(e => e.event)
```

### Validación en producción (post-deploy)

```bash
# HTML home sin sandbox
curl -sS https://www.telvoice.cl/ | rg -i '4168|APRO|Modo prueba' && echo FAIL || echo OK

# integration-check bloqueado en prod
curl -sS -o /dev/null -w '%{http_code}\n' https://www.telvoice.cl/api/mercadopago/integration-check

# robots y sitemap
curl -sS https://www.telvoice.cl/robots.txt | head
curl -sS https://www.telvoice.cl/sitemap.xml | rg 'sms-masivos-chile'

# Landings SEO
for p in sms-masivos-chile comprar-sms-online-chile api-sms-chile sms-otp-chile; do
  curl -sS -o /dev/null -w "$p: %{http_code}\n" "https://www.telvoice.cl/$p/"
done
```

---

## Pendientes operativos (fuera del diff)

- Activar `google-site-verification` en `index.html` tras crear propiedad Search Console
- Asignar `gtmContainerId` real antes de lanzar campañas Ads
- Imagen OG dedicada 1200×630 (actualmente isotipo)
- Confirmar en Vercel: `MERCADOPAGO_SANDBOX=false` en Production
