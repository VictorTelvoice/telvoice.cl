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

Simula orden Felipe (email null en orden, billing en empresa).

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

## Acción manual post-deploy — Felipe Valencia

Cliente: `felipevalenciao@gmail.com`  
Company: `958688d8-0b85-4e35-9449-5dd6375fd2e4`  
Orden pagada: `33545733-7af1-4387-96e3-f5a86bc2111e`  
Orden pending (opcional cancelar): `18c8d4f3-7106-41d4-9e85-b25cc65cc906`

### 1. Marcar PROD_REAL (si el deploy no re-procesa webhook)

```sql
-- Verificar flag actual
SELECT * FROM admin_data_audit_flags
WHERE entity_type = 'company' AND entity_id = '958688d8-0b85-4e35-9449-5dd6375fd2e4';
```

Desde admin superadmin: reconciliar / marcar PROD_REAL, o ejecutar script reconcile con confirmación.

### 2. Reenviar bienvenida

Con el fix desplegado, desde admin “Reenviar bienvenida” o:

```bash
cd telvoice-sms-agent
npx tsx -e "
import { sendWelcomeAndSmsCreditedEmail } from './src/services/transactionalEmailService.ts';
const r = await sendWelcomeAndSmsCreditedEmail('33545733-7af1-4387-96e3-f5a86bc2111e', { skipIdempotency: true });
console.log(r);
"
```

El fallback usará `company.billing_email` si la orden sigue sin `checkout_email`.

### 3. Opcional — limpiar orden abandonada

Solo con aprobación admin:

```sql
UPDATE sms_orders
SET payment_status = 'cancelled',
    metadata = metadata || '{\"checkout_cancel_reason\":\"abandoned_checkout_cleanup\"}'::jsonb
WHERE id = '18c8d4f3-7106-41d4-9e85-b25cc65cc906'
  AND payment_status = 'pending';
```

---

## Rollback

Revertir commit del fix. El webhook volverá a enviar solo comprobante. No afecta créditos ya acreditados.

## Deploy

1. `npm run build` en `telvoice-sms-agent`
2. Reiniciar PM2 del agente
3. Verificar Caso A en staging o con compra QA panel
4. Ejecutar acciones manuales Felipe si la compra ya ocurrió pre-fix
