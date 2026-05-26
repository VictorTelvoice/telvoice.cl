# Control de tráfico TPS — Etapa 11

Documentación operativa para aplicar, verificar y operar la capa de control de tráfico SMS **sin enviar SMS reales por accidente**.

Relacionado: [sms-live-test.md](./sms-live-test.md) (envío real controlado, Etapa 10).

---

## 1. Objetivo de la Etapa 11

Esta etapa agrega **hardening operativo** antes de campañas masivas o live generalizado:

| Componente | Descripción |
|------------|-------------|
| **TPS por Vendor / Proveedor** | Capacidad upstream (`sms_providers.max_tps`) |
| **TPS por Cliente / Empresa** | Lo que Telvoice permite (`company_rate_plans.max_tps`) |
| **TPS por Ruta** | Capacidad por ruta (`sms_routes.max_tps`) |
| **TPS por Rate Plan** | Política comercial base (`sms_rate_plans.default_tps`) |
| **Hard cap cliente** | `MAX_CLIENT_TPS = 20` (código + constraint BD) |
| **Cola** | Tabla `sms_send_queue` (envíos pendientes) |
| **Dashboard** | `/admin/traffic-control` |
| **Worker** | `process-tick` **manual** (Superadmin) |
| **Límites diarios/mensuales** | Por proveedor, ruta, plan y cliente |
| **Flags comerciales** | `live_enabled`, `campaigns_enabled`, `api_enabled` en `company_rate_plans` |

### Lo que esta etapa **no** hace

- No habilita **campañas masivas**.
- No activa **live** para todos los clientes.
- No **envía SMS real** automáticamente.
- No inicia un **worker automático** continuo.
- No activa **RLS**.
- No modifica **MercadoPago** ni la landing.

El envío real sigue dependiendo de `live_test` + `live_enabled` + listas de entorno (ver [sms-live-test.md](./sms-live-test.md)).

---

## 2. Migración 016

### Archivo SQL

```
telvoice-sms-agent/supabase/migrations/016_sms_traffic_controls.sql
```

### Script de aplicación

```
telvoice-sms-agent/scripts/apply-migration-016.mjs
```

### Comando

Desde `telvoice-sms-agent/` (con `DATABASE_URL` en `.env`):

```bash
node scripts/apply-migration-016.mjs
```

El script:

- Lee `DATABASE_URL` del entorno (no imprime credenciales).
- Revisa que no haya `DROP TABLE` ni activación de RLS en el SQL.
- Ejecuta la migración 016 (idempotente: `IF NOT EXISTS` donde aplica).
- Verifica columnas, tablas, constraint `max_tps <= 20` y defaults de flags.

### Qué hace la migración

| Acción | Detalle |
|--------|---------|
| `sms_providers` | Columnas TPS, concurrencia, límites diario/mensual, failure threshold |
| `sms_routes` | Columnas TPS, concurrencia, límites, failure threshold; estado `paused` |
| `sms_rate_plans` | `default_tps`, límites diario/mensual |
| `company_rate_plans` | `max_tps`, límites, `live_enabled`, `campaigns_enabled`, `api_enabled` |
| Nueva tabla | `sms_send_queue` |
| Nueva tabla | `sms_tps_counters` (soporte futuro; hoy el limitador es en memoria) |
| Constraint | `company_rate_plans_max_tps_cap`: `max_tps <= 20` |

**No:** DROP destructivo, RLS, credenciales en BD, borrado de datos.

---

## 3. Checklist pre-migración

Antes de ejecutar `node scripts/apply-migration-016.mjs`:

- [ ] Backup reciente o acceso de administrador a Supabase (proyecto correcto).
- [ ] `DATABASE_URL` en `.env` apunta al proyecto **correcto** (pooler Supabase).
- [ ] Revisar `016_sms_traffic_controls.sql`: sin `DROP TABLE`, sin `ENABLE ROW LEVEL SECURITY`.
- [ ] Confirmar que no se van a commitear credenciales (`.env` en `.gitignore`).
- [ ] Nadie está ejecutando envíos reales de prueba en paralelo.
- [ ] Entender que `live_enabled` quedará **`false` por defecto** en filas nuevas/existentes tras `ADD COLUMN`.

---

## 4. Checklist post-migración

Tras el script (o consultas en Supabase SQL Editor):

### Tablas nuevas

- [ ] `sms_send_queue` existe.
- [ ] `sms_tps_counters` existe.

### Columnas `sms_providers`

- [ ] `max_tps`
- [ ] `max_concurrent_requests`
- [ ] `daily_limit`
- [ ] `monthly_limit`
- [ ] `failure_threshold_percent`
- [ ] `auto_pause_on_failure`

### Columnas `sms_routes`

- [ ] `max_tps`
- [ ] `max_concurrent_requests`
- [ ] `daily_limit`
- [ ] `failure_threshold_percent`
- [ ] `auto_pause_on_failure`

### Columnas `sms_rate_plans`

- [ ] `default_tps`
- [ ] `daily_limit`
- [ ] `monthly_limit`

### Columnas `company_rate_plans`

- [ ] `max_tps`
- [ ] `daily_limit`
- [ ] `monthly_limit`
- [ ] `live_enabled`
- [ ] `campaigns_enabled`
- [ ] `api_enabled`

### Reglas de negocio en BD

- [ ] Constraint `company_rate_plans_max_tps_cap` activo (`max_tps <= 20`).
- [ ] `live_enabled` default **false**.
- [ ] `campaigns_enabled` default **false**.
- [ ] `api_enabled` default **false**.
- [ ] `sms_send_queue`: sin filas inesperadas (`SELECT COUNT(*) FROM sms_send_queue` → 0 salvo pruebas).

El script `apply-migration-016.mjs` automatiza la mayoría de estas comprobaciones.

---

## 5. TPS Vendor vs TPS Cliente

Son **capas independientes**. El sistema usa el **mínimo** de todas las capas activas (ver §6).

### Vendor TPS (proveedor)

| | |
|---|---|
| **Dónde** | `sms_providers.max_tps` |
| **UI** | `/admin/providers` → detalle → «Capacidad vendor» |
| **Significado** | Máximo que Telvoice puede consumir desde ese vendor/proveedor |
| **Ejemplo** | Almuqeet / aSMSC: `50` TPS (según contrato real) |

### Cliente TPS (empresa)

| | |
|---|---|
| **Dónde** | `company_rate_plans.max_tps` |
| **UI** | `/admin/wallets/:companyId` → límites comerciales |
| **Significado** | Máximo que Telvoice permite a **esa cuenta cliente** |
| **Tope absoluto** | **20 TPS** (aunque vendor, ruta o plan permitan más) |

### Regla obligatoria

> Ninguna cuenta cliente puede superar **20 TPS**, aunque el proveedor soporte 50 o 100, la ruta 20 o el rate plan 30.

Validación: constraint BD + `normalizeClientMaxTps()` / mensaje: *«El TPS máximo permitido por cuenta cliente es 20.»*

---

## 6. Cálculo effective TPS

Implementado en `smsTrafficPolicyService.ts` (`resolveTrafficPolicy`).

### Fórmula

```
effective_tps = min(
  client_max_tps,        -- company_rate_plans (cap 20)
  rate_plan_default_tps, -- sms_rate_plans.default_tps
  route_max_tps,         -- sms_routes.max_tps
  provider_max_tps,      -- sms_providers.max_tps
  platform_max_tps,      -- env SMS_PLATFORM_MAX_TPS (default 100)
  MAX_CLIENT_TPS         -- 20 (constante)
)
```

Si falta configuración en cualquier capa → **default seguro = 1 TPS**.

### Ejemplo 1

| Capa | Valor |
|------|-------|
| Proveedor | 50 |
| Ruta | 20 |
| Rate plan | 10 |
| Cliente | 5 |
| Cap | 20 |

**effective_tps = 5**

### Ejemplo 2

| Capa | Valor |
|------|-------|
| Proveedor | 100 |
| Ruta | 50 |
| Rate plan | 30 |
| Cliente | 25 (se normaliza a 20 en cliente) |
| Cap | 20 |

**effective_tps = 20**

### Variable de entorno plataforma

```env
# Tope superior de plataforma (no sustituye el cap de 20 por cliente)
SMS_PLATFORM_MAX_TPS=100
```

---

## 7. Checklist post-deploy

Después de `git push` a `main` (workflow **Deploy agent.telvoice.cl**):

### Infraestructura

- [ ] GitHub Actions → workflow deploy en **success**.
- [ ] `https://agent.telvoice.cl/health` → **200** y `status: ok`.
- [ ] PM2 / servicio del agente en línea en el VPS.

### Superadmin (sesión `victor@telvoice.net` o superadmin)

- [ ] `/admin/traffic-control` carga (cola, KPIs, effective TPS por cliente).
- [ ] `/admin/providers` muestra columna **Vendor TPS** y formulario límites (sin credenciales).
- [ ] `/admin/routes` muestra **Max TPS** y Pausar/Reanudar.
- [ ] `/admin/rate-plans` muestra **Default TPS**; detalle permite guardar TPS del plan.
- [ ] `/admin/wallets/:companyId` muestra **Cliente max TPS** (máx. 20) y flags `live_enabled` / `campaigns_enabled` / `api_enabled`.

### Panel cliente

- [ ] `/app/send-sms` sigue en **mock** si `SMS_LIVE_TEST_ENABLED=false` y/o `live_enabled=false`.
- [ ] `/app/buy-sms` sigue mostrando **MercadoPago** (sin cambios Etapa 11).

### Sitio público

- [ ] `https://telvoice.cl` o `https://www.telvoice.cl` → **200** (puede redirigir).

### No hacer en post-deploy rutinario

- [ ] **No** ejecutar `POST /admin/traffic-control/queue/process-tick` salvo cola de prueba vacía.
- [ ] **No** activar `live_enabled` en clientes reales sin aprobación explícita.

---

## 8. Comandos QA

Desde `telvoice-sms-agent/`:

```bash
npm run build
node scripts/verify-traffic-controls-qa.mjs
```

Requisitos: `DATABASE_URL` en `.env`, migración 016 aplicada, build generado en `dist/`.

### Qué valida `verify-traffic-controls-qa.mjs`

| Prueba | Esperado |
|--------|----------|
| `resolveTrafficPolicy` (Empresa Demo) | `effective_tps` calculado |
| Cap 20 | `effective_tps` nunca > 20 |
| Cliente 25 TPS en código | Normaliza / effective = 20 |
| Primer `canSendNow` | Permitido (mock) |
| Segundo intento en 1 s (TPS=1) | Bloqueado |
| Proveedor `suspended` | Bloqueado |
| Ruta `paused` | Bloqueado |
| `daily_limit` comercial | Bloquea si corresponde |
| `max_tps = 25` en BD | Rechazado por constraint |

### QA worker hardening (Etapa 7.1)

```bash
npm run build
node scripts/verify-sms-worker-hardening-qa.mjs
```

Valida attempts/max_attempts, backoff, lock por proveedor, scheduler config y logs sanitizados — **sin SMS real**.

### Scheduler para QA live controlada

En el VPS, desactivar temporalmente el procesamiento automático:

```bash
SMS_QUEUE_SCHEDULER_ENABLED=false
```

Solo entonces usar `POST /admin/traffic-control/queue/process-tick` manual. Ver estado en `/admin/traffic-control`. El deploy fuerza `SMS_QUEUE_SCHEDULER_ENABLED=true` e intervalo 60s; para QA pedir cambio operativo explícito.

### Diagnóstico IP egress (sin SMS)

```bash
node scripts/diagnose-asmsc-egress.mjs
```

Ejecutar **en el VPS** para comparar IPv4 con whitelist aSMSC.

**No** llama al proveedor real. **No** envía SMS.

---

## 9. Operación segura

| Acción | Política |
|--------|----------|
| `POST /admin/traffic-control/queue/process-tick` | Solo prueba controlada; cola vacía o mensajes de prueba explícitos |
| `live_enabled = true` | Solo empresa demo / aprobación operativa |
| `campaigns_enabled = true` | No hasta implementar campañas masivas |
| `api_enabled = true` | No hasta API pública con autenticación |
| Worker automático (cron/loop) | **No** implementado en Etapa 11 |
| Envío real | Sigue reglas [sms-live-test.md](./sms-live-test.md) + `live_enabled` |

Mensajes amigables al cliente (ej. en `/app/send-sms` con live_test):

- *«Tu cuenta tiene un límite temporal de envío…»*
- *«El límite diario de envíos reales fue alcanzado.»*
- *«La ruta SMS no está disponible temporalmente.»*

---

## 10. Configuración recomendada inicial

Valores orientativos; ajustar según contrato real con el vendor.

### Proveedor Almuqeet / aSMSC

```text
max_tps: 50          # según capacidad contractual
max_concurrent_requests: 10
daily_limit: (opcional)
```

UI: `/admin/providers/:id` → Guardar límites vendor.

### Ruta Chile Default HQ

```text
max_tps: 5 o 10      # conservador al inicio
max_concurrent_requests: 2
```

UI: `/admin/routes` (pausar/reanudar según incidentes).

### Empresa Demo

```text
max_tps: 1
live_enabled: false
campaigns_enabled: false
api_enabled: false
```

UI: `/admin/wallets/:companyId`.

### Clientes nuevos

- `max_tps` default: **1**
- Nunca mayor a **20**
- Flags en **false** hasta onboarding comercial explícito

---

## 11. Limitaciones actuales

| Limitación | Impacto | Mitigación futura |
|------------|---------|-------------------|
| Limitador TPS **en memoria** por proceso | PM2 multi-instancia no comparte contador | Redis o `sms_tps_counters` + locks |
| Worker de cola **manual** | No procesa campañas en background | Worker distribuido con cron controlado |
| Sin campañas masivas reales | Cola preparada, no usada a escala | Etapa campañas + reserva de saldo |
| Débito en cola | Opción B: descontar al aceptar proveedor | Reserva al encolar para masivos |
| Sin RLS | Aislamiento vía app + service role | Migración RLS sugerida aparte |

Documentación en código: comentarios en `smsTpsLimiterService.ts` y `smsDispatchWorkerService.ts`.

---

## 12. Próximos pasos

1. **Validar UI Superadmin** con sesión operativa (`victor@telvoice.net`).
2. **Configurar Vendor TPS** real (Almuqeet según contrato).
3. **Configurar Cliente TPS** demo (1 TPS; flags en false).
4. **Ejecutar QA** (`verify-traffic-controls-qa.mjs`) tras cada cambio relevante de límites.
5. **Solo entonces** valorar `live_enabled=true` en empresa demo + variables live_test ([sms-live-test.md](./sms-live-test.md)).
6. **Más adelante:** limitador distribuido (Redis).
7. **Después:** campañas masivas con reserva de saldo al encolar.

---

## Referencia rápida de archivos

| Archivo | Rol |
|---------|-----|
| `supabase/migrations/016_sms_traffic_controls.sql` | Esquema BD |
| `scripts/apply-migration-016.mjs` | Aplicar + verificar migración |
| `scripts/verify-traffic-controls-qa.mjs` | QA sin SMS real |
| `src/services/smsTrafficPolicyService.ts` | `resolveTrafficPolicy`, effective TPS |
| `src/services/smsTpsLimiterService.ts` | `canSendNow`, ventana 1 s |
| `src/services/smsQueueService.ts` | Cola |
| `src/services/smsDispatchWorkerService.ts` | `processQueueTick` manual |
| `src/services/smsTrafficMetricsService.ts` | Dashboard |
| `src/constants/sms-traffic.ts` | `MAX_CLIENT_TPS = 20` |

---

*Última actualización: Etapa 11 — control de tráfico TPS, colas y hardening operativo.*
