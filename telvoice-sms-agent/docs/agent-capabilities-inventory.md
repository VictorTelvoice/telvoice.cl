# Inventario de capacidades — Agente Telvoice

Documento interno auditado contra el código del repositorio (referencia de despliegue del núcleo unificado: commit `db233d6`).  
Última revisión: mayo 2026.

---

## 1. Resumen ejecutivo

**El Agente Telvoice** es un asistente **operativo y comercial** conectado a la operación SMS de cada empresa en Chile: cotiza bolsas, guía la compra de saldo en el panel, prepara envíos individuales y campañas CSV, consulta saldo e historial, explica estados de entrega (DLR) y aplica controles antes de ejecutar acciones sensibles.

**Arquitectura del núcleo actual (`runAgentCore`):**

- **No es un chatbot generativo LLM.** No hay llamadas a modelos OpenAI/Anthropic en `src/services/agent/`.
- Combina **enrutamiento de intenciones por reglas**, **memoria de sesión**, **herramientas** (saldo, cotización, envíos, CSV) y **búsqueda en `knowledge_articles`**.
- **No envía SMS ni debita saldo sin confirmación explícita** del usuario (p. ej. «Confirmo») sobre una `agent_pending_action` válida.

**Dónde vive el valor completo hoy:** principalmente en el **panel cliente** (`https://agent.telvoice.cl/app`), no en el landing público legacy de [www.telvoice.cl](https://www.telvoice.cl), que usa un stack comercial distinto (`lib/web-agent/`).

---

## 2. Capacidades por canal

Leyenda de estado: **Implementado** | **Parcial** | **Pendiente**

### 2.1 Landing [www.telvoice.cl](https://www.telvoice.cl)

| Aspecto | Detalle |
|--------|---------|
| **Estado** | **Implementado** (stack legacy, no `agentCore` unificado por defecto) |
| **Capacidades** | Cotización, catálogo de precios, FAQ, captura de lead, CTAs registro/pago, quick actions comerciales |
| **Limitaciones** | Sin saldo, envíos, campañas CSV ni flujo MP guiado del panel; `TELVOICE_CONFIG.apiOrigin` apunta a `www.telvoice.cl` → `/api/web-agent/*` (Vercel, `lib/web-agent/conversation.js`) |
| **Endpoints** | `POST /api/web-agent/chat`, `resume`, `lead`, `pricing`, `quote` (repo raíz `api/web-agent/`) |

### 2.2 Landing vía agent.telvoice.cl

| Aspecto | Detalle |
|--------|---------|
| **Estado** | **Implementado** (mismo widget puede usar origen distinto) |
| **Capacidades** | `runAgentCore({ channel: "landing" })`: cotización, comercial, knowledge público, registro/lead, dudas comerciales |
| **Limitaciones** | Operaciones privadas redirigen a registro; `send_sms_flow` no ejecuta envíos reales; sin saludo puro con reset de flujos del panel |
| **Endpoints** | `POST https://agent.telvoice.cl/api/web-agent/chat` |

### 2.3 Panel cliente `/app`

| Aspecto | Detalle |
|--------|---------|
| **Estado** | **Implementado** (canal principal) |
| **Capacidades** | Saludo con nombre y hora local; reset por saludo puro; compra con MercadoPago; envío SMS guiado; campaña CSV; saldo; últimos envíos; DLR; knowledge; feedback; historial de conversación |
| **Limitaciones** | Requiere sesión autenticada; `companyId` solo desde servidor |
| **Endpoints** | `POST /api/app/agent/chat`, `POST /api/app/agent/feedback`, `POST /api/app/agent/upload-csv`, `GET /api/app/agent/history` |

### 2.4 Telegram

| Aspecto | Detalle |
|--------|---------|
| **Estado** | **Parcial** |
| **Capacidades** | `telegramAgentBridge` → `agentCore` canal `telegram`: cotización sin auth; saldo/historial/envío con cliente autorizado; knowledge y comercial |
| **Limitaciones** | Comando `enviar …` sigue en **flujo legacy** (`useLegacyEnviarFlow`); sin widget CSV del panel; sin reset de saludo puro como en panel |
| **Integración** | Webhook Telegram → bridge → `agentCore` |

### 2.5 Superadmin

| Aspecto | Detalle |
|--------|---------|
| **Estado** | **Implementado** (gestión y métricas; chat widget no operativo) |
| **Capacidades** | Entrenamiento (`/admin/agent-training`), ventas del agente (`/admin/agent-sales`), sesiones web legacy, knowledge admin, feedback |
| **Limitaciones** | Widget flotante admin = **vista previa local** (no llama a `agentCore` en producción) |
| **Rutas** | Ver `admin.routes.ts` — prefijos `/admin/agent-training`, `/admin/agent-sales`, `/admin/web-agent/sessions` |

### 2.6 API interna (núcleo)

| Aspecto | Detalle |
|--------|---------|
| **Estado** | **Implementado** |
| **Capacidades** | `runAgentCore` unifica canales `landing`, `web_client`, `telegram`, `admin` |
| **Exposición** | Controllers `app-agent`, `web-agent`; bridge Telegram |
| **Tipos** | `src/services/agent/types.ts` — `AgentChannel`, `AgentIntent`, `AgentCoreResponse` |

---

## 3. Capacidades comerciales

| Capacidad | Estado | Notas técnicas |
|-----------|--------|----------------|
| Cotización bolsas SMS Chile | **Implementado** | `quoteSmsBundleTool`, `calculateTelvoiceQuote`, `commercialQuoteService` |
| Detección intención de compra | **Implementado** | `detectPurchaseIntent`, `agentCommercialText`, router `commercial` / `quote_purchase` |
| Sinónimos (mensajes, SMS, saldo, recarga, bolsa…) | **Implementado** | `normalizeCommercialText` |
| Redondeo a múltiplos de 1.000 | **Implementado** | `SMS_QUANTITY_STEP`, `normalizeQuoteQuantity` |
| Tramos de precio + IVA 19% | **Implementado** | `smsPricingTierService`, `calcIvaFromSubtotal` |
| Volúmenes > 120.000 SMS → cotización manual | **Implementado** | `isManualQuoteRequired`, `manual_quote_requested` |
| Link MercadoPago en panel | **Implementado** | `agentPurchaseFlow`, `createSmsPurchaseOrderForCompany` |
| Reutilización orden/link pendiente | **Implementado** | `payment_link_reused` |
| Confirmación «sí» / «generar link» con cotización activa | **Implementado** | `hasActivePurchaseQuote`, `isPurchasePaymentConfirmation` |
| Evento `quote_created` | **Implementado** | `recordAgentSalesEvent` |
| Evento `payment_link_created` | **Implementado** | Al crear link |
| Evento `payment_link_reused` | **Implementado** | Al reusar |
| Evento `insufficient_balance_detected` | **Implementado** | Bloqueo envío por saldo |
| Evento `manual_quote_requested` | **Implementado** | Volúmenes altos / solicitud ejecutivo |
| Evento `order_paid` en `agent_sales_events` | **Pendiente** | Tipo en migración `053`; KPI «pagado» usa `sms_orders.payment_status` |
| Módulo `/admin/agent-sales` | **Implementado** | KPIs, órdenes `metadata.source=agent_panel`, bloqueos, conversaciones |
| Checkout automático en landing | **Parcial** | `checkout_url` de `sms_products` si existe producto exacto; MP guiado es panel |

---

## 4. Capacidades operativas del panel cliente

| Capacidad | Estado |
|-----------|--------|
| Saludo por nombre y hora local (`userLocalHour`, `userTimezone`) | **Implementado** |
| Reinicio por saludo puro (limpia compra, CSV, envío, pending actions) | **Implementado** — `agentGreetingReset.ts` |
| Consulta de saldo | **Implementado** |
| Últimos envíos | **Implementado** |
| Ayuda DLR (+ contexto reciente en panel) | **Implementado** |
| Envío SMS individual guiado | **Implementado** — `agentSendSmsFlow.ts` |
| Campaña CSV guiada | **Implementado** — upload + revisión + `send_campaign_csv` |
| Botón adjuntar CSV contextual | **Implementado** — `showAttachButton` |
| Validación teléfonos Chile | **Implementado** |
| Contactos válidos / inválidos / duplicados | **Implementado** |
| Cálculo de segmentos y crédito requerido | **Implementado** |
| Bloqueo por saldo insuficiente | **Implementado** |
| Confirmación obligatoria antes de enviar | **Implementado** |
| Evitar doble «Confirmo» (15 min) | **Implementado** — `lastPendingConfirmAt` |
| Cancelación de flujos (`cancelar`, `salir`) | **Implementado** |
| Saldo antes / SMS consumidos / saldo actual en confirmación | **Implementado** |
| Optimización de mensajes SMS | **Implementado** — `optimizeSmsCopyTool` |
| Soporte desde knowledge | **Implementado** |
| Borrador de campaña + CTA «Abrir borrador» | **Implementado** |
| Reportes / facturas / wallet | **Parcial** — enlaces a rutas `/app/*` |
| Intent `launch_campaign` | **Parcial** — ruteado y `executePendingAction`; flujo principal es CSV |

---

## 5. Entrenamiento y mejora continua

| Capacidad | Estado |
|-----------|--------|
| Registro preguntas sin respuesta | **Implementado** — `agent_unanswered_questions` |
| Feedback útil / no útil | **Implementado** — `agent_feedback`, API panel |
| Crear artículos desde feedback / unanswered | **Implementado** — `admin-agent-training` |
| Knowledge por canal (`allowed_channels`, categorías) | **Implementado** |
| Deduplicación automática de artículos | **Parcial** — revisión manual en admin |
| Memoria conversacional | **Implementado** — `agent_conversation_memory` |
| Personalidad por canal | **Implementado** — `agentPersona.ts`, `agentResponseComposer` |

**Rutas admin:**

- `/admin/agent-training`
- `/admin/agent-training/unanswered`
- `/admin/agent-training/feedback`

---

## 6. Capacidades del superadmin

| Módulo | Estado | Descripción |
|--------|--------|-------------|
| Hub Agente Telvoice | **Implementado** | Centro de entrenamiento y enlaces |
| Feedback y propuesta de respuesta | **Implementado** | Revisión, artículos, ignorar, backfill |
| Preguntas sin respuesta → artículo | **Implementado** |
| Ventas del Agente | **Implementado** | Cotizaciones, links, órdenes, bloqueos saldo, conversaciones |
| Sesiones web landing (legacy) | **Implementado** | `/admin/web-agent/sessions` |
| Widget admin en panel | **Parcial** | Solo navegación / preview local |

---

## 7. Seguridad y controles

Controles verificados en código:

| Control | Implementación |
|---------|----------------|
| `companyId` desde sesión, no desde frontend | `app-agent.controller.ts` — `req.userProfile?.companyId` |
| Sin cross-company en pending actions | `handleConfirmCancel` — comparación `pending.context.companyId` |
| Confirmación obligatoria antes de enviar/debitar | `createPendingActionDb` → `Confirmo` → `executePendingAction` |
| Sin envío automático tras pago en el chat | Compra solo crea orden/link; acreditación vía wallet/webhooks |
| Cancelación pending con saludo puro | `cancelAllPendingForSessionDb` |
| Mitigación doble «Confirmo» | `lastPendingConfirmAt` (ventana 15 min) |
| Idempotencia envío | `resolvePendingActionIdempotencyKey` |
| Reutilización orden MP | Flujo compra activo en `agentPurchaseFlow` |
| Errores sanitizados al cliente | `clientSafeAgentError`, `formatAgentSmsSendError` |
| No exponer tokens en respuestas API | Mensajes genéricos en fallos |
| Canal admin no envía SMS reales | Mensaje explícito en `agentSendSmsFlow` |

**Fuera de alcance del agente (no modificar desde chat):** wallet manual, rutas/TPS, proveedores aSMSC.

---

## 8. Limitaciones actuales

1. **Dos stacks en landing:** [www.telvoice.cl](https://www.telvoice.cl) usa `lib/web-agent`; unificación con `agentCore` requiere cambiar `apiOrigin` o migrar front.
2. **`order_paid` como evento:** pendiente de registro idempotente en webhook; métricas de pago dependen de `sms_orders`.
3. **Saludo puro con reset:** solo canal `web_client` (panel).
4. **Telegram:** flujo `enviar` legacy en paralelo; sin paridad CSV con panel.
5. **Widget superadmin:** no es agente productivo.
6. **Sin LLM generativo** en el núcleo unificado.
7. **Métricas ventas:** fallback a mensajes del panel si faltan eventos en `agent_sales_events`.
8. **Landing público:** sin envío real, saldo ni campaña CSV del panel.

---

## 9. Evidencia técnica

### Rutas principales

| Ruta | Uso |
|------|-----|
| `POST /api/app/agent/chat` | Panel cliente |
| `POST /api/app/agent/feedback` | Feedback widget |
| `POST /api/app/agent/upload-csv` | Campaña CSV |
| `GET /api/app/agent/history` | Historial sesión |
| `POST /api/web-agent/chat` | Landing (unificado en agent host) |
| `api/web-agent/*` (raíz repo) | Landing legacy Vercel |

### Archivos núcleo

- `src/services/agent/agentCore.ts`
- `src/services/agent/agentIntentRouter.ts`
- `src/services/agent/agentPurchaseFlow.ts`
- `src/services/agent/agentSendSmsFlow.ts`
- `src/services/agent/agentGreetingReset.ts`
- `src/services/agent/executePendingAction.ts`
- `src/services/agent/agentConversationMemory.ts`
- `src/services/agent/agentSalesEventsService.ts`
- `src/services/agent/agentSalesMetricsService.ts`

### Tablas Supabase (principales)

- `panel_agent_sessions`, `panel_agent_messages`
- `agent_pending_actions`, `agent_conversation_memory`
- `agent_feedback`, `agent_unanswered_questions`
- `knowledge_articles`, `agent_sales_events`
- `sms_orders` (órdenes MercadoPago agente panel)

### Migraciones relevantes

- `039_panel_agent.sql`
- `041_agent_pending_actions.sql`
- `042_agent_unanswered_questions.sql`
- `046_agent_persona_memory_feedback.sql`
- `053_agent_sales_events.sql`

### Scripts npm

```bash
npm run verify:agent-core
npm run verify:agent-deploy
npm run test:agent-purchase-flow
npm run test:agent-greeting-reset
npm run test:agent-confirm-pending
npm run test:agent-persona
npm run test:agent-ux-polish
npm run test:panel-agent-send-sms-flow
npm run test:agent-sales
npm run migrate:agent-core
```

### Health producción (referencia)

`GET https://agent.telvoice.cl/health` — campo `build` con SHA de despliegue (ej. prefijo `db233d6`).

---

## 10. Claims seguros

Usar en materiales internos, comerciales y landing **solo si el canal aplica**:

- Cotización de bolsas SMS para Chile (tramos, IVA, múltiplos de 1.000).
- Agente en el **panel cliente** para cotizar, comprar saldo con MercadoPago y guiar envíos.
- **Confirmación explícita** antes de enviar o debitar saldo.
- Validación de números y resumen de campañas CSV.
- Consulta de saldo, últimos envíos y ayuda sobre estados DLR.
- Base de conocimiento entrenable y mejora con feedback del equipo Telvoice.
- Reinicio de flujo con un saludo simple en el panel (sin perder historial de mensajes).
- Operación conectada a la cuenta y datos reales de la empresa (sesión autenticada).

---

## 11. Claims que NO debemos usar todavía

- «IA avanzada», «GPT», «ChatGPT» o «modelo de lenguaje generativo» para describir el núcleo actual.
- «Automatización total» o «el agente envía solo» sin confirmación.
- «Pago y envío automático inmediato» tras pagar en MercadoPago desde el chat.
- «El mismo agente completo en telvoice.cl y en el panel» (landing legacy ≠ panel).
- «Telegram con campañas CSV iguales al panel».
- «Métricas 100% en tiempo real solo por eventos» (dependen de órdenes y fallbacks).
- «Superadmin opera SMS desde el chat flotante» (es preview local).
- «Acreditación instantánea garantizada por el agente» post-pago.

---

## 12. Próximos pasos recomendados

1. **Unificar landing:** apuntar `TELVOICE_CONFIG.apiOrigin` a `agent.telvoice.cl` o documentar públicamente la diferencia legacy vs panel.
2. **Implementar `order_paid`** idempotente en webhook → `agent_sales_events` (solo `metadata.source = agent_panel`).
3. **Mantener tests** de compra, saludo puro, confirmación y ventas en CI.
4. **Demo visual** para ventas: flujo cotización → link MP → campaña CSV con confirmación (sin pagos reales en demo).
5. **Revisar copy** del widget en [www.telvoice.cl](https://www.telvoice.cl) para alinear expectativas con capacidades del panel.
6. **Opcional:** extender reset por saludo a Telegram si producto lo exige.

---

*Documento mantenido por el equipo de producto/ingeniería Telvoice. Actualizar tras cambios en `agentCore`, canales o migraciones.*
