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

Si el proyecto vive en un subdirectio del monorepo clonado, el workflow ya sincroniza solo `telvoice-sms-agent/` dentro de esa ruta.

---

## 2. Qué hace el workflow

En cada push a `main` que toque `telvoice-sms-agent/**` o el propio workflow:

1. Valida que existan `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (sin imprimir valores).
2. Prueba SSH: `whoami`, comprueba que existe `VPS_APP_PATH` y `package.json`.
3. En el servidor:
   - Respalda `.env` → `/tmp/telvoice-agent-env.backup.*`
   - `git clone --depth 1` del repo en `/tmp`
   - `rsync` de `telvoice-sms-agent/` al `APP_PATH` (excluye `node_modules`, `.env`, `dist`)
   - Restaura `.env`
   - `npm ci` → `npm run build`
   - `pm2 restart telvoice-sms-agent` (o `pm2 start` si no existe)
   - Espera 3 s tras `pm2 restart`, luego hasta **10 intentos** (cada 3 s) a `http://127.0.0.1:PORT/health` (default puerto `3001`, leído de `.env` si existe `PORT=`).
4. Paso aparte en GitHub: hasta 10 intentos a `https://agent.telvoice.cl/health`.
5. Si falla el health local, el workflow imprime `pm2 status`, `pm2 logs` (80 líneas) y `curl -v` sin secretos.

El `.env` de producción **no** se sobrescribe ni se commitea.

---

## 3. Causas habituales de fallo

| Síntoma | Causa probable |
|---------|----------------|
| Fallo en &lt; 10 s en “Deploy via SSH” | `VPS_HOST`, `VPS_USER` o `VPS_SSH_KEY` vacíos o incorrectos |
| `Permission denied (publickey)` | Clave privada mal copiada o pública no en `authorized_keys` |
| `Directorio no existe` | `VPS_APP_PATH` incorrecto |
| `git clone` falla en servidor | Sin `git` instalado o sin salida a GitHub desde el VPS |
| `npm ci` falla | Node/npm no instalados o versión incompatible |
| Health falla tras deploy | `.env` ausente o variables inválidas en el VPS |

Revisa el run en **Actions** → workflow **Deploy agent.telvoice.cl** → paso que falló. Los secretos aparecen enmascarados (`***`).

---

## 4. Probar conexión SSH (local)

Desde tu máquina (sustituye usuario y host; **no** guardes contraseñas en el repo):

```bash
ssh -i ~/.ssh/tu_clave_privada USUARIO@HOST "whoami && ls -la /var/www/telvoice-sms-agent/package.json"
```

Si usas contraseña en lugar de clave, configura `VPS_SSH_KEY` en GitHub (el workflow **no** admite contraseña por defecto en `appleboy/ssh-action`).

---

## 5. Deploy manual de emergencia

Si GitHub Actions no está disponible, en el VPS (o vía SSH):

```bash
ENV_BACKUP=/tmp/telvoice-agent-env.backup
cp /var/www/telvoice-sms-agent/.env "$ENV_BACKUP" 2>/dev/null || true
cd /var/www
rm -rf /tmp/telvoice-clone
git clone --depth 1 https://github.com/VictorTelvoice/telvoice.cl.git /tmp/telvoice-clone
rsync -a --exclude node_modules --exclude .env \
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

## 6. Verificar PM2 y logs

```bash
pm2 list
pm2 describe telvoice-sms-agent
pm2 logs telvoice-sms-agent --lines 80
```

Estado esperado: `online`.

---

## 7. Verificación post-deploy

| URL | Esperado |
|-----|----------|
| https://agent.telvoice.cl/health | JSON `status: ok` |
| https://agent.telvoice.cl/admin/login | Página de login |
| https://agent.telvoice.cl/app/dashboard | Redirect login o panel cliente |

---

## 8. Disparar deploy sin push

En GitHub: **Actions** → **Deploy agent.telvoice.cl** → **Run workflow** (requiere `workflow_dispatch` y secretos configurados).

---

## 9. Seguridad

- No imprimir secretos en logs del workflow.
- No commitear `.env`, claves SSH ni contraseñas.
- Rotar `VPS_SSH_KEY` si pudo haberse expuesto.
- Usar usuario SSH dedicado con permisos mínimos cuando sea posible (en lugar de `root`).

---

## Referencias

- Workflow: `.github/workflows/deploy-agent.yml`
- Guía VPS completa: `telvoice-sms-agent/DEPLOY_AGENT_TELVOICE.md`
