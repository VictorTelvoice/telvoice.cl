# Routing multi-proveedor Chile — Etapa 12

Guía operativa para configurar **3 proveedores SMS en Chile**, repartir carga entre ellos, o asignar proveedores distintos por cliente.

---

## 1. Arquitectura

```
Cliente (company_rate_plans)
    ├── rate plan (single | weighted | round_robin)
    │     └── detalles tarifarios → rutas → proveedores
    └── metadata opcional
          ├── allowed_provider_ids  → solo estos vendors
          └── blocked_provider_ids  → nunca estos vendors
```

| Modo | Uso |
|------|-----|
| **single** | Un proveedor por plan (cliente A → solo P1) |
| **weighted** | Reparto aleatorio por peso (34/33/33 entre 3) |
| **round_robin** | Reparto secuencial por peso |

---

## 2. Migración 017

```bash
cd telvoice-sms-agent
node scripts/apply-migration-017.mjs
```

Agrega `company_rate_plans.metadata` para políticas por cliente.

---

## 3. Seed de 3 proveedores

```bash
node scripts/seed-chile-3-providers.mjs
```

Crea:

| Código | Proveedor | Rate plan dedicado |
|--------|-----------|-------------------|
| `asmsc` | Chile P1 — aSMSC | `TELVOICE_CL_P1_ONLY` |
| `chile_p2` | Chile P2 | `TELVOICE_CL_P2_ONLY` |
| `chile_p3` | Chile P3 | `TELVOICE_CL_P3_ONLY` |
| — | Los 3 balanceados | `TELVOICE_CL_BALANCED` (weighted 34/33/33) |

---

## 4. Credenciales (.env en VPS)

Cada proveedor HTTP API usa prefijo en metadata (`env_prefix`):

```env
# P1 — ya existente
ASMSC_API_ID=...
ASMSC_API_PASSWORD=...
ASMSC_BASE_URL=http://api.telvoice.net/api

# P2
CHILE_P2_API_ID=...
CHILE_P2_API_PASSWORD=...
CHILE_P2_BASE_URL=http://api.telvoice.net/api

# P3
CHILE_P3_API_ID=...
CHILE_P3_API_PASSWORD=...
CHILE_P3_BASE_URL=http://api.telvoice.net/api
```

Opcional por proveedor: `{PREFIX}_DEFAULT_SENDER_ID`, `{PREFIX}_DEFAULT_SMS_TYPE`.

---

## 5. Configuración en Superadmin

### Repartir carga entre 3 proveedores

1. `/admin/rate-plans` → abrir **TELVOICE CL Balanced**
2. Modo: **Weighted** o **Round robin**
3. Verificar 3 detalles CL con pesos 34 / 33 / 33
4. Asignar ese plan al cliente en `/admin/wallets/:id`

### Cliente con un solo proveedor

1. Asignar `TELVOICE_CL_P1_ONLY`, `P2_ONLY` o `P3_ONLY`
2. Modo del plan: **single** (default)

### Cliente en plan balanceado pero sin P2

1. Asignar `TELVOICE_CL_BALANCED`
2. En la misma pantalla wallet → **Proveedores por cliente**
3. Marcar **Permitir** solo P1 y P3, o **Bloquear** P2
4. Guardar límites cliente

---

## 6. Matriz de decisión (Account Manager)

| Escenario | Rate plan | Extra |
|-----------|-----------|-------|
| Cliente retail estándar | `TELVOICE_CL_BALANCED` | — |
| Cliente exige vendor fijo | `TELVOICE_CL_P1_ONLY` (etc.) | — |
| Cliente mixto en plan balanceado | `TELVOICE_CL_BALANCED` | Bloquear P3 |
| Failover automático | — | *Próxima etapa* |

---

## 7. Verificación

1. `/admin/providers/:id/test` — prueba por proveedor
2. `/admin/messages` — confirmar `provider_code` en envíos live
3. Cliente con plan balanceado: varios envíos deben alternar proveedor

---

## 8. Limitaciones actuales

- Round robin/weighted usa contador **en memoria** (una instancia PM2)
- Sin failover automático si un proveedor falla
- DLR webhook sigue centralizado en `/api/webhooks/asmsc/dlr`
