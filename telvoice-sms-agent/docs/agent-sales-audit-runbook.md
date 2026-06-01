# Runbook — Auditoría Ventas del Agente Telvoice

Guía operacional para auditar el flujo comercial del Agente Telvoice en **producción** sin pagar órdenes, sin tocar wallet y sin ejecutar envíos SMS.

---

## Contexto

El módulo **Ventas del Agente** (`/admin/agent-sales`) mide el desempeño comercial del agente en el panel cliente. Fuentes principales:

| Fuente | Qué aporta |
|--------|------------|
| **`agent_sales_events`** | Eventos: cotización, link MP, bloqueo por saldo, cotización manual |
| **`sms_orders`** | Órdenes con `metadata.source = agent_panel` |
| **Dashboard superadmin** | KPIs, filtros y tablas consolidadas |

Métricas cubiertas:

- Cotizaciones generadas (`quote_created`)
- Links MercadoPago creados o reutilizados (`payment_link_created`, `payment_link_reused`)
- Órdenes pendientes / pagadas
- Monto potencial y monto pagado
- Campañas bloqueadas por saldo insuficiente (`insufficient_balance_detected`)
- Cotizaciones manuales >120k (`manual_quote_requested`)

Migración asociada: **`053_agent_sales_events.sql`** (tabla `agent_sales_events`).

---

## Requisitos previos

- Acceso **SSH** al VPS (`agent.telvoice.cl`)
- Acceso al directorio de la app: `/var/www/telvoice-sms-agent`
- **`DATABASE_URL`** en `.env` del VPS (misma base que producción)
- **`JWT_SECRET`** en `.env` (los scripts de auditoría firman sesión cliente/admin para llamar la API)
- **`MERCADOPAGO_ACCESS_TOKEN`** en el VPS si se quiere probar **link real** (los scripts E2E llaman `https://agent.telvoice.cl`, no el Node local)
- Deploy al día con módulo agent-sales (verificar `build` en `/health`)

**Reglas durante la auditoría:**

- No pagar órdenes de prueba (salvo que se quiera acreditar saldo real a propósito)
- No tocar wallet manualmente
- No ejecutar **Confirmo** en campañas o envíos reales
- No reenviar webhooks MercadoPago
- No modificar `sms_orders` ni `wallet_transactions` a mano

---

## Entrar al VPS

```bash
ssh root@agent.telvoice.cl
cd /var/www/telvoice-sms-agent
```

(Ajustar usuario si el deploy usa otro, p. ej. el configurado en `VPS_USER` del workflow.)

Comprobar `.env` sin imprimir secretos:

```bash
grep -E '^(DATABASE_URL|JWT_SECRET|MERCADOPAGO_ACCESS_TOKEN)=' .env | sed 's/=.*/=***/'
```

---

## Verificar estado de producción

```bash
curl -s https://agent.telvoice.cl/health
npm run verify:agent-deploy
npm run verify:agent-core
```

En `/health` debe aparecer `"status":"ok"` y un `build` reciente (commit con `agent-sales` y `agentSalesMetricsService` en `dist/`).

`verify:agent-deploy` comprueba, entre otros:

- `dist/services/agent/agentSalesMetricsService.js`
- `dist/controllers/admin-agent-sales.controller.js`
- `dist/services/agent/agentCore.js` importa `agentPurchaseFlow`

---

## Migración 053 (si aplica)

```bash
npm run migrate:agent-core
```

Debe mostrar **SKIP 053** o **APPLY 053** y la tabla `agent_sales_events` debe existir.

---

## Auditoría de métricas (amplia)

```bash
npm run audit:agent-sales-prod -- --company-id <COMPANY_UUID>
```

Alternativa con variable de entorno:

```bash
export TEST_COMPANY_ID=<COMPANY_UUID>
npm run audit:agent-sales-prod
```

**Qué valida el script:**

- Tabla `agent_sales_events` y columnas de la migración 053
- Flujo vía API de producción (`https://agent.telvoice.cl/api/app/agent/chat`) cuando hay `JWT_SECRET`
- Cotización 30.000 SMS y evento `quote_created`
- Generación y reutilización de link (si MercadoPago está configurado en VPS)
- Cotización manual 150k y `manual_quote_requested`
- Bloqueo por saldo (`insufficient_balance_detected`) sin `pending_action` de envío
- Resumen de órdenes `metadata.source = agent_panel` en las últimas 2 horas

**Nota:** Si se ejecuta solo con `runAgentCore` local (sin `JWT_SECRET` o sin red a prod), los links MP **no** se generan porque el `.env` local suele no tener `MERCADOPAGO_ACCESS_TOKEN`. En VPS, usar siempre el script contra la API prod (comportamiento por defecto con `JWT_SECRET`).

---

## Auditoría E2E de link MercadoPago

```bash
npm run audit:agent-sales-link-prod -- --company-id <COMPANY_UUID>
```

**Flujo que ejecuta:**

1. Mensaje: `quiero comprar 30000 mensajes` → cotización ($249.900 con IVA) + `quote_created`
2. Mensaje: `generar link de pago` → orden `pending`, link MP real + `payment_link_created`
3. Mensaje: `generar link de pago` → reutiliza orden/link + `payment_link_reused`

**Garantías del script:**

- No paga la orden
- No acredita saldo (`wallet_transactions` tipo `purchase_credit` = 0)
- No toca webhook MercadoPago
- No toca aSMSC ni envío SMS
- Comprueba dashboard admin (HTML) si existe `SUPERADMIN_EMAIL` en `.env`

Variables útiles:

| Variable | Uso |
|----------|-----|
| `TEST_COMPANY_ID` | UUID empresa (alternativa a `--company-id`) |
| `PROD_APP_URL` | Forzar base API (default `https://agent.telvoice.cl`) |
| `LICANTRAVEL_EMAIL` | Email usuario panel (default `licantravel@gmail.com`) |

---

## Ejemplo — Licantravel

```bash
npm run audit:agent-sales-link-prod -- --company-id 259eb2a3-47a1-4788-908b-9d8986f04027
```

El UUID de Licantravel **puede cambiar** en otros entornos (staging, clon). Confirmar antes:

```sql
SELECT id, name FROM companies WHERE name ILIKE '%lican%';
```

---

## Revisar en superadmin

Abrir (con sesión superadmin):

**https://admin.telvoice.cl/admin/agent-sales**

Comprobar:

| Elemento | Qué ver |
|----------|---------|
| KPI Cotizaciones | Sube tras cotizaciones del agente |
| Links de pago | Sube tras `payment_link_created` / órdenes con checkout |
| Órdenes pendientes | Incluye órdenes `agent_panel` en `pending` |
| Monto potencial | Suma totales de órdenes agent_panel (pendientes + pagadas en rango) |
| Monto pagado | Solo sube si hubo pago real |
| Conversión | No debe subir si no hubo pagos |
| Empresa | **Licantravel** (u otra probada) en tabla / filtros |
| Filtros | **Todo** o **7 días**, empresa, estado **pending** |

Acciones seguras desde la vista: ver orden, cliente, conversación, copiar link (sin acreditar saldo desde aquí).

---

## Consultas SQL (solo lectura)

Sustituir `<COMPANY_UUID>` por el ID real.

**Eventos por tipo (empresa, últimas 24 h):**

```sql
SELECT event_type, count(*) AS n
FROM agent_sales_events
WHERE company_id = '<COMPANY_UUID>'
  AND created_at > now() - interval '24 hours'
GROUP BY event_type
ORDER BY event_type;
```

**Órdenes agent_panel recientes:**

```sql
SELECT id, payment_status, credit_status, amount, sms_quantity, created_at,
       metadata->>'source' AS source,
       metadata->>'agent_session_id' AS session_id,
       metadata->>'mercadopago_preference_id' AS preference_id
FROM sms_orders
WHERE company_id = '<COMPANY_UUID>'
  AND metadata->>'source' = 'agent_panel'
ORDER BY created_at DESC
LIMIT 10;
```

**Última orden pendiente:**

```sql
SELECT id, amount, payment_status, credit_status, created_at, metadata
FROM sms_orders
WHERE company_id = '<COMPANY_UUID>'
  AND metadata->>'source' = 'agent_panel'
  AND payment_status = 'pending'
ORDER BY created_at DESC
LIMIT 1;
```

**Verificar que no hubo acreditación por una orden de prueba:**

```sql
SELECT count(*) AS wallet_credits
FROM wallet_transactions
WHERE reference_id = '<ORDER_UUID>'::uuid
  AND type = 'purchase_credit';
```

Debe ser **0** mientras no se pague en MercadoPago.

**Eventos de una sesión de prueba:**

```sql
SELECT event_type, order_id, created_at, metadata
FROM agent_sales_events
WHERE session_id = '<SESSION_UUID>'
ORDER BY created_at;
```

---

## Seguridad

- No pagar links de prueba salvo que se quiera acreditar saldo real a propósito.
- No modificar `sms_orders` manualmente (estado de pago/crédito lo actualiza el webhook y flujos internos).
- No insertar ni borrar filas en `wallet_transactions`.
- No reenviar webhooks MercadoPago desde herramientas admin salvo procedimiento formal.
- No ejecutar **Confirmo** en campañas reales durante la auditoría.
- No imprimir `MERCADOPAGO_ACCESS_TOKEN` ni URLs completas con datos sensibles en tickets públicos.
- No commitear `.env`, credenciales ni dumps de base de datos.

---

## Troubleshooting

### A. MercadoPago no disponible

Síntoma: el agente responde que MercadoPago no está disponible; no hay `payment_link_created`.

- Revisar `MERCADOPAGO_ACCESS_TOKEN` en `.env` del **VPS**
- Reiniciar proceso: `pm2 restart telvoice-sms-agent`
- Confirmar que la prueba llama a `https://agent.telvoice.cl`, no a `localhost`

### B. `payment_link_created` no aparece

- El link debe generarse **después** de aplicar migración **053** y deploy con registro de eventos (`8867c7c` o posterior).
- Consultar `agent_sales_events` por `session_id` y `company_id`.
- Revisar logs PM2 (sección siguiente).
- Órdenes creadas antes del deploy pueden tener link en `sms_orders.metadata` pero sin evento histórico.

### C. Dashboard no muestra la orden

- Confirmar `metadata->>'source' = 'agent_panel'`.
- Ampliar filtro de fecha a **Todo** o **30 días**.
- Filtrar estado **pending** (o **all**).
- Verificar que la orden pertenece a la empresa filtrada.

### D. Deploy desincronizado

```bash
npm run verify:agent-deploy
curl -s https://agent.telvoice.cl/health | jq .
grep -l agentPurchaseFlow dist/services/agent/agentCore.js
```

Si falla, redeploy desde `main` (workflow `deploy-agent.yml`) y limpiar `dist` en VPS antes del build.

---

## Logs

```bash
pm2 logs telvoice-sms-agent --lines 150 --nostream
```

Buscar ausencia de:

- Errores SQL en `agent_sales_events`
- Errores MercadoPago no manejados
- Duplicación anómala de órdenes
- **Tokens** MP o `access_token` en texto plano
- Stack traces en respuestas al cliente

---

## Próxima fase (no implementada aún)

- **`order_paid` en webhook** como evento en `agent_sales_events`: pendiente; debe ser **idempotente** y solo si `metadata.source = agent_panel`.
- Hoy el dashboard lee pagos desde **`sms_orders.payment_status`** (y crédito desde `credit_status`).
- No implementar `order_paid` en webhook hasta validar métricas en prod con esta auditoría.

---

## Referencia rápida de scripts

| Comando | Script |
|---------|--------|
| `npm run audit:agent-sales-prod` | `scripts/audit-agent-sales-prod.mjs` |
| `npm run audit:agent-sales-link-prod` | `scripts/run-licantravel-agent-sales-link-prod.mjs` |
| `npm run test:agent-sales` | Tests unitarios de métricas (local) |
| `npm run migrate:agent-core` | Migraciones 039–053 |

Auditoría de compra general (relacionada): `node scripts/audit-agent-purchase-prod.mjs --company-id <UUID>`.

---

## Validación del runbook (desarrollo)

Tras editar este documento o los scripts:

```bash
npm run typecheck
npm run build
npm run verify:agent-deploy
npm run verify:agent-core
```
