# Telvoice SMS Agent

Agente backend en **Node.js**, **Express** y **TypeScript** para enviar SMS, persistir trazabilidad en **Supabase/PostgreSQL** y recibir callbacks DLR usando la API REST de **aSMSC/Telvoice**.

## Requisitos

- Node.js 18+
- Proyecto Supabase (PostgreSQL)
- Credenciales aSMSC

## Configuración rápida para Victor / Telvoice

**Guía simple (recomendada):** lee [SETUP_SIMPLE.md](./SETUP_SIMPLE.md)

```bash
cd telvoice-sms-agent
npm install
npm run setup:env
```

1. Abre `.env` y completa **3 valores**: `SUPABASE_SERVICE_ROLE_KEY`, `ASMSC_API_PASSWORD`, `SUPERADMIN_PASSWORD`
2. En Supabase SQL Editor, ejecuta **un solo archivo**: `supabase/setup_all.sql`
3. Luego:

```bash
npm run seed:admin
npm run verify:setup
npm run dev
```

4. Panel admin: http://localhost:3001/admin/login (`admin@telvoice.cl` + tu `SUPERADMIN_PASSWORD`)

| Comando | Para qué sirve |
|---------|----------------|
| `npm run setup:env` | Crea `.env` con secretos automáticos |
| `npm run setup:env:force` | Regenera `.env` (sobrescribe) |
| `npm run verify:setup` | Comprueba .env, Supabase y tablas |
| `npm run seed:admin` | Crea usuario superadmin |

## Variables de entorno

```bash
cp .env.example .env
```

| Variable | Descripción |
|----------|-------------|
| `ASMSC_BASE_URL` | Base URL API aSMSC |
| `ASMSC_API_ID` | ID de API |
| `ASMSC_API_PASSWORD` | Contraseña API |
| `ASMSC_DEFAULT_SENDER_ID` | Remitente por defecto |
| `PUBLIC_WEBHOOK_BASE_URL` | URL pública para `callback_url` DLR (prod: `https://agent.telvoice.cl`) |
| `PUBLIC_APP_URL` | URL base del agente (prod: `https://agent.telvoice.cl`) |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (solo servidor) |
| `ENCRYPTION_KEY` | Reservada para cifrado de contraseñas API |
| `PORT` | Puerto HTTP (default `3001`) |
| `SUPERADMIN_EMAIL` | Correo del superadmin inicial |
| `SUPERADMIN_PASSWORD` | Contraseña del superadmin (solo para `seed:admin`) |
| `SUPERADMIN_NAME` | Nombre visible del superadmin |
| `JWT_SECRET` | Firma de sesión JWT del panel admin |
| `SESSION_SECRET` | Secreto de sesión (requerido junto a JWT) |
| `TELEGRAM_BOT_TOKEN` | Token del bot (BotFather) |
| `TELEGRAM_ALLOWED_USER_IDS` | IDs de usuario Telegram autorizados (separados por coma) |
| `TELEGRAM_MODE` | `polling` (local) o `webhook` (producción) |
| `TELEGRAM_WEBHOOK_SECRET` | Secreto opcional para validar webhook |
| `TELEGRAM_WEBHOOK_PATH` | Ruta webhook (default `/api/telegram/webhook`) |

## Instalación

```bash
cd telvoice-sms-agent
npm install
```

## Migración en Supabase

1. Abre **Supabase Dashboard** → **SQL Editor**.
2. Ejecuta **`supabase/setup_all.sql`** (un solo archivo, incluye todo).
3. O por separado: `001_initial_schema.sql` + `002_admin_users.sql`.
4. Verifica con `npm run verify:setup`.

Con CLI:

```bash
supabase link --project-ref <tu-project-ref>
supabase db push
```

Al arrancar (`npm run dev`), se crean automáticamente el cliente **PRUEBA_TELVOICE** y su cuenta SMS si no existen.

## Panel administrativo

**Producción:** https://agent.telvoice.cl/admin  
**Login:** https://agent.telvoice.cl/admin/login

El panel es HTML server-rendered (sin React). Rutas protegidas con cookie JWT httpOnly.

### Crear superadmin

```bash
# Configura SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, JWT_SECRET, SESSION_SECRET en .env
npm run seed:admin
```

### Vistas del panel

| Ruta | Descripción |
|------|-------------|
| `GET /admin/login` | Formulario de acceso |
| `GET /admin` | Dashboard (estado, cliente prueba, balance CL, últimos 50 SMS) |
| `GET /admin/messages/:id` | Detalle SMS + DLR + JSON raw |
| `GET /admin/clients/test` | Cliente PRUEBA_TELVOICE, cuenta SMS y usuarios Telegram |
| `GET /admin/clients/test/telegram-users` | Gestión de usuarios Telegram del cliente prueba |

### Despliegue en agent.telvoice.cl

Apunta el dominio al proceso Node (puerto `PORT`). Configura:

```env
PUBLIC_APP_URL=https://agent.telvoice.cl
PUBLIC_WEBHOOK_BASE_URL=https://agent.telvoice.cl
NODE_ENV=production
```

Rutas públicas esperadas:

- `https://agent.telvoice.cl/health`
- `https://agent.telvoice.cl/api/...`
- `https://agent.telvoice.cl/api/webhooks/asmsc/dlr`
- `https://agent.telvoice.cl/admin`

## Bot de Telegram

Primera versión para enviar SMS rápidos desde Telegram reutilizando `sendTestSms` (mismo flujo que el panel y la API).

### Cómo autorizar un usuario Telegram (por cliente)

Cada cliente puede tener usuarios Telegram autorizados en la base de datos (tabla `client_telegram_users`).

1. **Migración:** ejecuta en Supabase `supabase/migrations/003_client_telegram_users.sql` (o usa `setup_all.sql` actualizado en instalaciones nuevas).
2. **Obtén tu Telegram user_id** con [@userinfobot](https://t.me/userinfobot) (solo dígitos).
3. Abre el panel: http://localhost:3001/admin/clients/test
4. En la sección **Usuarios Telegram autorizados**, clic en **Agregar usuario Telegram**.
5. Completa `telegram_user_id`, rol (`owner` / `operator` / `viewer`) y guarda.
6. Si el bot ya está corriendo con `npm run dev`, reinícialo tras agregar usuarios (para futuras versiones que lean la base de datos).

Gestión completa: `/admin/clients/test/telegram-users`

El servicio `getAuthorizedTelegramClient(telegramUserId)` resuelve cliente + permisos según rol (preparado para el bot).

### 1. Crear el bot con BotFather

1. En Telegram abre [@BotFather](https://t.me/BotFather).
2. Envía `/newbot` y sigue los pasos.
3. Copia el **token** que te entrega (formato `123456:ABC-DEF...`).

### 2. Configurar `.env`

```env
TELEGRAM_BOT_TOKEN=PEGAR_TOKEN_DE_BOTFATHER
TELEGRAM_ALLOWED_USER_IDS=123456789
TELEGRAM_MODE=polling
```

Varios usuarios autorizados:

```env
TELEGRAM_ALLOWED_USER_IDS=123456789,987654321
```

### 3. Obtener tu Telegram `user_id`

Opciones:

- Usa [@userinfobot](https://t.me/userinfobot) o [@getidsbot](https://t.me/getidsbot) y copia tu **Id**.
- O envía un mensaje a tu bot y revisa los logs del servidor (campo `from.id`).

Ese número va en `TELEGRAM_ALLOWED_USER_IDS`.

### 4. Verificar conexión

```bash
npm run telegram:get-me
```

Debe mostrar ID, nombre y username del bot (nunca imprime el token).

### 5. Iniciar en local (polling)

```bash
npm run dev
```

Con `TELEGRAM_MODE=polling` el servidor:

- Llama `deleteWebhook` al arrancar (evita conflicto con polling).
- Ejecuta `getUpdates` en loop sin bloquear Express.

### 6. Comandos del bot

| Comando | Descripción |
|---------|-------------|
| `/start` | Mensaje de bienvenida y comandos |
| `/ayuda` | Cómo enviar SMS y confirmar |
| `/saldo` | Balance interno CL + balance aSMSC |
| `/historial` | Últimos 5 SMS |
| `/enviar 569XXXXXXXX mensaje` | Prepara envío (no envía aún) |

Tras `/enviar`, responde con un código de 4 dígitos. Para confirmar:

```text
CONFIRMAR 1234
```

Para cancelar:

```text
CANCELAR
```

La confirmación vence a los **5 minutos**. El SMS usa sender `TELVOICE`, tipo `P` y encoding `T` por defecto, y pasa por el mismo servicio que `/api/sms/send-test`.

### 7. Webhook (producción, preparado)

Ruta: `POST /api/telegram/webhook`

No se activa `setWebhook` automáticamente en desarrollo. En producción, cuando tengas dominio público:

```env
TELEGRAM_MODE=webhook
PUBLIC_WEBHOOK_BASE_URL=https://agent.telvoice.cl
TELEGRAM_WEBHOOK_SECRET=un-secreto-largo-aleatorio
```

URL completa del webhook: `https://agent.telvoice.cl/api/telegram/webhook`

Diagnóstico en el panel: `/admin/telegram/diagnostics`

## Desarrollo

```bash
npm run dev
```

Local: http://localhost:3001/admin

## Endpoints API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/health` | Estado del servicio |
| `GET` | `/api/clients/test` | Cliente de prueba + cuenta SMS |
| `POST` | `/api/sms/send-test` | Envío de prueba con persistencia |
| `GET` | `/api/sms/messages` | Últimos 50 SMS |
| `GET` | `/api/sms/messages/:id` | SMS por ID interno |
| `GET` | `/api/sms/messages/by-uid/:uid` | SMS por uid |
| `POST` | `/api/webhooks/asmsc/dlr` | Webhook DLR aSMSC |
| `POST` | `/api/telegram/webhook` | Webhook Telegram (modo webhook) |
| `GET` | `/api/asmsc/balance` | Saldo en proveedor |

## Probar con curl

### Cliente de prueba

```bash
curl http://localhost:3001/api/clients/test
```

### Enviar SMS de prueba

```bash
curl -X POST http://localhost:3001/api/sms/send-test \
  -H "Content-Type: application/json" \
  -d '{
    "phonenumber": "56912345678",
    "textmessage": "Mensaje de prueba Telvoice",
    "sender_id": "TELVOICE",
    "sms_type": "T",
    "encoding": "T"
  }'
```

Respuesta incluye: `internal_message_id`, `uid`, `provider_message_id`, `provider_status`, `status`, `remarks`, `provider_response`.

### Listar SMS recientes

```bash
curl http://localhost:3001/api/sms/messages
```

### Consultar por uid

```bash
curl http://localhost:3001/api/sms/messages/by-uid/tv-<uuid>
```

### Simular DLR manualmente

```bash
curl -X POST http://localhost:3001/api/webhooks/asmsc/dlr \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "tv-<uuid-devuelto>",
    "message_id": "12345",
    "PhoneNumber": "56912345678",
    "DLRStatus": "Delivered",
    "SMSID": "sms-001",
    "ClientCost": 1,
    "ErrorCode": "",
    "ErrorDescription": "",
    "Remarks": ""
  }'
```

Estados DLR normalizados:

- `Delivered` → `delivered`
- `Failed`, `Undeliverable`, `Rejected`, `Expired`, `DND` → `failed`
- `Pending`, `Accepted`, `Acknowledged`, `Unknown` → `pending`
- Otro valor → `unknown`

### Saldo proveedor

```bash
curl http://localhost:3001/api/asmsc/balance
```

## Logs en consola

- `[SMS] Registro creado internamente`
- `[SMS] Enviado a proveedor`
- `[DLR] Recibido`
- `[SMS] Actualizado por DLR`

## Scripts

```bash
npm run dev        # Desarrollo
npm run typecheck  # Verificación TypeScript
npm run build      # Compilar
npm start          # Producción
npm run setup:env      # Crear .env inicial
npm run verify:setup   # Verificar configuración
npm run seed:admin     # Crear superadmin en Supabase
npm run telegram:get-me  # Verificar bot Telegram (getMe)
```

## Seguridad

- `api_password_encrypted` se guarda como placeholder en claro. Hay un `TODO` para cifrado real con `ENCRYPTION_KEY` antes de producción.
- No expongas `SUPABASE_SERVICE_ROLE_KEY` en el frontend.

## Marca Telvoice

Proyecto alineado con [Telvoice.cl](https://www.telvoice.cl/).
