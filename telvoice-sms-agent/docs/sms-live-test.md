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

# Lista obligatoria para apertura controlada (UUIDs separados por coma). Vacío = ninguna empresa.
SMS_LIVE_TEST_ALLOWED_COMPANY_IDS=

# Lista obligatoria de destinos (+569…). Vacío = ningún número.
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
| `SMS_LIVE_TEST_ALLOWED_COMPANY_IDS` | Empresas autorizadas (obligatorio si live está activo) |
| `SMS_LIVE_TEST_ALLOWED_NUMBERS` | Números destino autorizados |
| `SMS_LIVE_TEST_DAILY_LIMIT` | Máx. SMS reales por empresa por día (default 3) |
| `SMS_LIVE_TEST_MIN_SECONDS_BETWEEN_SENDS` | Intervalo mínimo entre envíos (default 60) |
| `SMS_LIVE_TEST_MAX_SEGMENTS` | Máx. segmentos por mensaje en live_test (default 1) |

## Activar live_test (solo tras confirmación operativa)

1. `ASMSC_API_ID` + `ASMSC_API_PASSWORD` configurados.
2. `SMS_PROVIDER_MODE=live_test`
3. `SMS_LIVE_TEST_ENABLED=true`
4. Definir `SMS_LIVE_TEST_ALLOWED_COMPANY_IDS` y `SMS_LIVE_TEST_ALLOWED_NUMBERS`.
5. Ajustar límites si hace falta (`DAILY_LIMIT`, `MIN_SECONDS`, `MAX_SEGMENTS`).
6. Reiniciar PM2: `pm2 restart telvoice-sms-agent --update-env`

## Reglas de negocio (limitador)

Servicio: `src/services/smsLiveTestLimiterService.ts`

- Solo empresas y números en listas de env.
- 1 destinatario por envío (panel individual).
- Máx. segmentos según `SMS_LIVE_TEST_MAX_SEGMENTS`.
- Máx. envíos diarios por empresa (`mode=live_test`, estados `sent`, `delivered`, `pending`, `accepted`).
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

## Desactivar

```env
SMS_PROVIDER_MODE=mock
SMS_LIVE_TEST_ENABLED=false
```

Reiniciar el agente. El panel vuelve a solo simulación.
