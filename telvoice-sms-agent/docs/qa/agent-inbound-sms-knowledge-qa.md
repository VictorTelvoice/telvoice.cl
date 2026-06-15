# QA — Knowledge SMS entrantes (Fase 1 agente panel)

Migración: `supabase/migrations/060_agent_inbound_sms_knowledge.sql`  
Canal de prueba: **panel cliente** (`web_client`) — asistente flotante en `/app` con sesión autenticada.  
Requisito: migración aplicada en el entorno de prueba (staging/local), **no producción**.

## Cómo probar

1. Aplicar migración `060` en Supabase de staging.
2. Iniciar sesión en `https://agent.telvoice.cl/app` (o local).
3. Abrir el asistente del panel.
4. Enviar cada pregunta de la tabla siguiente.
5. Verificar que la respuesta cite el artículo correcto o su contenido (knowledge match).

El agente resuelve por búsqueda en `knowledge_articles` cuando la intención no cae en un flujo operativo existente (saldo, envíos, etc.).

---

## Preguntas y respuesta esperada

| # | Pregunta de prueba | Respuesta esperada (contenido clave) |
|---|-------------------|-------------------------------------|
| 1 | ¿Dónde veo los SMS que me responden? | Indicar **/app/sms-inbox** (SMS entrantes / bandeja SMS entrantes). No redirigir solo a /app/inbox. |
| 2 | ¿La bandeja es lo mismo que SMS entrantes? | **No.** /app/inbox = envíos salientes y DLR. /app/sms-inbox = SMS entrantes recibidos. |
| 3 | ¿Qué diferencia hay entre enviado, entregado y recibido? | Saliente enviado/entregado + DLR en bandeja saliente. **Recibido** = SMS entrante hacia numeración Telvoice. |
| 4 | ¿Puedo recibir respuestas de mis campañas? | Sí, si hay numeración activa habilitada; respuestas en /app/sms-inbox. Matices sobre remitente/numeración según caso. |
| 5 | ¿Puedo usar una SIM real para recibir SMS? | Sí, SIM real con numeración móvil activa en Mis numeraciones; mensajes en /app/sms-inbox. |
| 6 | ¿El agente puede mostrarme mis últimos SMS recibidos? | **No todavía** de forma dinámica; orientar a /app/sms-inbox. No inventar listado de mensajes. |
| 7 | ¿Puedes responder este SMS por mí? | **No** en esta fase; no puede responder sin función habilitada y confirmación. |
| 8 | ¿Puedo conectar SMS entrantes por webhook? | Mencionar integraciones en /app/numeraciones; reenvío según configuración/habilitación técnica, sin prometer automático completo. |
| 9 | ¿Los mensajes de simulación son reales? | **No**; simulación es prueba interna. Real = SMS externo a numeración activa. |
| 10 | ¿Puedo tener varios números? | Sí, varias numeraciones por empresa; listado en /app/numeraciones; filtrar en /app/sms-inbox. |

---

## Preguntas adicionales recomendadas

| Pregunta | Respuesta esperada |
|----------|-------------------|
| ¿Qué es SMS entrante en Telvoice? | Recepción de mensajes hacia numeración asignada; bandeja en panel. |
| ¿Qué no puede hacer el agente con entrantes? | No inventar, no marcar leído, no responder, no mezclar con DLR. |
| ¿Para qué sirve SMS entrante en empresas? | Confirmaciones, soporte, validaciones, respuestas campaña, equipos críticos, etc. |

---

## Criterios de aprobación

- [ ] Ninguna respuesta envía al usuario solo a `/app/inbox` cuando pregunta por **SMS recibidos** o **respuestas**.
- [ ] No aparecen mensajes inventados con remitente o texto ficticio.
- [ ] Artículos **no** visibles en landing público (solo panel/admin).
- [ ] Flujos existentes intactos: saldo, últimos envíos salientes, compra, envío SMS, campaña CSV.
- [ ] `npm run verify:agent-core` pasa sin cambios en código del núcleo.

---

## Rollback QA

Si un artículo genera confusión o colisión con keywords de DLR/salientes:

```sql
DELETE FROM knowledge_articles
WHERE title IN (
  'Qué es la recepción de SMS entrantes en Telvoice',
  'Diferencia entre SMS saliente, DLR y SMS entrante',
  'Dónde ver los SMS recibidos',
  'Numeraciones para recibir SMS',
  'Respuestas a campañas SMS',
  'Casos de uso de SMS entrantes',
  'Seguridad y privacidad en SMS entrantes',
  'SMS entrantes y SIM reales',
  'SMS entrantes por API o webhook',
  'Qué no puede hacer todavía el agente con SMS entrantes',
  'Cómo usar la bandeja SMS entrantes',
  'SMS entrantes para agentes IA y operación empresarial',
  'Varias numeraciones para recibir SMS',
  'Mensajes simulados y mensajes reales en SMS entrantes'
);
```

O revertir el commit de la migración en la rama.
