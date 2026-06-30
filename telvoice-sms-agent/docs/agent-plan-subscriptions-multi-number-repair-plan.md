# Plan de reparación: multi-suscripción agente por numeración

**Estado:** diseño / no ejecutar  
**Fecha:** 2026-06-30  
**Alcance:** modelo `agent_plan_subscriptions`, activación bundle SIM+agente, caso Licantravel  
**Fuera de alcance (esta fase):** SQL de reparación, activación manual, cambios MP/wallet/webhooks

---

## 1. Resumen del problema

El producto **SIM + agente (`sim_agent_bundle`)** vende una numeración activa **y** un plan comercial del agente por compra. En producción, el modelo actual asume **como máximo una suscripción activa de agente por empresa**, no por numeración.

Consecuencias:

- Una segunda compra bundle puede activar la suscripción en la numeración nueva mientras la primera queda con SIM activa pero **sin** fila en `agent_plan_subscriptions`.
- Solicitudes `agent_plan_request` en `paid_pending_setup` pueden quedar **atascadas** si ya existe otra suscripción activa en la misma empresa.
- La UI de `/app/numeraciones` (post PR #28) muestra correctamente «Sin plan comercial» cuando no hay match por `included_number_id`; el problema es de **datos y reglas de negocio**, no de pantalla.

---

## 2. Caso Licantravel — 5513 / 3021

**Empresa:** Licantravel (`d7a134e0-59f2-4cd0-8bda-9efaf0e27688`)

### +569 3208 5513 (primera SIM)

| Campo | Valor |
|--------|--------|
| `client_numbers.id` | `acef4e67-ebda-4db8-a948-38db812127df` |
| `status` | `active` (técnico) |
| Orden pagada | `TV-MQB4Z880-38FE01` (`51ed271d-…`) |
| `product_type` | `sim_agent_bundle` |
| `plan_id` | `sim_starter` |
| `agent_plan_request` | `63717a66-…` → **`paid_pending_setup`** |
| `agent_plan_subscriptions` | **ninguna** con `included_number_id = acef4e67…` |
| Inventario | `3c35bdf7-…` → `active_assigned` |
| Último SMS | recibido (p. ej. MOVISTAR) |

### +569 8927 3021 (segunda SIM)

| Campo | Valor |
|--------|--------|
| `client_numbers.id` | `6f0f7869-1d5d-4972-983e-7e09c285f138` |
| `status` | `active` |
| Orden pagada | `TV-MQBHXN76-290BEA` (`abb46c1f-…`) |
| `agent_plan_request` | `ce7f0d15-…` → **`activated`** |
| `agent_plan_subscriptions` | `108b22ae-…` → `plan_code: start`, `status: active`, `included_number_id: 6f0f7869…` |

### Lectura operativa

- Licantravel pagó **dos bundles**; solo uno generó suscripción activa.
- La primera request nunca pasó a `activated` porque, al activarse la segunda SIM, el guard de «una suscripción por empresa» ya bloqueaba nuevas altas (o la primera activación no ejecutó `activateAdminAgentPlanRequest` a tiempo).
- Hoy **no se puede** activar manualmente la request `63717a66…` sin resolver el conflicto con la suscripción existente en 3021.

---

## 3. Regla actual (bloqueo por empresa)

### Base de datos (migración 054)

Tabla `agent_plan_subscriptions`:

- `company_id` + `included_number_id` (nullable FK a `client_numbers`)
- Índices: `(company_id)`, `(company_id, status)`
- **No hay** UNIQUE en `included_number_id` ni límite explícito en SQL de «una activa por empresa»

La restricción efectiva está en **código**.

### `activateAdminAgentPlanRequest`

Archivo: `src/services/adminAgentPlanService.ts`

```typescript
const { data: existingSub } = await sb
  .from("agent_plan_subscriptions")
  .select("id")
  .eq("company_id", request.company_id)
  .eq("status", "active")
  .maybeSingle();

if (existingSub) {
  throw new AppError("La empresa ya tiene un plan agente activo.", 409);
}
```

### Otros puntos que asumen una suscripción

| Ubicación | Comportamiento |
|-----------|----------------|
| `getActiveAgentPlanSubscription()` | `.limit(1)` por `company_id` |
| `createAgentPlanRequest()` | 409 si ya hay suscripción activa en empresa |
| `getAgentPlanStatusPayload()` / `getAgentDashboardData()` | un solo `subscription` |
| `app-agente-page.ts` | enlaza agente al número de la única suscripción |
| Activación SIM (`simActivationService.ts`) | tras activar SIM, llama `activateAdminAgentPlanRequest` si request `paid_pending_setup` |

---

## 4. Regla propuesta

### Principios

1. **Varias suscripciones activas por empresa** están permitidas (una por bundle pagado).
2. **Una numeración** (`included_number_id`) solo puede tener **como máximo una** suscripción en estado `active` o `pending`.
3. **No bloquear** por `company_id` global al activar.
4. **Sí bloquear** si `included_number_id` ya tiene suscripción activa/pending.
5. Cada `agent_plan_request` con `order_id` de bundle debe activar **su** suscripción al activarse **su** numeración, idempotente por `order_id` / `request_id`.

### Pseudoregla de activación

```
ON activateAdminAgentPlanRequest(request, includedNumberId):
  ASSERT request.status IN (pending, reviewing, approved, paid_pending_setup)
  ASSERT includedNumberId belongs to request.company_id
  IF EXISTS subscription WHERE included_number_id = includedNumberId AND status IN (active, pending):
    THROW 409 "Esta numeración ya tiene un plan agente activo."
  INSERT agent_plan_subscriptions (company_id, plan_code, included_number_id, ...)
  UPDATE agent_plan_request SET status = activated
```

### Modelo mental producto

| Concepto | Significado |
|----------|-------------|
| Estado técnico (`client_numbers.status`) | Línea SIM operativa (SMS, OTP, webhook) |
| Plan comercial (`agent_plan_subscriptions`) | Funciones/agente comercial ligadas a **esa** numeración |
| Bundle | Debe crear **ambos**, vinculados por `order_id` → request → subscription |

---

## 5. Cambios de código necesarios

### 5.1 Activación y guards

| Archivo | Cambio |
|---------|--------|
| `adminAgentPlanService.ts` | Reemplazar guard por `company_id` por guard por `included_number_id`; permitir múltiples activas por empresa |
| `clientAgentPlanService.ts` | `getActiveAgentPlanSubscription` → renombrar/ampliar a listar suscripciones activas; mantener helper `getActiveAgentPlanForNumber(companyId, numberId)` |
| `clientAgentPlanService.ts` | `createAgentPlanRequest`: no bloquear por suscripción global; opcionalmente bloquear solo solicitudes duplicadas abiertas **sin** `order_id` |
| `simActivationService.ts` | Tras activación, asegurar idempotencia: si request ya `activated`, no reintentar; si falló por 409 antiguo, reintentar tras deploy |
| `mercadoPagoWebhookService.ts` / `simSubscriptionPaymentActivationService.ts` | Revisar que cada bundle cree `agent_plan_request` **por orden** (ya idempotente por `order_id`) |

### 5.2 Lectura en panel cliente

| Archivo | Cambio |
|---------|--------|
| `clientNumberService.ts` | **Sin cambio funcional** si ya mapea por `included_number_id` (PR #28) |
| `app-agente-page.ts` | Soportar varias suscripciones o selector de numeración con plan |
| `app-planes-agente` (UI) | Copy: plan es **por numeración**, no global a la cuenta |
| Admin planes | Listado ya soporta múltiples filas; validar filtros |

### 5.3 Billing / renovación (impacto)

- Hoy `renews_at` está en cada fila de `agent_plan_subscriptions`.
- Multi-suscripción implica **N fechas de renovación** por empresa.
- **No mezclar** con `sim_subscriptions` (MP preapproval mensual SIM) sin diseño explícito.
- Decisión comercial pendiente: ¿cobro agente es por numeración en MP o solo registro interno post-bundle?

### 5.4 Reconciliadores

Auditar scripts/servicios:

- `billingPurchaseReconciliationService.ts`
- `paidPurchasePostProcessingService.ts`
- `reconcile-sim-subscription-payment.mjs` (y PR #27 webhooks MP SIM si aplica)

Verificar que no asuman «una suscripción agente» al reconciliar órdenes `sim_agent_bundle`.

---

## 6. Migración / constraint sugerida

**Nueva migración aditiva** (número tentativo `070_agent_plan_subscriptions_per_number.sql`):

```sql
-- Índice único parcial: una suscripción activa/pending por numeración
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_plan_subscriptions_one_active_per_number
  ON agent_plan_subscriptions (included_number_id)
  WHERE status IN ('active', 'pending')
    AND included_number_id IS NOT NULL;

-- Índice de consulta por numeración + empresa
CREATE INDEX IF NOT EXISTS idx_agent_plan_subscriptions_included_number
  ON agent_plan_subscriptions (included_number_id, status)
  WHERE included_number_id IS NOT NULL;
```

**Pre-migración (read-only audit):**

```sql
-- Duplicados activos por included_number_id (debe retornar 0 filas)
SELECT included_number_id, count(*) 
FROM agent_plan_subscriptions
WHERE status IN ('active', 'pending') AND included_number_id IS NOT NULL
GROUP BY included_number_id HAVING count(*) > 1;

-- Empresas con >1 activa (esperado hoy: 0; post-reparación Licantravel: 2)
SELECT company_id, count(*)
FROM agent_plan_subscriptions
WHERE status = 'active'
GROUP BY company_id HAVING count(*) > 1;
```

**Nota:** filas con `included_number_id IS NULL` siguen permitidas temporalmente; definir política (legacy) antes de producción.

---

## 7. Script de reparación propuesto (Licantravel) — NO EJECUTAR

Archivo sugerido: `scripts/repair-licantravel-first-bundle-agent-plan.mjs`

### Objetivo

Activar la request `63717a66-6a9e-4bb0-a335-1349b203b10a` (orden `TV-MQB4Z880-38FE01`) creando suscripción Start para `acef4e67-…` (+56932085513), **sin** quitar la suscripción existente en 3021.

### Precondiciones (después del cambio de código + migración)

1. Guard por `included_number_id`, no por `company_id`.
2. `acef4e67…` sin suscripción activa/pending.
3. Request en `paid_pending_setup`.
4. Orden `51ed271d…` en `payment_status = paid`.

### Pasos idempotentes (dry-run / `--apply`)

1. **Audit:** imprimir estado actual (numbers, requests, subscriptions, orders).
2. **Dry-run:** llamar lógica de `activateAdminAgentPlanRequest('63717a66…', { includedNumberId: 'acef4e67…' })` en modo simulación.
3. **Apply:** ejecutar activación real; verificar:
   - nueva fila en `agent_plan_subscriptions` con `included_number_id = acef4e67…`
   - request `63717a66…` → `activated`
   - suscripción `108b22ae…` en 3021 **sin cambios**
4. **Post-check:** `/app/numeraciones` Licantravel muestra Start en ambas cards (KPI «Con plan activo» = 2).

### Alternativa rechazada (sin multi-suscripción)

Mover `included_number_id` de 3021 → 5513 dejaría a 3021 sin plan comercial pese a su bundle pagado. **No recomendado** salvo decisión comercial explícita de cuál línea es la «principal».

---

## 8. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Duplicar suscripciones por re-ejecución de activación | Idempotencia por `order_id` en request; unique index parcial |
| UI agente asume un solo plan | Actualizar `app-agente-page` y dashboard antes de reparar datos |
| Billing cobra doble o no cobra renovaciones | Definir fuente de verdad MP vs registro interno |
| Requests `paid_pending_setup` huérfanas en otras empresas | Job de auditoría post-deploy |
| `getActiveAgentPlanSubscription` usado en API gates | Inventariar callers; no romper flujos que necesitan «cualquier plan activo» vs «plan de esta numeración» |
| Race en activación simultánea de dos SIM | Transacción + unique index |

---

## 9. Rollback

### Código

- Revertir PR de multi-suscripción; restaurar guard por `company_id`.

### Base de datos

- `DROP INDEX idx_agent_plan_subscriptions_one_active_per_number` (si se aplicó migración).
- **Reparación Licantravel:** si se creó suscripción extra `SUB_NEW`:
  - Opción conservadora: `UPDATE agent_plan_subscriptions SET status = 'cancelled' WHERE id = SUB_NEW`
  - `UPDATE agent_plan_requests SET status = 'paid_pending_setup' WHERE id = '63717a66…'` (solo si se revierte todo el intento)

Documentar en ticket cualquier cambio manual con IDs exactos.

---

## 10. QA requerido

### Automatizado

- [ ] Unit/integration: `activateAdminAgentPlanRequest` permite 2 activas misma empresa, distinto `included_number_id`
- [ ] Unit: rechaza 2 activas mismo `included_number_id`
- [ ] Flujo E2E bundle: 2 compras → 2 requests → 2 subscriptions tras 2 activaciones SIM

### Manual (staging → prod)

- [ ] Licantravel (o cuenta espejo): card 5513 muestra plan Start tras reparación
- [ ] Card 3021 conserva Start
- [ ] KPI «Con plan activo» = 2
- [ ] `/app/agente` comportamiento definido (selector o numeración por defecto)
- [ ] Admin: listado suscripciones muestra 2 filas Licantravel
- [ ] No regresión: empresa con 1 SIM sigue viendo 1 plan

### Regresión copy (PR Fase 1)

- [ ] Sin plan: badge «Sin plan comercial» + hint + CTA «Activar plan»
- [ ] Con plan: sin hint; chip plan normal

---

## 11. Decisión comercial pendiente

Antes de ejecutar reparación o migración, confirmar con producto/ops:

1. **¿Cada `sim_agent_bundle` implica obligatoriamente una suscripción agente independiente por numeración?** (recomendado: sí)
2. **¿Renovación mensual del plan agente se cobra por numeración o está incluida en SIM subscription MP?**
3. **Licantravel:** ¿reparación retroactiva sin cobro adicional (deuda de activación) o requiere validación comercial?
4. **Numeraciones legacy sin `included_number_id`:** política de regularización
5. **¿Mover plan de 3021 a 5513** descartado salvo que el cliente confirme que la segunda línea no debía incluir agente?

---

## 12. Orden de implementación recomendado

1. **Fase 1 (este PR):** copy «Sin plan comercial» — despliegue independiente, sin riesgo.
2. **Fase 2a:** migración índice + cambios `adminAgentPlanService` / tests.
3. **Fase 2b:** ajustes UI agente/planes + auditoría reconciliadores.
4. **Fase 2c:** script reparación Licantravel en dry-run prod → apply con aprobación.
5. **Fase 2d:** job auditoría global `paid_pending_setup` + empresas multi-SIM.

---

## Referencias

- Migración: `supabase/migrations/054_client_numbers_and_agent_plans.sql`
- Activación SIM: `src/services/simActivationService.ts` (~L503–509)
- Listado numeraciones: `src/services/clientNumberService.ts` (`listClientNumbersByCompany`)
- Auditoría prod 5513: `scripts/audit-licantravel-number-5513.mjs` (read-only)
