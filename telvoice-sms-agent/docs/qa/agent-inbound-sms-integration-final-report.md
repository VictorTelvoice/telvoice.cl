# Reporte final — Agente Telvoice con conocimiento SMS entrantes

**Rama:** `feature/agent-inbound-sms-knowledge`  
**Fecha:** junio 2026  
**Estado:** listo para revisión técnica (sin push, merge ni producción)

---

## 1. Objetivo

Agregar al agente conversacional del panel Telvoice **conocimiento orientativo** sobre recepción de SMS entrantes y **desambiguación mínima del router**, sin introducir acciones reales ni lectura de mensajes recibidos.

El usuario debe poder preguntar por bandeja entrante, numeraciones, SIM, webhooks, limitaciones del agente y diferencias con envíos salientes/DLR, y recibir respuestas desde `knowledge_articles` (migraciones 060/061) en lugar de caer en tools salientes (`recent_messages`, `recent_campaigns`).

---

## 2. Alcance implementado

| Fase | Entregable | Descripción |
|------|------------|-------------|
| **Fase 1** | `060_agent_inbound_sms_knowledge.sql` | 14 artículos `knowledge_articles` sobre SMS entrantes |
| **Fase 1.1** | `061_agent_inbound_sms_knowledge_scoring.sql` | Ajuste keywords/priority/content de 7 artículos |
| **Fase 2 mínima** | `agentInboundSmsIntent.ts` + router | Intent `inbound_sms_knowledge` antes de intents salientes |
| **Handler** | `agentHandlers.ts` | Delega a `searchKnowledgeForChannel` (sin acciones) |
| **QA doc** | `agent-inbound-sms-knowledge-qa.md` | Preguntas de prueba y rollback SQL |

### Commits en rama

1. `e9991dd` — feat(agent): add inbound SMS knowledge articles  
2. `6c05451` — fix(agent): improve inbound SMS knowledge scoring  
3. `133535f` — feat(agent): route inbound SMS questions to knowledge  

---

## 3. Fuera de alcance

**NO implementado en esta rama:**

- Lectura real de `inbound_sms_messages`
- Tools dinámicas (`getRecentInboundSmsTool`, etc.)
- Responder SMS entrantes desde el agente
- Marcar leído / borrar mensajes
- Automatizaciones o respuestas automáticas
- Dispatcher webhook al cliente
- Cambios en flujos de envío, compra, campañas CSV, Telegram o landing legacy
- Aplicación de migraciones en **producción**
- Despliegue a producción

---

## 4. Archivos modificados

| Archivo | Tipo | Propósito |
|---------|------|-----------|
| `supabase/migrations/060_agent_inbound_sms_knowledge.sql` | Nuevo | INSERT 14 artículos inbound (idempotente) |
| `supabase/migrations/061_agent_inbound_sms_knowledge_scoring.sql` | Nuevo | UPDATE scoring/keywords de 7 artículos |
| `src/services/agent/agentInboundSmsIntent.ts` | Nuevo | Matcher regex inbound vs saliente |
| `src/services/agent/agentIntentRouter.ts` | Modificado | Chequeo inbound antes de `recent_messages` / `recent_campaigns` |
| `src/services/agent/types.ts` | Modificado | Tipo `inbound_sms_knowledge` |
| `src/services/agent/agentHandlers.ts` | Modificado | Case `inbound_sms_knowledge` → knowledge search |
| `src/services/agent/agentCore.ts` | Modificado | +2 líneas: equivalencia `inbound_sms_knowledge` ≈ `knowledge` en fallback |
| `docs/qa/agent-inbound-sms-knowledge-qa.md` | Nuevo | QA manual y rollback |
| `docs/qa/agent-inbound-sms-integration-final-report.md` | Nuevo | Este reporte |

**Diff vs `main`:** 8 archivos, +693 líneas, −1 línea.

### Scripts untracked (fuera de rama)

- `scripts/simulate-app-inbox-wallet-ui.mjs`
- `scripts/validate-inbound-021-real.mjs`

No incluidos en commits.

---

## 5. Seguridad

| Control | Estado |
|---------|--------|
| Consulta `inbound_sms_messages` | **No** — solo comentario en código |
| Inventa mensajes recibidos | **No** — respuestas desde knowledge estático |
| Acceso cross-company | **No cambio** — `inbound_sms_knowledge` usa `requiresAuth: false` como knowledge; no expone datos por empresa |
| Ejecuta acciones (envío, marcar, borrar) | **No** |
| Artículos en landing público | **No** — `allowed_channels: ['web_client', 'admin']` |
| Tools nuevas | **No** |
| Cambios en auth/sesión | **No** |

---

## 6. QA inbound (panel, staging QA)

Empresa: `QA Landing`. Método: `runAgentCore` canal `web_client` post-migraciones 060/061.

| # | Pregunta | Resultado |
|---|----------|-----------|
| 1 | ¿Dónde veo los SMS que me responden? | **OK** — `inbound_sms_knowledge`, menciona `/app/sms-inbox` |
| 2 | ¿La bandeja es lo mismo que SMS entrantes? | **OK** — distingue `/app/inbox` vs `/app/sms-inbox` |
| 3 | ¿Qué diferencia hay entre enviado, entregado y recibido? | **OK** — saliente / DLR / entrante |
| 4 | ¿Puedo recibir respuestas de mis campañas? | **OK** — respuestas en `/app/sms-inbox` |
| 5 | ¿Puedo usar una SIM real para recibir SMS? | **OK** — numeraciones + `/app/sms-inbox` |
| 6 | ¿El agente puede mostrarme mis últimos SMS recibidos? | **OK** — limitación + guía a bandeja |
| 7 | ¿Puedes responder este SMS por mí? | **OK** — no puede responder en esta fase |
| 8 | ¿Puedo conectar SMS entrantes por webhook? | **OK** — cauteloso, sin prometer dispatcher |
| 9 | ¿Los mensajes de simulación son reales? | **OK** — simulación ≠ real |
| 10 | ¿Puedo tener varios números? | **OK** — varias numeraciones |

**Resultado: 10/10 OK**

---

## 7. QA regresión saliente

| # | Pregunta | Intent esperado | Resultado |
|---|----------|-----------------|-----------|
| 1 | Muéstrame mis últimos envíos. | `recent_messages` | **OK** |
| 2 | Ver últimos SMS enviados. | `recent_messages` | **OK** |
| 3 | ¿Cómo van mis campañas? | `recent_campaigns` | **OK** |
| 4 | Resumen de campañas. | `recent_campaigns` | **OK** |
| 5 | Ver DLR de mis envíos. | `dlr_help` | **OK** |
| 6 | Ver bandeja de envíos. | `recent_messages` | **OK** |

**Resultado: 6/6 OK**

---

## 8. Validaciones técnicas

Ejecutadas en rama final (junio 2026):

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck` | OK |
| `npm run build` | OK |
| `npm run verify:agent-core` | OK — Agent Core listo |

**Knowledge directo (`searchKnowledgeForChannel`):** 10/10 OK (post-061).

---

## 9. Riesgos residuales

1. **Frases inbound no cubiertas** — requerirán ampliar patrones en `agentInboundSmsIntent.ts` (sin tocar tools).
2. **`agentCore.ts` tocado mínimamente** — 2 líneas de equivalencia con `knowledge`; revisar en diff.
3. **Migraciones 060/061** — deben aplicarse en cada entorno donde se active el knowledge (staging ya aplicado; producción pendiente de decisión).
4. **Producción sin artículos ni router** — hasta merge + deploy + aplicar migraciones.
5. **Priority en DB no afecta scoring** — el ranking depende de keywords/título/contenido en `knowledgeService.ts`.

---

## 10. Rollback

### Código (router Fase 2)

```bash
git revert 133535f
```

### Knowledge SQL (staging/prod si se aplicó)

Ver DELETE en `docs/qa/agent-inbound-sms-knowledge-qa.md` (14 títulos de 060).  
Para 061: re-ejecutar bloque ROLLBACK comentado al final de `061_agent_inbound_sms_knowledge_scoring.sql`.

### Rama completa

```bash
git checkout main
git branch -D feature/agent-inbound-sms-knowledge
```

(Solo si se decide descartar todo el trabajo.)

---

## 11. Recomendación

1. **Abrir PR draft** contra `main` (tras push de rama cuando apruebes).
2. **Revisar diff** — 8 archivos, cambio acotado en agente.
3. **Probar en panel staging real** — asistente flotante autenticado con las 10 preguntas inbound + 6 regresión.
4. **Aplicar 060/061 en staging del deploy** si el panel apunta a otra BD que la local QA.
5. **Decidir producción** solo después de revisión y prueba manual en panel.

**No iniciar Fase 3** (tools/lectura real) en el mismo PR.

---

## Checklist pre-merge (revisor)

- [ ] Diff sin `inbound_sms_messages` en código agente
- [ ] Sin tools nuevas en `src/services/agent/tools/`
- [ ] `agentSendSmsFlow`, `agentPurchaseFlow`, Telegram, `lib/web-agent` sin cambios
- [ ] Migraciones idempotentes (`WHERE NOT EXISTS` / `UPDATE` por título)
- [ ] Artículos sin canal `landing`
- [ ] QA 10/10 inbound documentado
- [ ] Regresión saliente 6/6 documentada
- [ ] Plan de aplicación migraciones en entorno destino acordado
