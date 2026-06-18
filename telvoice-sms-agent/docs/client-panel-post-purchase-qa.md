# QA — Post-compra panel cliente MercadoPago

Fix: alinear flujo panel con landing (bienvenida + PROD_REAL + email en orden).

## Casos de prueba

### Caso A — Cliente nuevo compra desde panel

**Precondición:** usuario autenticado con `billing_email` válido.

| Verificación | Esperado |
|---|---|
| Orden creada | `checkout_email` y `payer_email` poblados |
| Pago MP approved | `payment_status=paid`, `credit_status=credited` |
| Wallet | +N SMS una sola vez (`purchase_credit` único) |
| Comprobante | `billing_email_logs` tipo `purchase_receipt`, status `sent` |
| Bienvenida | `email_logs` template `welcome_sms_credited`, status `sent` |
| Auditoría | `admin_data_audit_flags` company + order → `PROD_REAL` |
| Admin lista | No muestra `REVIEW_REQUIRED` inferido |

**Logs esperados:**
- `client_panel_post_credit.completed` con `welcomeSent: true`, `prodRealMarked: true`

---

### Caso B — Webhook duplicado

Reenviar el mismo webhook MP `approved` para la misma orden.

| Verificación | Esperado |
|---|---|
| Crédito wallet | Sin duplicado |
| Comprobante | `email_skipped` o idempotente |
| Bienvenida | `welcomeSkipped: true` si ya enviada |
| PROD_REAL | Upsert idempotente, sin error |

---

### Caso C — Orden legacy sin `checkout_email` pero con `company.billing_email`

Simula orden panel con email null en orden y `billing_email` en empresa.

| Verificación | Esperado |
|---|---|
| `resolveTransactionalRecipient` | `source: company.billing_email` |
| Bienvenida manual / webhook retry | Enviada a billing_email |
| Backfill | `checkout_email` actualizado en orden |

---

### Caso D — Checkout abandonado + compra pagada

Dos órdenes mismo `company_id`: una `pending`, una `paid/credited`.

| Verificación | Esperado |
|---|---|
| Admin “Pagadas 1/2” | Correcto (1 paid / 2 total) |
| Wallet | Solo crédito de orden pagada |
| Envío SMS | No bloqueado por orden pending |

**Propuesta (no implementada):** etiquetar pending >24h como “checkout abandonado” en admin.

---

### Caso E — API inactiva retail

| Verificación | Esperado |
|---|---|
| `api_enabled` | `false` |
| `campaigns_enabled` | `true` |
| Envío panel campañas | Permitido con saldo |

---

### Caso F — Cliente nuevo compra desde landing (www.telvoice.cl)

**Precondición:** correo nuevo, sin cuenta previa en Telvoice.

| Verificación | Esperado |
|---|---|
| Pago MP approved | Webhook acredita sin intervención admin |
| Empresa | Creada `active` con `billing_email` del checkout |
| Wallet | SMS acreditados al instante |
| Rate plan | Plan retail asignado |
| Auditoría | `PROD_REAL` en company + order |
| Login Google (mismo email) | Saldo visible; sin empresa duplicada vacía |
| Panel | Puede enviar campañas con saldo (API retail puede seguir inactiva) |

**Logs esperados:** `landing_post_credit.completed` con `prodRealMarked: true`, `profilesRelinked` ≥ 0.

---

## Acción manual post-deploy — cliente pre-fix

Para compras panel acreditadas **antes** del deploy (sin bienvenida automática):

1. Verificar `admin_data_audit_flags` de la empresa/orden; marcar `PROD_REAL` si aplica.
2. Reenviar bienvenida desde admin o con `sendWelcomeAndSmsCreditedEmail(orderId)` usando fallback `company.billing_email`.
3. No reenviar comprobante si `billing_email_logs` ya registra `purchase_receipt` enviado.
4. API: si el cliente no guardó el secret al crear la key, indicar regenerar desde **Panel → API** (el secreto solo se muestra una vez).

Variables requeridas en el entorno de ejecución: `DATABASE_URL`, credenciales Resend, etc. Usar IDs de orden/empresa desde admin; no hardcodear en scripts del repo.

---

## Rollback

Revertir commit del fix. El webhook volverá a enviar solo comprobante. No afecta créditos ya acreditados.

## Deploy

1. `npm run build` en `telvoice-sms-agent`
2. Reiniciar PM2 del agente
3. Verificar Caso A en staging o con compra QA panel
4. Ejecutar acciones manuales post-deploy para compras pre-fix si aplica
