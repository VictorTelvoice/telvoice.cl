# Despliegue Telvoice.cl en Vercel

Sitio estático en la **raíz del repo** (`index.html`, `ayuda/`, `api/`, etc.). El backend Express vive en `telvoice-sms-agent/` y se despliega aparte en **agent.telvoice.cl**.

## Si el landing muestra 404 NOT_FOUND

1. **Vercel → proyecto telvoice.cl → Settings → General → Root Directory**  
   Debe estar **vacío** (raíz del repo), **no** `telvoice-sms-agent`.

2. **Build & Development Settings**
   - Framework Preset: **Other**
   - Build Command: vacío (o el de `vercel.json`)
   - Output Directory: vacío (no `dist`, no `public` solo)

3. **Redeploy** el último commit de `main` (o *Promote* el deployment anterior que funcionaba).

4. Comprobar en el deployment → pestaña **Output** que exista `index.html` en la raíz.

## Archivos de configuración en el repo

| Archivo | Rol |
|---------|-----|
| `vercel.json` | Sitio estático + funciones `api/**/*.js` |
| `.vercelignore` | Excluye `telvoice-sms-agent` del upload del sitio web |

## Variables de entorno (proyecto www)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (agente web y pedidos).
