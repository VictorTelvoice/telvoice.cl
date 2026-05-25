# Despliegue en producción — agent.telvoice.cl

Guía paso a paso para publicar **Telvoice SMS Agent** en un VPS Ubuntu con Node.js, PM2, Nginx y SSL.

**URL objetivo del panel:** https://agent.telvoice.cl/admin

---

## Resumen de URLs en producción

| Recurso | URL |
|---------|-----|
| Dashboard admin | https://agent.telvoice.cl/admin |
| Login admin | https://agent.telvoice.cl/admin/login |
| Health check | https://agent.telvoice.cl/health |
| **Webhook DLR (configurar en aSMSC)** | **https://agent.telvoice.cl/api/webhooks/asmsc/dlr** |

La URL DLR se construye como: `PUBLIC_WEBHOOK_BASE_URL` + `/api/webhooks/asmsc/dlr`

---

## Paso 1 — DNS (antes del servidor)

En tu proveedor de dominio (`telvoice.cl`), crea un registro **A**:

| Tipo | Nombre / Host | Valor |
|------|---------------|-------|
| A | `agent` | IP pública del VPS |

Resultado: `agent.telvoice.cl` → IP del VPS.

Espera la propagación DNS (minutos a horas) antes de ejecutar Certbot.

---

## Paso 2 — Preparar VPS Ubuntu

Conéctate por SSH al VPS:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nginx certbot python3-certbot-nginx
```

Instala Node.js 20 LTS:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

Verifica:

```bash
node -v   # v18+ o v20+
npm -v
pm2 -v
```

---

## Paso 3 — Subir el proyecto

```bash
sudo mkdir -p /var/www/telvoice-sms-agent
sudo chown $USER:$USER /var/www/telvoice-sms-agent
cd /var/www/telvoice-sms-agent
```

Clona el repositorio o copia los archivos (`git clone`, `rsync` o `scp`).

---

## Paso 4 — Crear `.env` de producción

```bash
cp .env.production.example .env
nano .env
```

Completa como mínimo:

| Variable | Ejemplo / nota |
|----------|----------------|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `PUBLIC_APP_URL` | `https://agent.telvoice.cl` |
| `PUBLIC_WEBHOOK_BASE_URL` | `https://agent.telvoice.cl` |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | clave `service_role` |
| `ASMSC_API_ID` | tu API ID |
| `ASMSC_API_PASSWORD` | tu password |
| `ASMSC_DEFAULT_SENDER_ID` | `TELVOICE` |
| `ASMSC_DEFAULT_SMS_TYPE` | `P` |
| `SUPERADMIN_EMAIL` | `victor@telvoice.net` |
| `SUPERADMIN_PASSWORD` | contraseña segura |
| `JWT_SECRET` | string aleatorio largo |
| `SESSION_SECRET` | otro string aleatorio largo |

Generar secretos en el servidor:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> No subas `.env` al repositorio. Solo debe existir en el VPS.

---

## Paso 5 — Instalar dependencias y compilar

```bash
cd /var/www/telvoice-sms-agent
npm install
npm run typecheck
npm run build
npm run verify:setup
npm run seed:admin
```

Comandos de referencia:

```bash
npm run typecheck
npm run build
npm run seed:admin
npm start
```

---

## Paso 6 — Whitelist IP en aSMSC

Obtén la IP pública del VPS:

```bash
curl https://api.ipify.org
```

En el panel aSMSC → **API** → **Add Whitelist IP**, agrega esa IP.

También puedes verificar desde el panel tras el deploy:

https://agent.telvoice.cl/admin/asmsc/diagnostics

Ahí verás: IP pública detectada, API ID, SMS type default, Callback URL DLR y resultado de CheckBalance.

---

## Paso 7 — Levantar con PM2

```bash
cd /var/www/telvoice-sms-agent
pm2 start dist/index.js --name telvoice-sms-agent
pm2 save
pm2 startup
```

Ejecuta el comando que `pm2 startup` te indique (copia/pega la línea `sudo env ...`).

Ver logs:

```bash
pm2 logs telvoice-sms-agent
```

Otros comandos útiles:

```bash
pm2 status
pm2 restart telvoice-sms-agent
pm2 logs telvoice-sms-agent --lines 100
```

---

## Paso 8 — Nginx (reverse proxy)

Crea el archivo `/etc/nginx/sites-available/agent.telvoice.cl` con este contenido (listo para copiar):

```nginx
server {
    listen 80;
    server_name agent.telvoice.cl;

    # Compresión HTML/CSS/JSON (panel SSR)
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 256;
    gzip_types text/plain text/css text/javascript application/javascript application/json application/xml image/svg+xml;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Webhook DLR aSMSC — body POST completo
        client_max_body_size 1m;
    }
}
```

Activa el sitio:

```bash
sudo ln -sf /etc/nginx/sites-available/agent.telvoice.cl /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Prueba HTTP (antes del SSL):

```bash
curl -s http://agent.telvoice.cl/health
```

---

## Paso 9 — SSL con Certbot

Con el DNS ya propagado:

```bash
sudo certbot --nginx -d agent.telvoice.cl
```

Certbot configura HTTPS automáticamente. La renovación queda programada por defecto.

---

## Paso 10 — Verificación post-deploy

### 10.1 Health

```bash
curl -s https://agent.telvoice.cl/health
```

Debe responder JSON con estado OK.

### 10.2 Login admin

Abre en el navegador:

https://agent.telvoice.cl/admin/login

Inicia sesión con `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD`.

### 10.3 Dashboard y URL DLR

En https://agent.telvoice.cl/admin el panel muestra:

```
https://agent.telvoice.cl/api/webhooks/asmsc/dlr
```

Configura esa misma URL en aSMSC como callback DLR.

### 10.4 Diagnóstico aSMSC

https://agent.telvoice.cl/admin/asmsc/diagnostics

- IP pública del servidor
- API ID
- SMS type default (`P` o `T`)
- Callback URL DLR
- CheckBalance (debe responder sin error de IP)

### 10.5 Webhook DLR

aSMSC debe poder hacer `POST` a:

```
https://agent.telvoice.cl/api/webhooks/asmsc/dlr
```

Envía un SMS de prueba desde el panel y confirma en el detalle del mensaje que llega el DLR real (`delivered`).

---

## Actualizar versión en el VPS

```bash
cd /var/www/telvoice-sms-agent
git pull origin main
# Si el clone es el monorepo completo:
# cd telvoice-sms-agent
npm ci
npm run build
pm2 restart telvoice-sms-agent
```

O ejecuta: `bash scripts/deploy-vps.sh` (desde la carpeta del agente en el servidor).

### Deploy automático (GitHub Actions)

En el repo, el workflow `.github/workflows/deploy-agent.yml` despliega al hacer push a `main` si configuras los secretos en GitHub.

**Guía detallada:** [`docs/deploy-agent.md`](../docs/deploy-agent.md) (secretos, diagnóstico, deploy manual, PM2).

| Secreto | Descripción |
|---------|-------------|
| `VPS_HOST` | IP o hostname del VPS |
| `VPS_USER` | Usuario SSH (`root`, `ubuntu`, etc.) |
| `VPS_SSH_KEY` | Clave privada OpenSSH completa |
| `VPS_APP_PATH` | Opcional; default `/var/www/telvoice-sms-agent` |
| `VPS_SSH_PORT` | Opcional; default `22` |

## Registro admin con Gmail

- **URL:** https://agent.telvoice.cl/admin/register  
- Solo correos `@gmail.com` o `@googlemail.com`.  
- Se habilita si `ADMIN_SIGNUP_ENABLED=true` en `.env`, **o** si aún no existe ningún usuario en `admin_users`.  
- Tras crear la cuenta, inicia sesión automáticamente en el panel.

---

## Comandos rápidos (copiar)

```bash
# Build y admin
npm run typecheck
npm run build
npm run seed:admin

# PM2
pm2 start dist/index.js --name telvoice-sms-agent
pm2 save
pm2 logs telvoice-sms-agent
```

---

## Notas de seguridad

- No commitear `.env` al repositorio.
- `SUPABASE_SERVICE_ROLE_KEY` solo en el servidor.
- En producción (`NODE_ENV=production`) el botón «Simular DLR» no aparece.
- Cookies de sesión admin usan `secure: true` en producción.
