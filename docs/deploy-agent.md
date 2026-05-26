# Deploy automático — agent.telvoice.cl

Guía para configurar GitHub Actions (`.github/workflows/deploy-agent.yml`) y el deploy manual de emergencia en el VPS.

**URL:** https://agent.telvoice.cl  
**Proceso PM2:** `telvoice-sms-agent`  
**Ruta típica en servidor:** `/var/www/telvoice-sms-agent`

---

## 1. Secretos requeridos en GitHub

Configura en el repositorio: **Settings → Secrets and variables → Actions → New repository secret**.

| Secreto | Obligatorio | Formato |
|---------|-------------|---------|
| `VPS_HOST` | Sí | IP o hostname del VPS (ej. `203.0.113.10` o `agent.telvoice.cl`) |
| `VPS_USER` | Sí | Usuario SSH (ej. `root`, `ubuntu`) |
| `VPS_SSH_KEY` | Sí | Clave privada OpenSSH **completa**, incluyendo cabecera y pie |
| `VPS_APP_PATH` | No | Ruta absoluta del agente (default: `/var/www/telvoice-sms-agent`) |
| `VPS_SSH_PORT` | No | Puerto SSH (default: `22`) |

### Cómo cargar `VPS_SSH_KEY`

Pega el contenido íntegro del archivo de clave privada, por ejemplo:

```
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

o formato PEM legacy:

```
-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----
```

**No** uses la clave pública. **No** commitees la clave en el repo.

La clave pública correspondiente debe estar en `~/.ssh/authorized_keys` del usuario `VPS_USER` en el servidor.

### Cómo cargar `VPS_APP_PATH`

Ruta donde está `package.json` del agente, por ejemplo:

```
/var/www/telvoice-sms-agent
```

Si el proyecto vive en un subdirectorio del monorepo clonado, el workflow ya sincroniza solo `telvoice-sms-agent/` dentro de esa ruta.

---

## 2. Incidente: fallo con `appleboy/ssh-action` (2026-05)

Durante el deploy del commit `9301ae5`, GitHub Actions falló en el paso **Set up job** (antes de ejecutar cualquier script del workflow), al intentar descargar la action de terceros desde `codeload.github.com`:

```
Failed to download archive https://codeload.github.com/appleboy/ssh-action/...
An action could not be found at the URI ...
Internal server error
```

### Qué se probó sin éxito

| Intento | Resultado |
|---------|-----------|
| `appleboy/ssh-action@v1.2.0` (tag fijo) | Fallo en Set up job |
| Pin a SHA / `v1.2.5` | Fallo en Set up job |
| Precarga del tarball con reintentos en un paso `run` | Fallo en Set up job |

La precarga en un paso previo **no** evita el fallo: GitHub descarga las actions declaradas en `uses:` durante el **setup del job**, en un proceso aparte del script del runner.

### Por qué se eliminó `appleboy/ssh-action`

- El fallo era de **infraestructura de GitHub / codeload**, no del código de la aplicación.
- Depender del marketplace para el paso crítico de deploy dejaba el pipeline bloqueado ante incidentes transitorios.
- El comportamiento deseado (ejecutar scripts en el VPS por SSH) se puede lograr con **OpenSSH ya instalado** en `ubuntu-latest`.

### Solución adoptada (desde commit `25e06a9`)

El workflow usa **SSH nativo** del runner. No hay `uses:` de actions de terceros en el job de deploy.

---

## 3. Cómo funciona el deploy con SSH nativo

En el runner `ubuntu-latest`:

1. **Validar secretos** — Comprueba que `VPS_HOST`, `VPS_USER` y `VPS_SSH_KEY` existan (sin imprimir valores).
2. **Configurar SSH para deploy** — Escribe `VPS_SSH_KEY` en `~/.ssh/deploy_key`, `chmod 600`, y añade el host con `ssh-keyscan` (puerto `VPS_SSH_PORT` o `22`).
3. **Comprobar conexión SSH y ruta** — `ssh` al VPS: `whoami`, `hostname`, existe `VPS_APP_PATH`, `package.json`, `node`, `npm`, `pm2`.
4. **Desplegar aplicación** — Mismo script remoto que antes (timeout 15 min):
   - Respalda `.env` en `/tmp`
   - `git clone --depth 1` del repo en `/tmp`
   - `rsync` de `telvoice-sms-agent/` al `APP_PATH` (excluye `node_modules`, `.env`, `dist`)
   - Restaura `.env` y aplica claves operativas conocidas (sin sobrescribir el archivo completo)
   - `npm ci` → `npm run build`
   - `pm2 restart telvoice-sms-agent` (o `pm2 start` si no existe)
   - Health local: hasta 10 intentos a `http://127.0.0.1:PORT/health`
5. **Verificar health público** — Hasta 10 intentos a `https://agent.telvoice.cl/health`.

El `.env` de producción **no** se commitea ni se reemplaza por el del repositorio; solo se respalda y restaura en el VPS.

### Ventajas del enfoque actual

| Ventaja | Descripción |
|---------|-------------|
| Menos dependencias externas | No requiere descargar actions desde codeload/marketplace |
| Mayor resiliencia | Evita fallos en “Set up job” por indisponibilidad de `appleboy/ssh-action` |
| Comportamiento equivalente | Mismos pasos en el VPS que con `appleboy/ssh-action` |
| Logs claros | Cada fase es un paso con nombre en GitHub Actions |
| Mismos secretos | `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, opcionales `VPS_APP_PATH` y `VPS_SSH_PORT` |

---

## 4. Disparadores del workflow

En cada push a `main` que modifique:

- `telvoice-sms-agent/**`
- `.github/workflows/deploy-agent.yml`
- `docs/deploy-agent.md`

También manualmente: **Actions** → **Deploy agent.telvoice.cl** → **Run workflow** (`workflow_dispatch`).

Un push que **solo** actualice esta documentación puede disparar un deploy (por el filtro `paths`). Eso es esperado si quieres validar el pipeline; no cambia el `.env` del servidor.

---

## 5. Troubleshooting

Revisa el run en **Actions** → **Deploy agent.telvoice.cl** → paso que falló. Los secretos aparecen enmascarados (`***`).

### SSH y claves

| Síntoma | Causa probable | Qué revisar |
|---------|----------------|-------------|
| Fallo en “Validar secretos” | Falta `VPS_HOST`, `VPS_USER` o `VPS_SSH_KEY` | Secrets en GitHub Actions |
| `Permission denied (publickey)` | Clave privada mal copiada o pública no en `authorized_keys` | Formato completo de `VPS_SSH_KEY`; entrada en `~/.ssh/authorized_keys` del `VPS_USER` |
| `chmod` / permiso denegado | Clave con permisos incorrectos en el runner | El workflow usa `chmod 600` en `deploy_key`; no pegues permisos extra en el secreto |
| Timeout en SSH | Host/puerto incorrectos o firewall | `VPS_HOST`, `VPS_SSH_PORT`, reglas del VPS y del proveedor |
| `Directorio no existe` / falta `package.json` | `VPS_APP_PATH` incorrecto | Ruta real del agente en el servidor |

### Deploy en el VPS

| Síntoma | Causa probable | Qué revisar |
|---------|----------------|-------------|
| `git clone` falla | Sin `git` o sin salida a GitHub desde el VPS | Instalar `git`; conectividad del servidor |
| `npm ci` / `npm run build` falla | Node/npm ausentes o versión incompatible | `node -v`, `npm -v` en el VPS; logs del paso “Desplegar aplicación” |
| `pm2` no encontrado | PM2 no instalado o fuera del `PATH` del usuario SSH | `npm i -g pm2` o ruta en el perfil del usuario |
| Health local falla | `.env` ausente, `PORT` distinto o app no arranca | `pm2 logs telvoice-sms-agent`; `curl` local en el VPS; variables en `.env` |
| Health público falla pero local OK | Proxy, DNS, firewall o servicio no expuesto | Nginx/reverse proxy; que el proceso escuche en el puerto esperado |

### Incidentes de GitHub (histórico)

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| Fallo en **Set up job** con mensaje de `codeload.github.com` y `appleboy/ssh-action` | Indisponibilidad al descargar actions (workflow antiguo) | Usar el workflow actual con SSH nativo; si persiste en otro job, **Re-run jobs** o esperar estado de GitHub |

---

## 6. Probar conexión SSH (local)

Desde tu máquina (sustituye usuario y host; **no** guardes contraseñas en el repo):

```bash
ssh -i ~/.ssh/tu_clave_privada -p 22 USUARIO@HOST "whoami && ls -la /var/www/telvoice-sms-agent/package.json"
```

El workflow **solo admite autenticación por clave** (`VPS_SSH_KEY`), no contraseña interactiva.

---

## 7. Deploy manual de emergencia

Si GitHub Actions no está disponible, en el VPS (o vía SSH):

```bash
ENV_BACKUP=/tmp/telvoice-agent-env.backup
cp /var/www/telvoice-sms-agent/.env "$ENV_BACKUP" 2>/dev/null || true
cd /var/www
rm -rf /tmp/telvoice-clone
git clone --depth 1 https://github.com/VictorTelvoice/telvoice.cl.git /tmp/telvoice-clone
rsync -a --exclude node_modules --exclude .env --exclude dist \
  /tmp/telvoice-clone/telvoice-sms-agent/ /var/www/telvoice-sms-agent/
cp "$ENV_BACKUP" /var/www/telvoice-sms-agent/.env 2>/dev/null || true
cd /var/www/telvoice-sms-agent
npm ci
npm run build
pm2 restart telvoice-sms-agent
curl -sf http://127.0.0.1:3001/health
```

O desde el servidor, si ya hay clone git configurado:

```bash
cd /var/www/telvoice-sms-agent
bash scripts/deploy-vps.sh
```

(`deploy-vps.sh` hace `git pull`; solo útil si el directorio es un repositorio git válido.)

---

## 8. Verificar PM2 y logs

```bash
pm2 list
pm2 describe telvoice-sms-agent
pm2 logs telvoice-sms-agent --lines 80
```

Estado esperado: `online`.

---

## 9. Verificación post-deploy

| URL | Esperado |
|-----|----------|
| https://agent.telvoice.cl/health | JSON `status: ok` |
| https://agent.telvoice.cl/admin/login | Página de login |
| https://agent.telvoice.cl/app/dashboard | Redirect login o panel cliente |

---

## 10. Seguridad

- No imprimir secretos en logs del workflow.
- No commitear `.env`, claves SSH ni contraseñas.
- Rotar `VPS_SSH_KEY` si pudo haberse expuesto.
- Usar usuario SSH dedicado con permisos mínimos cuando sea posible (en lugar de `root`).
- La clave del workflow vive solo en el runner efímero (`~/.ssh/deploy_key`) durante el job.

---

## Referencias

- Workflow: `.github/workflows/deploy-agent.yml`
- Guía VPS completa: `telvoice-sms-agent/DEPLOY_AGENT_TELVOICE.md`
- Deploy exitoso con SSH nativo (ejemplo): run [26448532081](https://github.com/VictorTelvoice/telvoice.cl/actions/runs/26448532081) — commit `25e06a9`
