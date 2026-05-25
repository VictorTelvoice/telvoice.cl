# Campañas masivas (hasta 200k) y SMPP vs HTTP

## Modelo actual (tras habilitación de cola masiva)

1. El usuario sube la planilla en **Enviar SMS** (modo masivo o programado).
2. El servidor **encola** en Supabase (`panel_sms_messages` + `sms_send_queue`) por lotes de 500 filas.
3. El **scheduler** (`smsQueueScheduler`) cada **1 s** toma hasta **20** mensajes y los envía al proveedor en **paralelo**.
4. El TPS efectivo lo define `company_rate_plans.max_tps` (máximo **20** en código y BD).

Tiempo teórico para 200.000 SMS a 20/s: **~2 h 47 min** de despacho (más minutos de encolado inicial).

## Variables de entorno (producción)

```bash
SMS_CAMPAIGN_ENABLED=true
SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST=true
SMS_CAMPAIGN_BULK_QUEUE_MIN_RECIPIENTS=1
SMS_CAMPAIGN_TRAFFIC_TYPE=promotional

SMS_LIVE_TEST_ENABLED=true
SMS_ENFORCE_DAILY_LIMIT=false
SMS_LIVE_TEST_DAILY_LIMIT=250000
SMS_LIVE_TEST_ALLOWED_NUMBERS=
SMS_LIVE_TEST_MIN_SECONDS_BETWEEN_SENDS=0

SMS_QUEUE_SCHEDULER_ENABLED=true
SMS_QUEUE_SCHEDULER_INTERVAL_SECONDS=1
SMS_QUEUE_SCHEDULER_BATCH_SIZE=20
```

En Superadmin: `max_tps = 20`, `live_enabled = true` (y opcional `campaigns_enabled = true`).

## ¿HTTP API o SMPP?

| | HTTP (aSMSC / actual) | SMPP |
|--|----------------------|------|
| **Estado en Telvoice** | Implementado (`realApiProvider`) | Solo tipo en BD; **sin adapter** |
| **20 SMS/s** | Viable con cola + batch 20/s | Estándar para carriers; mejor para 20–100+ TPS sostenidos |
| **Conexión** | Request/response por SMS (más overhead) | Sesión persistente (bind), menos latencia por mensaje |
| **DLR** | Webhook HTTP | `deliver_sm` en la misma sesión |
| **Complejidad** | Baja; ya operativo | Media-alta (bind, enquire_link, reconexión, throttling) |
| **Recomendación** | **Usar ahora** si el proveedor ya entrega HTTP a 20 TPS | **Fase 2** si el proveedor exige SMPP o necesitas >20–50 TPS por bind |

**Conclusión:** No es obligatorio migrar a SMPP para 20 SMS/s si tu proveedor acepta HTTP a ese ritmo. SMPP conviene cuando el contrato es SMPP-native, necesitas varios binds o quieres reducir latencia y overhead a gran escala.

## Checklist antes de 200k

- [ ] Saldo wallet ≥ 200.000 SMS
- [ ] Proveedor confirma 20 TPS sostenidos por HTTP (o planificar adapter SMPP)
- [ ] `max_tps` cliente = 20 en Supabase
- [ ] Quitar lista blanca QA (`SMS_LIVE_TEST_ALLOWED_NUMBERS` vacío)
- [ ] Supabase con plan acorde a ~400k escrituras en la ventana de campaña
- [ ] Piloto 1.000 → 10.000 → 200.000

## Límites del VPS típico (2 vCPU / 8 GB)

Suficiente como orquestador con cola. Monitorear RAM del proceso Node y latencia a Supabase.
