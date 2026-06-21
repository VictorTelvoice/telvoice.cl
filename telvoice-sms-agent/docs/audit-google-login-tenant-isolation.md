# Auditoría y fix login Google multi-tenant

**Rama:** `feature/fix-google-login-tenant-isolation`  
**Fecha:** 2026-06-21  
**Estado:** Fix implementado — **sin deploy, sin modificación de datos en producción**

---

## 1. Resumen ejecutivo

Se confirmó un defecto crítico en `resolveCompanyForClientLogin`: al iniciar sesión con Google, el bootstrap podía **re-vincular automáticamente** un `user_profiles.company_id` existente hacia otra empresa candidata con mayor `walletActivityScore`, violando el aislamiento multi-tenant.

Se implementó un fix conservador que:

- **Nunca** cambia `company_id` si el perfil ya tiene uno.
- **Nunca** elige tenant por wallet score.
- Con múltiples candidatos y sin `company_id`, **bloquea** el login con `TENANT_MANUAL_REVIEW_REQUIRED`.
- La reconciliación de compras en login pasa a **dry-run** (solo evaluación, sin mutaciones).

Auditoría read-only parcial en producción ejecutada el 2026-06-21. Estado actual del perfil `licantravel@gmail.com`: apunta a company **Licantravel** (`d7a134e0-…`), con `updated_at` reciente (posible corrección por último login o intervención manual). **Reparación de datos pendiente de confirmación explícita.**

---

## 2. Root cause confirmado

### Flujo vulnerable (antes del fix)

1. Usuario completa OAuth Google en Supabase (`/login` → redirect → `/auth/callback`).
2. Callback JS llama `POST /api/auth/bootstrap-client` con Bearer Supabase (`auth.controller.ts`).
3. `bootstrapClientFromGoogle`:
   - Busca/crea `admin_users` por email verificado de Supabase.
   - Lee `user_profiles` por `admin_user_id`.
   - Llama `resolveCompanyForClientLogin(email, existingProfile.company_id)`.
4. **`resolveCompanyForClientLogin` (bug):**
   - `findCompanyCandidatesByEmail(email)` → companies con `billing_email` + companies de perfiles con ese email.
   - Calcula `walletActivityScore` por candidato.
   - Si `currentCompanyId` existe pero score = 0, y otro candidato score > 0 → **relink** (`[bootstrap] relink client to company with purchase history`).
5. `upsert` en `user_profiles` **persiste** el nuevo `company_id`.
6. `res.cookie('tv_client_session', jwt)` — JWT solo contiene `admin_user`; el tenant viene del perfil recién sobrescrito.
7. `reconcilePaidPurchasesForEmail` con `dryRun: false` podía acreditar wallets durante login.

### Condición exacta del relink

```typescript
// Código anterior (eliminado)
if (currentCompanyId) {
  const currentScore = await walletActivityScore(currentCompanyId);
  if (currentScore > 0) return currentCompanyId;
  if (bestCandidateId && bestCandidateId !== currentCompanyId && bestScore > 0) {
    return bestCandidateId; // ← BUG: cambia tenant
  }
}
```

### Cookie previa

La cookie **no** arrastra tenant directamente (JWT no incluye `company_id`). El panel resuelve tenant vía `getCurrentUserProfile(admin_user_id)` en cada request. El daño ocurre porque bootstrap **sobrescribe** el perfil antes de emitir la nueva cookie.

---

## 3. Evidencia Licantravel / GoClub

### Producción (SELECT read-only, 2026-06-21)

| Entidad | ID | Detalle |
|---------|-----|---------|
| Licantravel (activa) | `d7a134e0-59f2-4cd0-8bda-9efaf0e27688` | `billing_email = licantravel@gmail.com` |
| GoClub / goclubai | `031890a8-67ce-499a-89b7-864b8fb8d9a1` | `billing_email = goclubai@gmail.com` |
| Perfil Licantravel | `9c71aa98-…` | `email = licantravel@gmail.com`, `company_id = d7a134e0-…`, `updated_at = 2026-06-21T17:33:07Z` |
| Perfil GoClub | `3df97f73-…` | `email = goclubai@gmail.com`, `company_id = 031890a8-…` |
| Licantravel QA (suspendidas) | `d6f9bb06-…`, `8dfa5854-…` | Sin `billing_email` |

### Respuestas a preguntas de auditoría

| Pregunta | Respuesta |
|----------|-----------|
| ¿Gmail Licantravel en `billing_email` de GoClub? | **No** (GoClub usa `goclubai@gmail.com`) |
| ¿Gmail Licantravel en `user_profiles` de GoClub? | **No** (perfil GoClub usa `goclubai@gmail.com`) |
| ¿Perfiles duplicados mismo email? | **No** para `licantravel@gmail.com` (un perfil) |
| ¿admin_user único? | **Sí** — un `admin_users` por email |
| ¿`company_id` sobrescrito? | **Probable históricamente** por lógica de relink; estado actual apunta a Licantravel correcta |
| ¿GoClub wallet score mayor? | **Escenario plausible** si hubo órdenes/checkout vinculadas o perfil temporal sin wallet |
| ¿Reconciliación influyó? | Podía acreditar wallets en login (`dryRun: false`); no cambiaba `user_profiles.company_id` directamente |
| ¿Cookie previa influyó? | **No** — tenant viene del perfil post-bootstrap |

### Logs PM2

No disponibles desde este entorno. En VPS buscar:

```bash
pm2 logs telvoice-sms-agent --lines 5000 | grep -E 'relink client|link new login|licantravel|goclub|tenant_conflict'
```

Eventos legacy: `[bootstrap] relink client to company with purchase history`  
Eventos nuevos: `tenant_conflict_detected`, `tenant_resolution_blocked`, `tenant_linked_single`

---

## 4. Riesgo de seguridad

**Severidad: Alta (multi-tenant isolation breach)**

- Usuario autenticado puede ver datos, wallets, campañas y configuración de **otro cliente**.
- Violación de confidencialidad entre tenants B2B.
- El relink es silencioso (solo log `console.info`), sin alerta al usuario.
- Impacto ampliable a cualquier email con múltiples companies candidatas o wallet desbalanceado.

---

## 5. Cambios de código realizados

| Archivo | Cambio |
|---------|--------|
| `src/services/googleLoginTenantResolution.ts` | **Nuevo** — reglas puras de resolución tenant + wrapper async |
| `src/services/googleClientBootstrapService.ts` | Elimina `walletActivityScore` y relink; usa nueva resolución; reconciliación dry-run; bloqueo multi-candidato |
| `scripts/test-google-login-tenant-isolation.ts` | Tests unitarios casos 1–5 |
| `scripts/audit-google-login-tenant-prod.mjs` | Auditoría read-only producción (Licantravel / GoClub) |
| `scripts/audit-google-login-tenant-prod-full.mjs` | Auditoría read-only extendida (multi-tenant risk scan) |
| `package.json` | Scripts `test:google-login-tenant-isolation`, `audit:google-login-tenant-prod` |

### Scripts de auditoría (read-only)

- Ambos scripts ejecutan **solo SELECT**; no UPDATE/DELETE/INSERT/UPSERT.
- Saldo SMS: tabla **`company_sms_wallets`** (la tabla legacy `sms_wallets` no existe en producción).
- **`audit-google-login-tenant-prod.mjs`**: foco Licantravel/GoClub + email configurable (`--email=`).
- **`audit-google-login-tenant-prod-full.mjs`**: auditoría extendida (companies, perfiles, admin_users, wallets, órdenes, emails multi-company, billing duplicado, cruce profile↔billing).
- No imprimir ni commitear `DATABASE_URL` ni credenciales; pasar vía entorno en VPS.

### Reglas implementadas

**A.** Si `existingProfile.company_id` existe → siempre conservar; log `tenant_conflict_detected` si hay otros candidatos.

**B.** Sin `company_id`: 1 candidato → vincular; >1 candidato → `409 TENANT_MANUAL_REVIEW_REQUIRED`.

**C.** Reconciliación en login: `dryRun: true`, source `google_bootstrap_deferred`.

---

## 6. Casos de prueba

```bash
npm run test:google-login-tenant-isolation
```

| Caso | Escenario | Esperado | Estado |
|------|-----------|----------|--------|
| 1 | Perfil Licantravel + candidato GoClub | Conserva Licantravel | ✓ |
| 2 | Sin company_id + 1 candidato | Vincula único | ✓ |
| 3 | Sin company_id + 2 candidatos | Bloqueado | ✓ |
| 4 | Mismo email en 2 billing_email | No auto-resuelve | ✓ |
| 5 | Cookie GoClub + login Licantravel | Perfil prevalece | ✓ |
| Regresión | company_id existente, wallet 0 | No relink | ✓ |

---

## 7. Datos de producción a reparar

**Pendiente confirmación antes de ejecutar.**

1. Verificar si `licantravel@gmail.com` tuvo `company_id = 031890a8-…` (GoClub) en algún momento (`updated_at` histórico / backups).
2. Auditar emails con múltiples companies candidatas (queries §8).
3. Revisar órdenes `sms_orders` con `checkout_email = licantravel@gmail.com` y `company_id` distinto a Licantravel.

Script de auditoría:

```bash
DATABASE_URL=... npm run audit:google-login-tenant-prod
# Auditoría extendida (read-only):
DATABASE_URL=... node scripts/audit-google-login-tenant-prod-full.mjs
```

---

## 8. SQL de reparación propuesto (NO EJECUTADO)

### 8.1 Backup filas afectadas

```sql
-- Ejecutar ANTES de cualquier UPDATE
CREATE TABLE IF NOT EXISTS _backup_user_profiles_tenant_fix_20260621 AS
SELECT up.*, now() AS backed_up_at
FROM user_profiles up
WHERE lower(trim(up.email)) = 'licantravel@gmail.com';

CREATE TABLE IF NOT EXISTS _backup_companies_tenant_fix_20260621 AS
SELECT c.*, now() AS backed_up_at
FROM companies c
WHERE c.id IN (
  'd7a134e0-59f2-4cd0-8bda-9efaf0e27688',
  '031890a8-67ce-499a-89b7-864b8fb8d9a1'
);
```

### 8.2 Corregir company_id Licantravel (solo si audit confirma desvío)

```sql
-- NO EJECUTAR sin confirmación
UPDATE user_profiles
SET company_id = 'd7a134e0-59f2-4cd0-8bda-9efaf0e27688',
    updated_at = now()
WHERE lower(trim(email)) = 'licantravel@gmail.com'
  AND company_id IS DISTINCT FROM 'd7a134e0-59f2-4cd0-8bda-9efaf0e27688';
```

### 8.3 Detectar emails con múltiples companies candidatas

```sql
SELECT lower(trim(billing_email)) AS email_norm,
       count(*)::int AS company_count,
       array_agg(id ORDER BY created_at) AS company_ids
FROM companies
WHERE billing_email IS NOT NULL AND trim(billing_email) <> ''
GROUP BY lower(trim(billing_email))
HAVING count(*) > 1;

SELECT lower(trim(email)) AS email_norm,
       count(DISTINCT company_id)::int AS company_count,
       array_agg(DISTINCT company_id) AS company_ids
FROM user_profiles
WHERE email IS NOT NULL AND company_id IS NOT NULL
GROUP BY lower(trim(email))
HAVING count(DISTINCT company_id) > 1;
```

### 8.4 Perfiles donde email aparece en más de una company

```sql
SELECT up.email, up.company_id, c.name, up.updated_at
FROM user_profiles up
JOIN companies c ON c.id = up.company_id
WHERE lower(trim(up.email)) IN (
  SELECT lower(trim(email))
  FROM user_profiles
  WHERE company_id IS NOT NULL
  GROUP BY lower(trim(email))
  HAVING count(DISTINCT company_id) > 1
)
ORDER BY up.email, up.updated_at DESC;
```

---

## 9. Validaciones

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck` | ✓ OK |
| `npm run build` | ✓ OK |
| `npm run test:google-login-tenant-isolation` | ✓ 7/7 casos |

---

## 10. PR

Draft PR contra `main`: ver enlace generado al pushear la rama.

**Commit:** `fix(auth): preserve tenant isolation on Google login`

**No mergear. No deployar. No modificar datos de producción sin backup y confirmación.**
