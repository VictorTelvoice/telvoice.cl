# Mercado Pago — landing vs panel /app

## Landing (telvoice.cl — Vercel)

| Pieza | Ubicación |
|-------|-----------|
| Librería | `lib/mercadopago.js` |
| Crear preferencia | `POST /api/mercadopago/create-preference` |
| Webhook | `POST/GET /api/mercadopago/webhook` |
| Órdenes | Vercel Blob / `data/orders/*.json` via `lib/orders.js` |
| Retorno usuario | `/pago-exitoso`, `/pago-fallido`, `/pago-pendiente` |
| Frontend checkout | `js/telvoice-app.js` → `create-preference` |

**Al aprobar pago:** orden landing → `activation_pending` + correos (no acredita `sms_orders`).

## Panel cliente (agent.telvoice.cl)

| Pieza | Ubicación |
|-------|-----------|
| Preferencia | `src/services/mercadoPagoService.ts` → `createClientPanelCheckoutPreference` |
| Orquestación | `src/services/mercadoPagoClientPanelService.ts` |
| Webhook | `POST/GET /api/mercadopago/webhook` (solo `sms_orders` con `metadata.source=client_panel`) |
| Compra | `POST /app/buy-sms/mercadopago` |
| Retorno (solo UI) | `/app/payments/mercadopago/success|failure|pending` |

**Al aprobar pago:** `markOrderPaid` + `confirmOrderCredit` → wallet.

## Variables de entorno (agent)

Reutiliza las del landing cuando sea posible:

- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_SANDBOX`
- `MERCADOPAGO_TEST_PAYER_EMAIL`
- `PUBLIC_APP_URL` — webhook y back_urls del panel
- `PUBLIC_SITE_URL` — Telegram / referencia (no webhook panel)

Opcionales: `MERCADOPAGO_*_URL_APP`

## Webhook en producción

Configurar en Mercado Pago Developers la URL del **agente**:

`https://agent.telvoice.cl/api/mercadopago/webhook`

El landing sigue usando:

`https://www.telvoice.cl/api/mercadopago/webhook`

Cada preferencia define su propio `notification_url`.
