# Diseño técnico — API real Telvoice (SMS por API Key)

**Estado:** decisiones congeladas para Fase 1 (pre-implementación)  
**Versión:** 0.2  
**Fecha:** 2026-05  
**Alcance:** diseño únicamente — sin código productivo, migraciones ni activación en producción.

---

## Contexto actual

El panel cliente expone `/app/api` conectado a Supabase en modo **visual/demo**:

| Componente | Rol actual |
|------------|------------|
| Tabla `client_api_settings` | Preferencias de UI: estado visual, `api_key_demo`, `api_key_masked`, webhook URL, eventos, solicitud SMPP |
| Rutas `/app/*` | Panel autenticado por sesión (`tv_client_session`) |
| API pública | **No existe** — los ejemplos en la UI son ilustrativos |

**Regla invariante (congelada):** `client_api_settings` **no** almacenará secretos reales. Solo configuración visual y operativa del panel:

| Campo / uso | Permanece en `client_api_settings` |
|-------------|-------------------------------------|
| `webhook_url`, `webhook_events`, `webhook_status` | Sí |
| `smpp_requested`, `smpp_requested_at` | Sí |
| `api_status`, `environment` (visual) | Sí |
| `api_key_demo`, `api_key_masked` (demo no funcional) | Sí — hasta deprecar en UI cuando existan keys reales |
| Secretos / hashes de API Key real | **No** — tabla `client_api_keys` |

El sistema ya cuenta con:

- `company_sms_wallets` — saldo SMS (`available_sms`, `reserved_sms`, `consumed_sms`)
- `walletTransactionService` — movimientos y débitos
- `sms_send_idempotency` — idempotencia en envíos del panel
- `smsSendService` / proveedor — envío individual (panel)
- `client_api_settings` — capa visual recién desplegada

La API real debe **reutilizar** la lógica de negocio de wallet y envío, no duplicarla, y exponerla por un boundary HTTP público separado.

---

## 1. Visión general

### Flujo end-to-end (producción)

```mermaid
sequenceDiagram
  participant C as Cliente externo
  participant GW as API Gateway / Express público
  participant Auth as Auth API Key
  participant Biz as Orquestador SMS API
  participant W as Wallet
  participant M as sms_api_messages
  participant P as Proveedor / SMSC
  participant DLR as DLR interno
  participant WH as Webhook dispatcher

  C->>GW: POST /api/v1/sms/send + Bearer key
  GW->>Auth: Validar prefix + hash + scope + rate limit
  Auth->>M: Registrar client_api_requests
  GW->>Biz: Validar payload + empresa activa
  Biz->>W: Consultar saldo + reservar/descontar
  Biz->>M: Crear mensaje (queued)
  Biz->>P: Enviar (async o sync según fase)
  P-->>DLR: Estado entrega
  DLR->>M: Actualizar status / dlr_status
  DLR->>WH: Encolar client_webhook_deliveries
  WH->>C: POST webhook URL (reintentos)
  Biz-->>C: 202/200 + message id
```

### Responsabilidades por capa

| Capa | Responsabilidad |
|------|-----------------|
| **API pública** (`/api/v1/*`) | Autenticación Bearer, validación JSON, rate limits, respuestas estándar, correlación `request_id` |
| **Dominio SMS API** | Segmentos, normalización E.164, idempotencia, estados de mensaje |
| **Wallet** | Saldo real, reserva, débito, reversión en fallo definitivo |
| **Proveedor** | Envío hacia SMSC (fase posterior; sandbox simulado antes) |
| **Webhooks** | Entrega DLR al cliente con reintentos y firma opcional |
| **Panel `/app/api`** | CRUD de keys (sin ver secreto), webhook config, logs resumidos |
| **Panel `/admin`** | Operaciones, revocación, auditoría, límites, SMPP |

### Separación de superficies

```
https://api.telvoice.cl/api/v1/...     → API pública (API Key)
https://agent.telvoice.cl/app/...      → Panel cliente (sesión)
https://agent.telvoice.cl/admin/...    → Panel interno (sesión admin)
```

No montar la API pública bajo `/app`. Opcionalmente mismo proceso Node con router montado en `/api/v1` y middleware distinto.

---

## 2. Principios de seguridad

| Principio | Implementación propuesta |
|-----------|-------------------------|
| **Nunca texto plano** | Solo `key_hash` en BD; la key completa se muestra una vez al crear |
| **Hash fuerte** | **Decisión congelada:** HMAC-SHA256 con pepper `API_KEY_PEPPER` (ver §5). No bcrypt en validación por request |
| **Prefix indexable** | `key_prefix` (ej. `tlv_live_a1b2`) para lookup O(1) sin escanear todas las keys |
| **Masked en UI** | `key_masked` persistido: `tlv_live_••••••••••••x9k2` |
| **Rotación** | Nueva fila o misma fila con nuevo hash; grace period opcional (dos hashes válidos 24h) |
| **Revocación** | `status = revoked`, `revoked_at`, `revoked_reason`; rechazo inmediato |
| **Scopes** | JSON array en `scopes`; cada endpoint exige scope mínimo |
| **Expiración** | `expires_at` opcional; job o check en auth |
| **Rate limiting** | Por key, empresa y endpoint (ver §7) |
| **Logs de uso** | `client_api_requests` — sin guardar body completo con PII si no es necesario |
| **Separación panel/API** | Sesión JWT ≠ API Key; rutas y middleware distintos |
| **No secretos en `client_api_settings`** | Solo URL webhook, eventos, flags UI; opcional `webhook_signing_secret` hasheado en tabla aparte si se requiere |
| **Idempotencia** | Header `Idempotency-Key` en send/bulk |
| **Principio mínimo privilegio** | Keys con scopes acotados; sandbox sin impacto en wallet prod |

### Formato de key (decisión congelada)

| Ambiente | Prefijo en token | Columna `environment` en BD |
|----------|------------------|----------------------------|
| **Producción** | `tlv_live_<token>` | `production` |
| **Sandbox** | `tlv_test_<token>` | `sandbox` |

- `<token>`: 32 caracteres alfanuméricos `[a-z0-9]` generados con CSPRNG.
- Ejemplo producción: `tlv_live_8f3k2m9p4q1n7x6w5v3b2a1c0d9e8f`
- Ejemplo sandbox: `tlv_test_4a2b9c1d3e5f7g8h9i0j1k2l3m4n5o6p`

**Persistencia (nunca la key completa en BD):**

| Campo | Contenido |
|-------|-----------|
| `key_prefix` | Primeros **20 caracteres** del token completo (único, indexado). Ej.: `tlv_live_8f3k2m9p4q` |
| `key_hash` | HMAC-SHA256(`API_KEY_PEPPER`, token_completo) en hex |
| `key_masked` | Misma longitud visual; últimos 4 chars visibles. Ej.: `tlv_live_••••••••••••5o6p` |

La **key completa** se devuelve **una sola vez** en la respuesta de creación; después solo `key_masked` en listados.

---

## 3. Tablas propuestas

> **Nota:** definición de diseño. No crear migraciones en esta fase.

### A. `client_api_keys`

Credenciales reales de API (una empresa, muchas keys posibles).

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `uuid` PK | |
| `company_id` | `uuid` NOT NULL FK → `companies` | Índice |
| `created_by_user_id` | `uuid` NULL | `user_profiles` / auditoría |
| `key_prefix` | `text` NOT NULL UNIQUE | Búsqueda en auth |
| `key_hash` | `text` NOT NULL | Hash del secreto completo |
| `key_masked` | `text` NOT NULL | Solo UI |
| `name` | `text` NOT NULL | Etiqueta humana ("Backend producción") |
| `status` | `text` NOT NULL | `active`, `paused`, `revoked`, `expired` |
| `scopes` | `jsonb` NOT NULL | `["sms:send","balance:read"]` |
| `environment` | `text` NOT NULL | `production`, `sandbox` |
| `last_used_at` | `timestamptz` NULL | `NULL` hasta primer uso autenticado en API pública (Fase 2+) |
| `expires_at` | `timestamptz` NULL | Opcional |
| `revoked_at` | `timestamptz` NULL | |
| `revoked_reason` | `text` NULL | |
| `metadata` | `jsonb` NOT NULL DEFAULT `{}` | IP allowlist futura, notas |
| `source` | `text` DEFAULT `client_panel` | `client_panel`, `admin` |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | trigger `set_updated_at()` |

**Índices sugeridos:** `(company_id)`, `(key_prefix)` UNIQUE, `(status)`, `(environment)`, `(last_used_at DESC)`.

**RLS (fase posterior):** políticas por `company_id` cuando el panel lea vía Supabase directo; la API pública usará service role + validación en aplicación.

---

### B. `client_api_requests`

Log de cada request autenticado a la API pública (auditoría y debugging).

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `uuid` PK | |
| `company_id` | `uuid` NOT NULL | |
| `api_key_id` | `uuid` NULL FK | NULL si auth falló antes de resolver key |
| `endpoint` | `text` NOT NULL | `/api/v1/sms/send` |
| `method` | `text` NOT NULL | `POST`, `GET` |
| `status_code` | `integer` NOT NULL | HTTP respondido |
| `ip_address` | `text` NULL | Truncar/hash si política de retención |
| `user_agent` | `text` NULL | |
| `request_id` | `text` NOT NULL | UUID correlación; UNIQUE con timestamp opcional |
| `error_code` | `text` NULL | `INSUFFICIENT_BALANCE`, `INVALID_SCOPE` |
| `error_message` | `text` NULL | Mensaje seguro (sin stack) |
| `duration_ms` | `integer` NULL | Latencia |
| `created_at` | `timestamptz` | Particionar por mes en futuro |

**Índices:** `(company_id, created_at DESC)`, `(api_key_id, created_at DESC)`, `(request_id)` UNIQUE.

**Retención:** 90 días hot; archivo frío después (política operativa).

---

### C. `sms_api_messages`

Mensajes originados por API (paralelo a mensajes de panel/campaña si existen tablas separadas).

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `uuid` PK | ID público en API |
| `company_id` | `uuid` NOT NULL | |
| `api_key_id` | `uuid` NOT NULL | |
| `external_reference` | `text` NULL | ID del cliente; UNIQUE `(company_id, external_reference)` si se envía |
| `recipient` | `text` NOT NULL | E.164 normalizado |
| `sender` | `text` NULL | Alphanumeric / short code |
| `message` | `text` NOT NULL | Contenido |
| `country` | `text` NOT NULL | `CL`, etc. |
| `segments` | `integer` NOT NULL | Calculado GSM/UCS-2 |
| `status` | `text` NOT NULL | Ver estados abajo |
| `provider_message_id` | `text` NULL | ID del SMSC |
| `dlr_status` | `text` NULL | `delivered`, `failed`, … |
| `cost_sms` | `integer` NOT NULL DEFAULT 0 | Unidades debitadas |
| `idempotency_key` | `text` NULL | UNIQUE `(company_id, idempotency_key)` |
| `wallet_transaction_id` | `uuid` NULL | FK a movimiento wallet |
| `metadata` | `jsonb` NOT NULL DEFAULT `{}` | encoding, sandbox flag |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

**Estados `status` (propuesta):**

| Estado | Significado |
|--------|-------------|
| `accepted` | Validado, pendiente de envío |
| `queued` | En cola interna |
| `sent` | Entregado al proveedor |
| `delivered` | DLR positivo |
| `failed` | Fallo definitivo |
| `rejected` | Rechazado validación/proveedor |
| `expired` | Ventana DLR expirada |
| `cancelled` | Cancelado antes de envío |

**Índices:** `(company_id, created_at DESC)`, `(api_key_id)`, `(status)`, `(external_reference)` parcial UNIQUE.

---

### D. `client_webhook_deliveries`

Intentos de entrega de eventos DLR al webhook del cliente.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `uuid` PK | |
| `company_id` | `uuid` NOT NULL | |
| `message_id` | `uuid` NOT NULL FK → `sms_api_messages` | |
| `webhook_url` | `text` NOT NULL | Snapshot URL al encolar |
| `event_type` | `text` NOT NULL | `delivered`, `failed`, `expired`, `rejected` |
| `payload` | `jsonb` NOT NULL | Cuerpo enviado |
| `status` | `text` NOT NULL | `pending`, `success`, `failed`, `retrying` |
| `http_status` | `integer` NULL | Última respuesta |
| `attempts` | `integer` NOT NULL DEFAULT 0 | |
| `next_retry_at` | `timestamptz` NULL | |
| `last_error` | `text` NULL | |
| `signature` | `text` NULL | HMAC enviado en header |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

**Índices:** `(company_id, status, next_retry_at)`, `(message_id)`.

**Relación con `client_api_settings`:** al encolar, leer `webhook_url` y `webhook_events` de `client_api_settings` (o futura `client_webhook_endpoints`). No almacenar secretos de firma en texto plano — tabla `client_webhook_secrets` con hash si se implementa HMAC.

---

### Tablas auxiliares (opcional, fase 7)

| Tabla | Propósito |
|-------|-----------|
| `client_api_rate_limit_buckets` | Contadores por ventana (si no Redis) |
| `client_webhook_secrets` | `signing_secret_hash` por empresa |
| `sms_api_message_events` | Historial de transiciones de estado |

---

## 4. Diseño de API pública

**Base URL:** `https://api.telvoice.cl`  
**Versión:** `/api/v1`  
**Formato:** JSON, UTF-8  
**Errores estándar:**

```json
{
  "ok": false,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Saldo SMS insuficiente para 2 segmentos.",
    "request_id": "req_01HXYZ..."
  }
}
```

**Headers comunes:**

| Header | Requerido | Descripción |
|--------|-----------|-------------|
| `Authorization` | Sí | `Bearer tlv_live_...` |
| `Content-Type` | Sí (POST) | `application/json` |
| `Idempotency-Key` | Obligatorio antes de envío/wallet real (Fase 4+); no aplica en Fase 1 | UUID v4 |
| `X-Request-Id` | Opcional | Eco en respuesta |

---

### `POST /api/v1/sms/send`

> **Fuera de Fase 1.** Diseño de contrato para fases 3–5. El scope `sms:send` puede existir en keys desde Fase 1 pero **no habilita** este endpoint hasta fase posterior.

Envía un SMS a un destinatario.

**Scope:** `sms:send`

**Request:**

```json
{
  "to": "+56912345678",
  "message": "Tu código es 123456",
  "sender": "Telvoice",
  "external_reference": "order-99881",
  "country": "CL"
}
```

**Response 202 (aceptado, envío async):**

```json
{
  "ok": true,
  "data": {
    "id": "msg_550e8400-e29b-41d4-a716-446655440000",
    "status": "queued",
    "segments": 1,
    "recipient": "+56912345678",
    "cost_sms": 1,
    "external_reference": "order-99881",
    "created_at": "2026-05-29T12:00:00Z"
  },
  "request_id": "req_01HXYZ"
}
```

**Errores:** `400` validación, `401` auth, `402` saldo insuficiente, `403` scope, `409` idempotencia conflicto, `429` rate limit.

---

### `POST /api/v1/sms/bulk`

Envío masivo (lote). Mismo scope `sms:send` o `sms:bulk` dedicado.

**Request:**

```json
{
  "messages": [
    { "to": "+56911111111", "message": "Hola 1", "external_reference": "a1" },
    { "to": "+56922222222", "message": "Hola 2", "external_reference": "a2" }
  ],
  "sender": "Telvoice",
  "country": "CL"
}
```

**Response 202:**

```json
{
  "ok": true,
  "data": {
    "batch_id": "batch_01HXYZ",
    "accepted": 2,
    "rejected": 0,
    "messages": [
      { "id": "msg_...", "status": "queued", "external_reference": "a1" },
      { "id": "msg_...", "status": "queued", "external_reference": "a2" }
    ]
  },
  "request_id": "req_01HXYZ"
}
```

Límite de diseño: máx. 500 destinatarios por request (configurable); bulk mayor vía campañas panel o API batch asíncrona futura.

---

### `GET /api/v1/balance`

**Scope:** `balance:read`

**Response 200:**

```json
{
  "ok": true,
  "data": {
    "company_id": "6cd1db92-d5c7-45e0-8548-df8907843350",
    "country": "CL",
    "available_sms": 1250,
    "reserved_sms": 0,
    "wallet_status": "active",
    "environment": "production"
  },
  "request_id": "req_01HXYZ"
}
```

En **sandbox**, devolver saldo simulado o wallet sandbox separado (sin tocar wallet prod).

---

### `GET /api/v1/messages/:id`

**Scope:** `messages:read`

**Response 200:**

```json
{
  "ok": true,
  "data": {
    "id": "msg_550e8400-e29b-41d4-a716-446655440000",
    "status": "delivered",
    "dlr_status": "delivered",
    "recipient": "+56912345678",
    "segments": 1,
    "cost_sms": 1,
    "provider_message_id": "asmsc-12345",
    "created_at": "2026-05-29T12:00:00Z",
    "updated_at": "2026-05-29T12:00:05Z"
  },
  "request_id": "req_01HXYZ"
}
```

---

### `GET /api/v1/messages`

Listado paginado. Query: `?status=delivered&limit=50&cursor=...`

**Scope:** `messages:read`

---

### `POST /api/v1/webhooks/test`

Dispara evento de prueba al webhook configurado en `client_api_settings` (o endpoint dedicado).

**Scope:** `webhooks:test`

**Request:**

```json
{
  "event": "delivered",
  "sample": true
}
```

**Response 200:**

```json
{
  "ok": true,
  "data": {
    "delivery_id": "whd_01HXYZ",
    "status": "success",
    "http_status": 200
  },
  "message": "Evento de prueba entregado.",
  "request_id": "req_01HXYZ"
}
```

En sandbox: permitir URL de prueba; en producción: validar HTTPS y dominio no localhost.

---

## 5. Autenticación

### Header

```
Authorization: Bearer tlv_live_8f3k2m9p4q1n7x6w5v3b2a1c0d9e8f
```

### Proceso (middleware `authenticateApiKey`)

```mermaid
flowchart TD
  A[Request entrante] --> B{Header Bearer?}
  B -->|No| U401[401 UNAUTHORIZED]
  B -->|Sí| C[Parse token tlv_env_random]
  C --> D[Extraer key_prefix]
  D --> E[SELECT key WHERE prefix AND status=active]
  E -->|No encontrada| U401
  E -->|Encontrada| F[constant-time compare hash]
  F -->|Fallo| U401
  F -->|OK| G{expires_at?}
  G -->|Expirada| U401 EXPIRED
  G -->|OK| H{scope suficiente?}
  H -->|No| U403 FORBIDDEN
  H -->|Sí| I[Actualizar last_used_at]
  I --> J[Insert client_api_requests]
  J --> K[Adjuntar req.apiKey + req.companyId]
  K --> L[Handler]
```

### Algoritmo de hash (decisión congelada)

| Decisión | Detalle |
|----------|---------|
| **Algoritmo** | `key_hash = HMAC-SHA256(API_KEY_PEPPER, full_api_key)` codificado en hex (64 chars) |
| **Pepper** | Variable de entorno `API_KEY_PEPPER` — mínimo 32 bytes aleatorios; rotación planificada con re-hash progresivo |
| **Comparación** | `crypto.timingSafeEqual` sobre buffers de igual longitud |
| **No usar bcrypt** | Keys largas y alta frecuencia de auth lo hacen inadecuado operacionalmente |
| **No usar Argon2 en auth por request** | Reservado solo si en el futuro se almacenan otros secretos distintos a API Keys |

El pepper **no** se commitea; mismo tier de secreto que `JWT_SECRET`. Documentar en `.env.example` sin valor real.

### Generación al crear key

1. Generar 32 bytes aleatorios → codificar base62/hex.
2. Construir `full_key = tlv_{env}_ + random`.
3. Calcular `prefix` (primeros 20 chars).
4. Calcular `hash`.
5. Persistir `prefix`, `hash`, `masked` — **retornar `full_key` una sola vez** en JSON de creación.
6. UI muestra modal “copia ahora; no volveremos a mostrarla”.

---

## 6. Scopes

### Scopes iniciales (Fase 1 — congelado)

Estos tres scopes se asignan al crear keys en panel. Se almacenan en `client_api_keys.scopes`:

| Scope | Propósito en Fase 1 | Endpoint asociado (fase futura) |
|-------|---------------------|--------------------------------|
| `balance:read` | Metadata / preparación | `GET /api/v1/balance` (Fase 2) |
| `messages:read` | Metadata / preparación | `GET /api/v1/messages/*` (Fase 3+) |
| `sms:send` | Metadata / preparación | `POST /api/v1/sms/send` (Fase 3+) |

**Regla crítica:** aunque una key incluya `sms:send`, **Fase 1 no expone ningún endpoint público** que lo consuma. Asignar el scope no implica capacidad de envío hasta activación explícita en fases posteriores.

### Scopes adicionales (fases futuras)

| Scope | Endpoints | Fase |
|-------|-----------|------|
| `sms:bulk` | `POST /sms/bulk` | 3+ |
| `webhooks:write` | Config webhook vía panel (interno) | 6 |
| `webhooks:test` | `POST /webhooks/test` | 6 |

**Regla:** un endpoint puede exigir uno o más scopes (AND). Keys “solo lectura” en Fase 2+: `balance:read` + `messages:read`.

**Sandbox keys:** mismos scopes posibles; `environment = sandbox`; sin impacto en wallet producción.

---

## 7. Rate limits

> **Fase 1:** valores documentados; **no se implementan** contadores ni respuestas 429 hasta Fase 2+.

### Valores iniciales congelados

| Dimensión | Sandbox | Producción inicial | Alto volumen |
|-----------|---------|-------------------|--------------|
| **Por API Key** | 30 req/min | 120 req/min | Bajo aprobación admin (override en metadata o tabla admin) |
| **Por empresa** (suma keys) | 500 req/día | 10.000 req/día | Bajo aprobación admin |
| **Burst (token bucket)** | 5 tokens | 10 tokens | Configurable por admin |

Límites por endpoint (cuando existan rutas públicas):

| Endpoint | Sandbox (por key) | Producción (por key) |
|----------|-------------------|----------------------|
| `GET /balance` | 30/min | 120/min |
| `GET /messages*` | 30/min | 120/min |
| `POST /sms/send` | 10/min | 30/min (fase posterior) |
| `POST /sms/bulk` | 5/min | 10/min (fase posterior) |

### Respuesta 429 (fase posterior)

```json
{
  "ok": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Límite excedido. Reintenta en 42 segundos.",
    "retry_after": 42
  },
  "request_id": "req_01HXYZ"
}
```

Headers: `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

### Arquitectura de almacenamiento (sin Redis en v1)

| Fase | Implementación |
|------|----------------|
| **MVP** | Tabla `client_api_rate_limit_buckets` (`key_id`, `window`, `count`) con UPSERT y TTL por cron |
| **Escala** | Redis / Upstash con sliding window |
| **Edge** | Cloudflare rate limiting delante de `api.telvoice.cl` |

Clave compuesta: `rl:{api_key_id}:{endpoint}:{window_start}`.

---

## 8. Validación de saldo SMS

### Flujo propuesto (alineado con wallet actual)

El panel ya usa `getOrCreateCompanyWallet`, `available_sms`, y `walletTransactionService` / `hasSmsDebitForMessage`. La API debe seguir el **mismo servicio de dominio**, no SQL ad hoc.

```mermaid
flowchart TD
  A[POST /sms/send] --> B[Calcular segments]
  B --> C{Sandbox?}
  C -->|Sí| D[Simular débito / no wallet prod]
  C -->|No| E[getOrCreateCompanyWallet]
  E --> F{wallet.status active?}
  F -->|No| G[402 WALLET_FROZEN]
  F -->|Sí| H{available_sms >= segments?}
  H -->|No| I[402 INSUFFICIENT_BALANCE]
  H -->|Sí| J[Crear sms_api_messages accepted]
  J --> K[Debitar o reservar]
  K --> L[Encolar envío proveedor]
  L --> M{Éxito proveedor?}
  M -->|No| N[Reversar o marcar failed + ajuste wallet]
  M -->|Sí| O[status sent]
```

### Reserva vs débito inmediato

| Estrategia | Pros | Contras |
|----------|------|---------|
| **Débito inmediato** (como panel actual) | Simple, consistente con `smsSendService` | Requiere reversión explícita si falla proveedor |
| **Reserva (`reserved_sms`)** | Protege concurrencia | Más estados y jobs de liberación |

**Recomendación:** débito inmediato con transacción wallet + `wallet_transaction_id` en `sms_api_messages`, y función `reverseSmsDebitIfProviderFailed(message_id)` idempotente — reutilizando patrones de `hasSmsDebitForMessage`.

### Idempotencia y doble descuento (prerrequisito antes de wallet/envío real)

> **No implementar en Fase 1.** Obligatorio diseñar e implementar **antes** de Fase 4 (descuento wallet) y Fase 5 (proveedor SMS).

1. Header **`Idempotency-Key`** (UUID v4) en `POST /sms/send` y `POST /sms/bulk`.
2. UNIQUE `(company_id, idempotency_key)` en `sms_api_messages`.
3. Replay: devolver mismo `message id` y estado **sin** nuevo débito.
4. `walletTransactionService`: chequeo idempotente “ya debitado para este `message_id`”.

Fase 1 no define tablas `sms_api_messages` ni acepta este header.

### Cálculo de segmentos

Reutilizar lógica GSM-7 / UCS-2 del panel (plantillas). Respuesta API incluye `segments` en acceptance.

---

## 9. Webhooks DLR reales

> **Fuera de Fase 1.** La configuración visual de webhook en `client_api_settings` (URL, eventos, prueba simulada desde panel) **permanece como está**. No ejecutar HTTP saliente real ni tabla `client_webhook_deliveries` hasta Fase 6.

### Eventos (fase posterior)

| `event_type` | Cuándo |
|--------------|--------|
| `delivered` | DLR final positivo |
| `failed` | Fallo permanente |
| `expired` | Timeout sin DLR |
| `rejected` | Rechazo upstream |

Filtrar según `webhook_events` en `client_api_settings`.

### Payload ejemplo

```json
{
  "event": "delivered",
  "message_id": "msg_550e8400-e29b-41d4-a716-446655440000",
  "external_reference": "order-99881",
  "recipient": "+56912345678",
  "status": "delivered",
  "dlr_status": "delivered",
  "segments": 1,
  "cost_sms": 1,
  "timestamp": "2026-05-29T12:00:05Z"
}
```

### Firma HMAC (opcional, recomendado)

```
X-Telvoice-Signature: t=1716988805,v1=hex_hmac_sha256(secret, t + "." + raw_body)
```

Secret generado en panel, almacenado hasheado; mostrado una vez.

### Reintentos

| Intento | Backoff |
|---------|---------|
| 1 | Inmediato |
| 2 | 1 min |
| 3 | 5 min |
| 4 | 15 min |
| 5 | 1 h |
| 6 | 4 h |

**Máximo:** 6 intentos → `status = failed`. Job cron / queue worker procesa `next_retry_at`.

### Validaciones de seguridad

- Solo HTTPS en producción.
- Timeout HTTP 10s.
- No seguir redirects a dominios no allowlisted.
- Registrar cada intento en `client_webhook_deliveries`.

---

## 10. Evolución del panel cliente `/app/api`

> **Fase 1** extiende el panel con gestión de keys reales vía rutas `/app/*` (sesión). **No modificar** el comportamiento demo existente hasta integración explícita; convivencia temporal demo + keys reales.

| Funcionalidad | Fase 1 | Fases posteriores |
|---------------|--------|-------------------|
| **Crear API Key real** | Sí — modal, scopes, environment, key **una vez** | — |
| **Listar keys** | Sí — masked, status, scopes, `last_used_at` (null o fecha) | Logs de requests |
| **Revocar / pausar / activar** | Sí — cliente sobre sus keys | — |
| **Regenerar** | Opcional Fase 1b: revocar + crear nueva | Grace period |
| **Webhook URL/eventos** | Sin cambio — `client_api_settings` visual | Webhooks reales Fase 6 |
| **Probar webhook** | Solo toast visual existente | HTTP real Fase 6 |
| **Demo key** | Mantener `api_key_demo` no funcional | Deprecar en UI |
| **SMPP solicitud** | Flag visual existente | Workflow admin |

**Separación de datos (congelada):**

- `client_api_settings` → webhook, SMPP, estado visual, demo.
- `client_api_keys` → credenciales reales (hash, prefix, masked).

---

## 11. Panel admin (futuro)

> **Fuera de Fase 1.** Revocación global, aprobación de producción y overrides de rate limit requieren **admin/superadmin** en fase dedicada (Fase 1b o Fase 7 según prioridad).

Ruta sugerida: `/admin/api` o sección en detalle de empresa.

| Vista | Fase | Acciones |
|-------|------|----------|
| **Keys por empresa** | Posterior | Listar todas las keys, pausar, revocar globalmente |
| **Aprobar producción API** | Posterior | Flag `api_production_enabled` por empresa antes de keys `tlv_live_*` |
| **Revocación global** | Posterior | Superadmin revoca key comprometida sin acción del cliente |
| **Consumo / errores** | Posterior | `client_api_requests`, SMS API |
| **Rate limits override** | Posterior | Alto volumen bajo aprobación |
| **Webhooks fallidos** | Fase 6 | Cola `client_webhook_deliveries` |
| **SMPP** | Posterior | Workflow comercial/técnico |
| **Auditoría** | Posterior | Creación/revocación keys |

Permisos: `superadmin` / rol `api_admin` futuro. En Fase 1 el cliente gestiona **solo** keys de su propia empresa vía panel.

---

## 12. Roadmap de implementación por fases

| Fase | Entregable | Fuera de alcance |
|------|------------|------------------|
| **1 — Keys (próxima)** | Migración `client_api_keys`; servicio generación/HMAC; panel crear/listar/revocar/pausar; scopes; sandbox/prod; `last_used_at` null | API pública `/api/v1/*`, wallet, SMS, webhooks reales, rate limits activos, admin global |
| **2 — Balance** | `GET /api/v1/balance`; auth + `client_api_requests`; rate limits MVP | Envío SMS |
| **3 — Send sandbox** | `POST /sms/send` simulado; `sms_api_messages`; scope `sms:send` activo solo aquí | Wallet prod |
| **4 — Wallet** | Débito + **`Idempotency-Key`** + reversión | Proveedor real |
| **5 — Proveedor** | Cola SMSC; `provider_message_id` | — |
| **6 — DLR/Webhooks** | `client_webhook_deliveries`; HTTP saliente real | — |
| **7 — Escala** | Redis limits; admin tools; bulk | — |

**Criterio de “go live” producción:** fases 1–4 completas + pruebas de carga + auditoría seguridad + RLS diseñado.

---

## 13. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Exposición de API Keys | Crítico | Hash + mostrar una vez + rotación + alertas uso anómalo |
| Doble descuento saldo | Alto | Idempotency-Key + `wallet_transaction_id` + checks existentes |
| Envío duplicado | Alto | Idempotencia + UNIQUE external_reference |
| Falta idempotencia cliente | Medio | Documentar header obligatorio; 409 en conflicto |
| Abuso / DDoS | Alto | Rate limits + WAF + pausar key |
| Webhook SSRF | Alto | Validar URL, no redirects, allowlist opcional |
| Saturación proveedor | Alto | Colas, TPS por empresa (ver `traffic-control-tps.md`) |
| Saldo visual ≠ real | Medio | Una fuente: `company_sms_wallets` |
| RLS mal configurado | Alto | Service role en API; RLS solo panel con políticas estrictas |
| Logs con PII | Medio | Retención limitada; enmascarar teléfonos en logs |
| Key en query string | Crítico | Rechazar auth fuera de header |
| Rotación sin grace | Bajo | Opcional overlap 24h dos hashes |

---

## 14. Recomendaciones finales

1. **No usar `client_api_settings` para secretos.** Mantenerla para webhook URL, eventos, flags UI y metadata. Credenciales en `client_api_keys`.

2. **Crear `client_api_keys` separada** con `key_prefix` + `key_hash` + `key_masked`.

3. **Hash:** `HMAC-SHA256(API_KEY_PEPPER, full_key)` con `crypto.timingSafeEqual`. Variable `API_KEY_PEPPER` obligatoria en Fase 1.

4. **Prefix** de 16–20 caracteres indexado UNIQUE para auth O(1).

5. **Mostrar key completa solo una vez** al crear; después solo masked.

6. **API pública separada** de `/app` — router `/api/v1`, middleware propio, sin cookies de sesión.

7. **Empezar en sandbox** (`tlv_test_...`, wallet simulado, DLR simulado) antes de `tlv_live_...`.

8. **No descontar saldo real** hasta idempotencia + logs + reversión de fallo proveedor diseñados y probados.

9. **Reutilizar** `smsWalletService`, `walletTransactionService`, `smsSendService` (o extraer `SmsDispatchPort` compartido panel/API).

10. **Reutilizar** patrón `sms_send_idempotency` adaptado a `sms_api_messages.idempotency_key`.

11. **RLS:** planificar en fase 1 de tablas nuevas pero activar cuando panel lea keys vía Supabase cliente; API usa service role con validación `company_id` en código.

12. **Observabilidad:** `request_id` en todas las respuestas; correlación con `client_api_requests` y `sms_api_messages`.

13. **Documentación pública:** OpenAPI 3.1 generado desde este diseño; changelog de versiones `/api/v1`.

14. **No modificar** rutas de compra, MercadoPago, auth ni envío panel existente hasta integración explícita en fase 4–5.

---

## Anexo A — Mapeo con código actual (referencia)

| Existente | Uso en API futura |
|-----------|-------------------|
| `company_sms_wallets` | Fuente de verdad saldo |
| `walletTransactionService` | Débitos/créditos |
| `hasSmsDebitForMessage` | Anti doble débito |
| `sms_send_idempotency` | Modelo a copiar para API |
| `smsSendService` | Dispatch unitario |
| `client_api_settings` | Webhook config UI (sin secretos) |
| `/app/api` UI | Evolucionar; no es API pública |

---

## Anexo B — Checklist pre-implementación

- [x] Aprobar formato de key (`tlv_live_` / `tlv_test_`)
- [x] Aprobar algoritmo hash (HMAC-SHA256 + `API_KEY_PEPPER`)
- [x] Aprobar scopes iniciales Fase 1 y rate limits documentados
- [x] Confirmar separación `client_api_keys` vs `client_api_settings`
- [ ] Definir dominio `api.telvoice.cl` e infra (TLS, WAF)
- [ ] Política retención logs y PII
- [ ] Plan RLS Supabase
- [ ] Plan sandbox vs producción (wallets separados o flag)
- [ ] Contrato OpenAPI revisado con cliente piloto
- [ ] Runbook revocación de key comprometida
- [ ] Generar y cargar `API_KEY_PEPPER` en VPS / secret manager

---

## Decisiones congeladas antes de Fase 1

Esta sección fija las decisiones técnicas **aprobadas** para iniciar implementación de Fase 1 (API Keys reales **sin** envío SMS).

### Formato de API Key

| Item | Decisión |
|------|----------|
| Producción | `tlv_live_<token>` — 32 chars `[a-z0-9]` |
| Sandbox | `tlv_test_<token>` — mismo formato |
| Mostrar completa | **Una sola vez** al crear |
| Persistir | `key_prefix` (20 chars), `key_hash`, `key_masked` |
| Prohibido | Key real en texto plano en BD, logs o `client_api_settings` |

### Hash

| Item | Decisión |
|------|----------|
| Algoritmo | HMAC-SHA256 |
| Pepper | Env var **`API_KEY_PEPPER`** (≥32 bytes, secreto) |
| Comparación | `crypto.timingSafeEqual` |
| No usar | bcrypt, Argon2 en validación por request |

### Tabla y separación

| Tabla | Rol |
|-------|-----|
| **`client_api_keys`** (nueva, Fase 1) | Secretos: prefix, hash, masked, scopes, status, environment |
| **`client_api_settings`** (existente) | Solo visual: webhook URL/eventos, SMPP flag, demo key no funcional, estado UI |

### Alcance exacto de Fase 1

**Incluye:**

- Migración y servicio `client_api_keys`
- Panel cliente (rutas `/app/*` autenticadas): crear, listar (masked), revocar, pausar, reactivar
- Scopes almacenados: `balance:read`, `messages:read`, `sms:send` (sin endpoint que los use aún)
- Ambientes `sandbox` / `production` en columna `environment`
- `last_used_at` = `NULL` hasta existir API pública autenticada (Fase 2)
- Generación CSPRNG + HMAC + modal “copia ahora”

**Queda explícitamente fuera de Fase 1:**

- Cualquier endpoint público `/api/v1/*` (incl. `/sms/send`, `/balance`, `/messages`)
- Descuento o consulta de wallet real
- Integración proveedor / SMSC / envío SMS
- Tablas `sms_api_messages`, `client_api_requests`, `client_webhook_deliveries`
- Webhooks DLR reales (HTTP saliente)
- Rate limiting activo (429)
- Header `Idempotency-Key` operativo
- Panel admin: aprobación producción, revocación global, overrides de volumen
- RLS habilitado (planificar, no activar en Fase 1)
- Modificar `/app/api` demo existente más allá de añadir sección keys reales (integración incremental acordada en implementación)

### Scopes iniciales

`balance:read`, `messages:read`, `sms:send` — asignables al crear key; **`sms:send` no habilita envío** hasta Fase 3+.

### Rate limits (documentados, no implementados)

| | Sandbox | Producción |
|---|---------|------------|
| Por key | 30/min | 120/min |
| Por empresa / día | 500 | 10.000 |
| Alto volumen | Requiere aprobación admin | Requiere aprobación admin |

### Idempotencia

Diseño obligatorio **antes** de Fase 4 (wallet) y Fase 5 (proveedor). Header futuro: `Idempotency-Key`. **No Fase 1.**

### Webhooks

Config visual en `client_api_settings` se mantiene. **Sin** entregas HTTP reales ni worker DLR en Fase 1.

### Panel admin

Aprobación de producción, revocación global y límites elevados: **fase posterior**, rol superadmin.

### Variables de entorno necesarias (Fase 1)

| Variable | Obligatoria Fase 1 | Uso |
|----------|-------------------|-----|
| `API_KEY_PEPPER` | **Sí** | HMAC de API Keys |
| `DATABASE_URL` / Supabase | Sí (existente) | Persistencia |
| `JWT_SECRET` | Sí (existente) | Panel `/app/*` — sin cambios |

Variables **futuras** (no Fase 1): Redis URL, webhook signing pepper, flags TPS proveedor.

### Riesgos aún pendientes (post-diseño)

| Riesgo | Estado |
|--------|--------|
| Exposición de key en creación (UX/log) | Mitigar en implementación Fase 1 |
| Confusión demo key vs key real en UI | Diseño UI dual temporal |
| `API_KEY_PEPPER` ausente en VPS | Checklist deploy |
| Scope `sms:send` sin endpoint | Documentar en panel; no implica envío |
| RLS no activo | Aceptado Fase 1; planificar Fase 2+ |
| Rotación de pepper | Runbook futuro |
| Idempotencia / doble débito | Bloqueante antes de Fase 4 — aún no implementado |
| Webhook SSRF | Bloqueante Fase 6 — fuera de Fase 1 |

---

*Documento revisado para cierre de decisiones pre-Fase 1. No implica cambios en código productivo, base de datos ni despliegue.*
