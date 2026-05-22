# Configuración simple — Telvoice SMS Agent

Guía paso a paso para dejar el proyecto funcionando en tu computador, **sin ser experto en programación**.

Tiempo estimado: **15–20 minutos**.

---

## Lo que vas a necesitar

1. Una cuenta en [Supabase](https://supabase.com) (gratis).
2. Tu contraseña de API **aSMSC/Telvoice**.
3. Node.js 18 o superior instalado.

---

## Paso 1 — Entrar a Supabase

1. Abre https://supabase.com/dashboard  
2. Entra a tu proyecto (o crea uno nuevo si no tienes).

---

## Paso 2 — Copiar las claves de Supabase

1. En el menú izquierdo, ve a **Project Settings** (engranaje).
2. Entra a **API** (a veces aparece como **Data API**).
3. Copia y guarda en un bloc de notas:
   - **Project URL** → será tu `SUPABASE_URL`
   - **service_role** (clave secreta, botón “Reveal”) → será tu `SUPABASE_SERVICE_ROLE_KEY`

> Importante: la clave `service_role` es secreta. No la compartas ni la subas a internet.

---

## Paso 3 — Instalar dependencias del proyecto

Abre la terminal en la carpeta `telvoice-sms-agent` y ejecuta:

```bash
npm install
```

---

## Paso 4 — Crear el archivo `.env`

```bash
npm run setup:env
```

Esto crea el archivo `.env` con valores de ejemplo y **genera automáticamente** `JWT_SECRET` y `SESSION_SECRET`.

Si ya tenías un `.env` y quieres volver a crearlo:

```bash
npm run setup:env:force
```

---

## Paso 5 — Completar el archivo `.env`

Abre el archivo `.env` (está en la carpeta `telvoice-sms-agent`) con cualquier editor de texto.

**Debes cambiar solo estos 3 valores:**

| Variable | Qué poner |
|----------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Pega la clave **service_role** de Supabase (Paso 2) |
| `ASMSC_API_PASSWORD` | Tu contraseña real de API aSMSC |
| `SUPERADMIN_PASSWORD` | La contraseña que quieres usar para entrar al panel admin |

Opcional: si tu Project URL de Supabase es distinta, actualiza también `SUPABASE_URL`.

Guarda el archivo.

---

## Paso 6 — Crear las tablas en Supabase

1. En Supabase, ve a **SQL Editor** (menú izquierdo).
2. Clic en **New query**.
3. Abre en tu computador el archivo:  
   `telvoice-sms-agent/supabase/setup_all.sql`
4. **Copia todo** el contenido y pégalo en el editor SQL de Supabase.
5. Clic en **Run** (o Ctrl+Enter).
6. Debe decir **Success** sin errores rojos.

---

## Paso 7 — Crear tu usuario administrador

En la terminal:

```bash
npm run seed:admin
```

Debe decir algo como: `Superadmin creado: admin@telvoice.cl`

---

## Paso 8 — Verificar que todo está bien

```bash
npm run verify:setup
```

Si todo está correcto verás varios mensajes **OK:** y al final podrás iniciar el servidor.

Si hay **ERROR:**, lee el mensaje, corrige el `.env` o vuelve a ejecutar el SQL del Paso 6.

---

## Paso 9 — Iniciar el servidor

```bash
npm run dev
```

Deja esta ventana abierta mientras uses el sistema.

---

## Paso 10 — Entrar al panel administrativo

Abre en el navegador:

**http://localhost:3001/admin/login**

| Campo | Valor |
|-------|--------|
| Correo | `admin@telvoice.cl` |
| Contraseña | La que pusiste en `SUPERADMIN_PASSWORD` |

---

## Resumen rápido (comandos en orden)

```bash
npm install
npm run setup:env
# → editar .env (3 valores)
# → ejecutar supabase/setup_all.sql en Supabase SQL Editor
npm run seed:admin
npm run verify:setup
npm run dev
```

Panel: http://localhost:3001/admin/login

---

## Producción (más adelante)

Cuando despliegues en **https://agent.telvoice.cl**, cambia en `.env`:

```env
PUBLIC_APP_URL=https://agent.telvoice.cl
PUBLIC_WEBHOOK_BASE_URL=https://agent.telvoice.cl
NODE_ENV=production
```

---

## ¿Problemas?

| Síntoma | Solución |
|---------|----------|
| `ERROR: falta SUPABASE_SERVICE_ROLE_KEY` | Edita `.env` y pega la clave service_role |
| `ERROR: migraciones no ejecutadas` | Ejecuta `supabase/setup_all.sql` en SQL Editor |
| No puedo entrar al login | Ejecuta `npm run seed:admin` de nuevo |
| Credenciales inválidas | Revisa `SUPERADMIN_PASSWORD` en `.env` |

Para más detalle técnico, ver `README.md`.
