# Webhook Telsim.io (SMS entrantes)

## URL para configurar en telsim.io

**Método:** `POST`

```
https://agent.telvoice.cl/api/webhooks/telsim/sms
```

También puedes consultar la URL con `GET` en el mismo path (respuesta JSON).

## Variables de entorno (servidor)

```env
PUBLIC_WEBHOOK_BASE_URL=https://agent.telvoice.cl
TELSIM_WEBHOOK_SECRET=<secret desde telsim.io>
```

Opcional (solo desarrollo):

```env
TELSIM_WEBHOOK_SKIP_VERIFY=true
```

## Números de prueba y slots

En `TELVOICE_VERIFY_NUMBERS`, el cuarto segmento es el `slot_id` de telsim:

```
+56974713166:Linea QA 1 telsim:—:slot-id-1|+56977109623:Linea QA 2 telsim:—:slot-id-2|+56934449937:Linea QA 3 telsim:—:slot-id-3
```

## Migración de base de datos

Ejecutar `supabase/migrations/018_telsim_inbound.sql` (tabla `telsim_inbound_sms`).

## Verificación de firma

Telsim envía `X-Telsim-Signature: hex(hmac-sha256(JSON.stringify(body), TELSIM_WEBHOOK_SECRET))`.

El endpoint responde `200` con `{ ok, stored, verification_code, ... }` en menos de 5 segundos.

## Panel cliente

En `/app/send-sms`, la sección **Verificación telsim.io** muestra la URL copiable y el último SMS entrante por `slot_id` en la vista previa del teléfono.
