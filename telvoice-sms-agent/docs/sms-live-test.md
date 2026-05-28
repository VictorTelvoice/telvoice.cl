# SMS live_test (Etapa 10 — apertura controlada)

Envío real controlado desde `/app/send-sms` reutilizando la API **aSMSC** (`AsmscClient` → `POST /SendSMS`).

## Variables de entorno

No commitear valores reales. Configurar solo en el servidor (`.env` del VPS).

```env
# Modo global del panel
SMS_PROVIDER_MODE=mock
SMS_PROVIDER=real_api

# Habilitar opción live_test en /app (requiere mode=live_test + credenciales aSMSC)
SMS_LIVE_TEST_ENABLED=false

# Clientes retail con rate plan CL activo + live_enabled (no requieren allowlist manual)
ALLOW_RATE_PLAN_COMPANIES_TO_SEND=true

# QA/demo sin rate plan (UUIDs separados por coma). Vacío = no exige allowlist si ALLOW_RATE_PLAN…=true
SMS_LIVE_TEST_ALLOWED_COMPANY_IDS=

# Restricción de destinos en envío individual (campañas usan SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST)
SMS_LIVE_TEST_ALLOWED_NUMBERS=

# Límites operativos (Etapa 10.3)
SMS_LIVE_TEST_DAILY_LIMIT=3
SMS_LIVE_TEST_MIN_SECONDS_BETWEEN_SENDS=60
SMS_LIVE_TEST_MAX_SEGMENTS=1

# Credenciales API (ya usadas por admin/Telegram)
ASMSC_API_ID=
ASMSC_API_PASSWORD=
ASMSC_DEFAULT_SENDER_ID=TELVOICE
PUBLIC_WEBHOOK_BASE_URL=https://agent.telvoice.cl
```

| Variable | Descripción |
|----------|-------------|
| `SMS_PROVIDER_MODE` | `mock` (default) o `live_test` |
| `SMS_LIVE_TEST_ENABLED` | `true` para mostrar “Envío real controlado” en `/app` |
| `ALLOW_RATE_PLAN_COMPANIES_TO_SEND` | `true`: empresas con plan CL + `live_enabled` envían sin estar en allowlist |
| `SMS_LIVE_TEST_ALLOWED_COMPANY_IDS` | Allowlist opcional para QA/demo sin rate plan |
| `SMS_LIVE_TEST_ALLOWED_NUMBERS` | Allowlist opcional de destinos (envío individual) |
| `PUBLIC_CHECKOUT_DEFAULT_CAMPAIGNS_ENABLED` | `true` para nuevas companies retail (campañas en panel) |
| `SMS_LIVE_TEST_DAILY_LIMIT` | Máx. SMS reales por empresa por día (default 3) |
| `SMS_LIVE_TEST_MIN_SECONDS_BETWEEN_SENDS` | Intervalo mínimo entre envíos (default 60) |
| `SMS_LIVE_TEST_MAX_SEGMENTS` | Máx. segmentos por mensaje en live_test (default 1) |

## Activar live_test (solo tras confirmación operativa)

1. `ASMSC_API_ID` + `ASMSC_API_PASSWORD` configurados.
2. `SMS_PROVIDER_MODE=live_test`
3. `SMS_LIVE_TEST_ENABLED=true`
4. `ALLOW_RATE_PLAN_COMPANIES_TO_SEND=true` (producción retail). Allowlist solo para QA sin plan.
5. Opcional: `SMS_LIVE_TEST_ALLOWED_COMPANY_IDS` / `SMS_LIVE_TEST_ALLOWED_NUMBERS` para pruebas acotadas.
5. Ajustar límites si hace falta (`DAILY_LIMIT`, `MIN_SECONDS`, `MAX_SEGMENTS`).
6. Reiniciar PM2: `pm2 restart telvoice-sms-agent --update-env`

## Reglas de negocio (limitador)

Servicio: `src/services/smsLiveTestLimiterService.ts`

- Solo empresas y números en listas de env.
- 1 destinatario por envío (panel individual).
- Máx. segmentos según `SMS_LIVE_TEST_MAX_SEGMENTS`.
- Máx. envíos diarios por empresa en `/app`: solo `metadata.source=app_send_sms_live_test` (estados `sent`, `delivered`, `pending`, `accepted`). No cuenta `superadmin_provider_test`.
- Mínimo 60 s entre envíos reales por empresa.
- Empresa y wallet en estado `active`.
- Rate plan y ruta activos; proveedor no `inactive`/`suspended`.
- Débito **solo si** aSMSC acepta el mensaje.

## metadata.source

| Origen | Valor |
|--------|--------|
| Mock `/app` | `app_send_sms_mock` |
| Live test `/app` | `app_send_sms_live_test` |
| Prueba Superadmin proveedor | `superadmin_provider_test` |

## Pantallas

- `/app/send-sms` — card de límites y validaciones en cliente.
- `/admin/providers` — card “Control live_test” (sin credenciales).
- `/admin/messages` — badges MOCK / LIVE TEST / SUPERADMIN TEST y columna origen.
- `/app/reports` — KPIs mock vs live_test vs estados.

## Cola de envíos programados (scheduler automático)

Los envíos **programados** (modo «Envío programado» en `/app/send-sms`) se encolan en `sms_send_queue`.
El agente procesa la cola en segundo plano (no hace falta cron del sistema ni pulsar *process-tick* en superadmin).

```env
SMS_QUEUE_SCHEDULER_ENABLED=true
SMS_QUEUE_SCHEDULER_INTERVAL_SECONDS=60
SMS_QUEUE_SCHEDULER_BATCH_SIZE=15
```

| Variable | Descripción |
|----------|-------------|
| `SMS_QUEUE_SCHEDULER_ENABLED` | `true` (default) inicia el loop al arrancar PM2 |
| `SMS_QUEUE_SCHEDULER_INTERVAL_SECONDS` | Cada cuántos segundos revisa mensajes con `scheduled_at <= ahora` |
| `SMS_QUEUE_SCHEDULER_BATCH_SIZE` | Máximo de mensajes por tick |

Requisitos: Supabase configurado, `SMS_LIVE_TEST_ENABLED=true`, migración `016` (tabla `sms_send_queue`).

En logs del servidor: `[sms-queue] Scheduler activo` y `tick: N enviados` cuando despacha.

El tick manual en `/admin/traffic-control` sigue disponible para diagnóstico.

## Desactivar

```env
SMS_PROVIDER_MODE=mock
SMS_LIVE_TEST_ENABLED=false
SMS_QUEUE_SCHEDULER_ENABLED=false
```

Reiniciar el agente. El panel vuelve a solo simulación.
