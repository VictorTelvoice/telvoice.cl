# Deploy — Telvoice Agent Core

Guía para activar el núcleo unificado del agente (panel, Telegram, landing) en **agent.telvoice.cl**.

## 1. Migraciones Supabase (orden obligatorio)

Aplicar en el SQL Editor o con los scripts del repo:

| Orden | Archivo | Contenido |
|-------|---------|-----------|
| 1 | `supabase/migrations/039_panel_agent.sql` | `panel_agent_sessions`, `panel_agent_messages` |
| 2 | `supabase/migrations/040_panel_client_knowledge.sql` | FAQ panel cliente |
| 3 | `supabase/migrations/041_agent_pending_actions.sql` | Confirmaciones persistentes |
| 4 | `supabase/migrations/042_agent_unanswered_questions.sql` | Entrenamiento continuo |
| 5 | `supabase/migrations/043_knowledge_channels.sql` | `allowed_channels`, `audience`, `priority` |
| 6 | `supabase/migrations/044_agent_knowledge_manual.sql` | Manual, estrategia, industrias |
| 7 | `supabase/migrations/045_agent_training_flow.sql` | `ignored`, metadata dedup, vínculo knowledge |
| 8 | `supabase/migrations/046_agent_persona_memory_feedback.sql` | Memoria conversacional + `agent_feedback` |

### Validación SQL rápida

```sql
SELECT COUNT(*) FROM panel_agent_sessions;
SELECT COUNT(*) FROM panel_agent_messages;
SELECT COUNT(*) FROM agent_pending_actions;
SELECT COUNT(*) FROM agent_unanswered_questions;
SELECT title, category, allowed_channels
FROM knowledge_articles
WHERE category IN ('panel_cliente', 'estrategia', 'comercial')
ORDER BY priority DESC
LIMIT 20;
```

## 2. Verificación local

```bash
cd telvoice-sms-agent
npm run verify:agent-core
npm run typecheck
npm run build
```

## 3. Deploy VPS (PM2)

```bash
cd /var/www/telvoice-sms-agent
git pull origin main
npm ci
npm run build
pm2 restart telvoice-sms-agent --update-env
curl -s https://agent.telvoice.cl/health
```

## 4. Endpoints Agent Core

| Canal | Endpoint | Auth |
|-------|----------|------|
| Panel cliente | `POST /api/app/agent/chat` | Sesión cliente (cookie) |
| Panel historial | `GET /api/app/agent/history?sessionId=` | Sesión cliente |
| Landing (agent) | `POST /api/web-agent/chat` | Público (sin datos privados) |
| Telegram | Bot existente → `runAgentCore` vía bridge | Por usuario Telegram |

**Nota:** El widget del landing en **telvoice.cl** (Vercel) puede seguir usando `api/web-agent/chat` del repo landing; el endpoint en el agent es compatible para pruebas o proxy futuro.

## 5. Pruebas manuales sugeridas

### Landing (público)

- "hola quiero comprar SMS"
- "cuánto cuesta 30000 SMS"
- "quiero 12500 SMS"

### Telegram autorizado

- saldo
- historial
- cotizar 30000 sms
- qué significa failed

### Telegram no autorizado

- Debe cotizar; no debe mostrar saldo ni historial.

### Panel `/app` (widget flotante)

- ¿Cuánto saldo tengo?
- Muéstrame mis últimos envíos
- Quiero comprar 70000 SMS
- Optimiza este mensaje: …

### Admin

- `/admin/agent-training`
- `/admin/agent-training/unanswered`

## 6. Seguridad operativa

- No se envía SMS real sin **Confirmo** (pending action).
- En modo distinto de `mock`, el envío individual redirige a `/app/send-sms`.
- `company_id` del panel solo desde sesión servidor; el cliente no puede inyectar otro ID.
- Sin cambios a proveedores, rutas SMPP, TPS ni credenciales aSMSC.

## 7. Calculadora comercial

Única fuente: `commercialQuoteService` / `smsPricingTierService` (tramos Telvoice.cl, múltiplos de 1.000, IVA 19%).
