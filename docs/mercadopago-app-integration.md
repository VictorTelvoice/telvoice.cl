# Mercado Pago — landing vs panel /app vs numeración SIM

## Landing (telvoice.cl — Vercel)

| Pieza | Ubicación |
|-------|-----------|
| Librería | `lib/mercadopago.js` |
| Crear preferencia | `POST /api/mercadopago/create-preference` |
| Webhook | `POST/GET /api/mercadopago/webhook` |
| Forward suscripciones | `lib/mercadopago-webhook-forward.js` → agente |
| Órdenes | Vercel Blob / `data/orders/*.json` via `lib/orders.js` |
| Retorno usuario | `/pago-exitoso`, `/pago-fallido`, `/pago-pendiente` |
| Frontend checkout bolsa | `js/telvoice-app.js` → `create-preference` |
| Frontend numeración SIM | `js/numeracion-sim-page.js` → `agent.telvoice.cl/api/public/checkout` |

**Al aprobar pago bolsa (legacy blob):** orden landing → `activation_pending` + correos (no acredita `sms_orders`).

**Suscripciones SIM:** el checkout crea preapproval en el **agente**. Si MP envía el webhook a `www.telvoice.cl`, el legacy **reenvía** `subscription_preapproval` y `subscription_authorized_payment` al agente sin romper `payment` de bolsas.

## Panel cliente (agent.telvoice.cl)

| Pieza | Ubicación |
|-------|-----------|
| Preferencia / preapproval | `src/services/mercadoPagoService.ts` |
| Checkout público SIM | `src/services/publicCheckoutService.ts` |
| Webhook | `POST/GET /api/mercadopago/webhook` |
| Dispatch | `src/services/mercadoPagoWebhookDispatchService.ts` |
| Auditoría | tabla `mercadopago_webhook_logs` (migración 069) |
| Reconciliación manual | `scripts/reconcile-sim-subscription-payment.mjs` |
| Job pendientes | `scripts/reconcile-pending-sim-subscriptions.mjs` |

**Al aprobar pago panel / SIM:** `sms_orders` → paid, wallet, emails, activación numeración.

## Webhook productivo (obligatorio en MP Developers)

URL principal:

```text
https://agent.telvoice.cl/api/mercadopago/webhook
```

Topics requeridos:

- `payment`
- `subscription_preapproval`
- `subscription_authorized_payment`

### Pasos en Mercado Pago Developers

1. Ir a [Mercado Pago Developers](https://www.mercadopago.cl/developers/panel/app) → tu aplicación Telvoice producción.
2. **Webhooks** → **Configurar notificaciones**.
3. URL de producción: `https://agent.telvoice.cl/api/mercadopago/webhook`
4. Eventos / topics: marcar **Pagos**, **Planes y suscripciones** (preapproval + authorized payment).
5. Guardar y usar **Simular** para probar cada topic contra el agente.
6. Mantener `www.telvoice.cl/api/mercadopago/webhook` solo como fallback legacy (bolsas blob); las suscripciones SIM se reenvían al agente automáticamente.

## Variables de entorno

### Agente (VPS)

- `MERCADOPAGO_ACCESS_TOKEN` — obligatorio
- `PUBLIC_APP_URL=https://agent.telvoice.cl` — notification_url de preapproval
- `EMAIL_MODE=provider` + `RESEND_API_KEY` — correos reales
- `ORDER_NOTIFY_EMAIL` / `BILLING_NOTIFY_EMAIL` / `SIM_SUBSCRIPTION_NOTIFY_EMAIL` — alertas internas SIM

### Landing (Vercel)

- `MERCADOPAGO_ACCESS_TOKEN` — bolsas legacy
- `TELVOICE_AGENT_WEBHOOK_URL=https://agent.telvoice.cl/api/mercadopago/webhook` — forward defensivo suscripciones

## Flujo post-compra numeración SIM

1. Checkout landing → `POST agent.telvoice.cl/api/public/checkout` (`product_type: sim_subscription`)
2. Orden `pending` + reserva inventario + fila `sim_subscriptions`
3. MP preapproval → cliente autoriza suscripción
4. Webhooks esperados (agente o forward desde www):
   - `subscription_preapproval` → metadata authorized + reconcile primer cobro
   - `subscription_authorized_payment` → `applySimSubscriptionApprovedPayment`
   - `payment` (con `preapproval_id`) → ruta SIM en `routeMercadoPagoWebhook`
5. Resultado: orden `paid`, suscripción `active`, activación, +SMS mes 1, emails, panel

## Reconciliación operativa (fallback)

Si una suscripción queda `pending` sin webhook:

```bash
# Una orden
node scripts/reconcile-sim-subscription-payment.mjs \
  --order-id <UUID> --preapproval-id <MP_PRE> --email <checkout@email> --dry-run

node scripts/reconcile-sim-subscription-payment.mjs \
  --order-id <UUID> --preapproval-id <MP_PRE> --email <checkout@email> --apply

# Barrido últimas 72h
node scripts/reconcile-pending-sim-subscriptions.mjs --dry-run
node scripts/reconcile-pending-sim-subscriptions.mjs --apply --hours=72
```

## QA local

```bash
cd telvoice-sms-agent
npm run build
node scripts/verify-mp-webhook-agent-parse.mjs
node scripts/verify-mp-webhook-subscription-forward.mjs
node scripts/verify-sim-post-purchase-email-templates.mjs
node scripts/e2e-sim-subscription-webhook-fixture.mjs --apply   # sandbox
```

## Rollback

1. Revertir deploy agente + landing si el forward causa problemas.
2. Restaurar URL webhook en MP Developers a la configuración anterior.
3. Las órdenes ya reconciliadas **no** se revierten automáticamente; usar admin para soporte caso a caso.
4. La migración 069 es aditiva; no afecta flujos existentes si la tabla no se usa.
