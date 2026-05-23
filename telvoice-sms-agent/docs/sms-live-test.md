# SMS live_test (Etapa 10)

Envío real controlado desde `/app/send-sms` reutilizando la API **aSMSC** ya integrada (`AsmscClient` → `POST /SendSMS`).

## Conexión real existente

| Item | Valor |
|------|--------|
| Cliente HTTP | `src/providers/asmsc/asmsc.client.ts` |
| Servicio legacy | `src/services/sms.service.ts` → `sendTestSms()` |
| Base URL | `ASMSC_BASE_URL` (default `http://api.telvoice.net/api`) |
| Envío | `POST {baseUrl}/SendSMS` |
| Balance | `POST /CheckBalance` |
| DLR webhook | `POST /api/webhooks/asmsc/dlr` (alias `/api/webhooks/sms/dlr`) |
| Éxito submit | `status` / `Status` = `S` en respuesta |
| ID proveedor | `message_id` / `MessageID` |
| DLR | `processAsmscDlrWebhook` (legacy) + `processPanelSmsDlrFromAsmsc` (panel) |

El panel **no duplica** la integración: `realApiProvider.ts` llama a `asmscClient.sendSms`.

## Variables de entorno (agregar en servidor, no commitear valores)

```env
# Por defecto solo mock en UI
SMS_PROVIDER_MODE=mock
SMS_PROVIDER=real_api

# Habilitar opción live_test en /app (requiere también mode=live_test y credenciales aSMSC)
SMS_LIVE_TEST_ENABLED=false

# Opcional: restringir empresas (UUIDs separados por coma). Vacío = todas si enabled.
SMS_LIVE_TEST_ALLOWED_COMPANY_IDS=6cd1db92-d5c7-45e0-8548-df8907843350

# Opcional: solo estos números (+569… o 569…)
SMS_LIVE_TEST_ALLOWED_NUMBERS=+56987654321

# Credenciales API (ya usadas por admin/Telegram)
ASMSC_API_ID=
ASMSC_API_PASSWORD=
ASMSC_DEFAULT_SENDER_ID=TELVOICE
PUBLIC_WEBHOOK_BASE_URL=https://agent.telvoice.cl
```

## Activar live_test

1. `ASMSC_API_ID` + `ASMSC_API_PASSWORD` configurados.
2. `SMS_PROVIDER_MODE=live_test`
3. `SMS_LIVE_TEST_ENABLED=true`
4. (Recomendado) Restringir `SMS_LIVE_TEST_ALLOWED_COMPANY_IDS` y `SMS_LIVE_TEST_ALLOWED_NUMBERS`.
5. Reiniciar PM2.
6. Aplicar migración `013_sms_live_test_mode.sql` si no está aplicada.

## Reglas de negocio

- **Mock** sigue siendo el default.
- **live_test**: 1 destinatario, débito **solo si** aSMSC responde `S`.
- Rechazo/timeout: `failed`, **sin** `wallet_transaction`.
- Estado inicial tras aceptación: `sent` (no `delivered` simulado).
- DLR real actualiza `panel_sms_messages` vía webhook.

## Primera prueba real

Tras tu confirmación explícita:

1. Configurar env en producción como arriba.
2. Login `cliente.demo@telvoice.cl` → `/app/send-sms`.
3. Elegir **Envío real controlado**.
4. Mensaje de 1 segmento a número autorizado.
5. Verificar `provider_message_id`, `sms_debit`, inbox `live_test`, admin mensajes.
