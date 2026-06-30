# Evidencia visual — rediseño `/app/numeraciones`

Fixtures HTML generados con `telvoice-sms-agent/scripts/verify-numeraciones-page-redesign.mjs`.

## Screenshots (PR #28)

| Archivo | Escenario |
|---------|-----------|
| `screenshots/desktop-with-plan.png` | Numeración con plan Start y agente asignado |
| `screenshots/desktop-without-plan.png` | Numeración sin plan activo |
| `screenshots/desktop-overview-kpis.png` | Vista general con KPIs y 2 cards |
| `screenshots/mobile-cards.png` | Mobile 390px — cards apiladas |
| `screenshots/empty-state.png` | Empresa sin numeraciones |

Regenerar fixtures + validar rutas:

```bash
cd telvoice-sms-agent
npm run build
node scripts/verify-numeraciones-page-redesign.mjs
```
