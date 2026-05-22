# Agente comercial web (Telvoice.cl)

Chat flotante **FloatingSalesAgent** + panel **SalesAgentChatWidget**. No usa Telegram.

## Isotipo del agente

- `public/telvoice-agent-isotipo.png`
- `assets/telvoice-agent-isotipo.png` (respaldo)

## Componentes

| Ruta | Descripción |
|------|-------------|
| `js/telvoice-web-agent-loader.js` | Carga global en todas las páginas |
| `js/telvoice-web-agent.js` | Widget UI |
| `css/telvoice-web-agent.css` | Estilos (gradiente azul/morado) |
| `lib/telvoice-pricing-tiers.js` | Tramos oficiales compartidos con calculadora |
| `lib/web-agent/telvoiceQuoteService.js` | Cotización |
| `lib/web-agent/webAgentIntentService.js` | Intenciones |
| `lib/web-agent/capabilities.js` | Respuesta «qué puedes hacer» |
| `lib/web-agent/conversation.js` | Motor de conversación |
| `api/web-agent/chat.js` | POST conversación |
| `api/web-agent/lead.js` | POST lead |
| `api/web-agent/quote.js` | POST cotización |
| `api/web-agent/pricing.js` | GET tramos |

## Supabase

Ejecutar en orden:

1. `supabase/migrations/009_web_agent.sql`
2. `supabase/migrations/010_web_agent_lead_use_case.sql`
3. (sms-agent) `008_sms_pricing_tiers.sql` si aún no está

Variables en **Vercel** (proyecto telvoice.cl):

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Probar en local

```bash
cd "/Users/victor/TELVOICE CHILE"
vercel dev
```

Abre `http://localhost:3000` → botón flotante con badge **Asesor en línea**.

### Pruebas sugeridas

| Mensaje | Resultado esperado |
|---------|-------------------|
| (abrir chat) | Mensaje de bienvenida |
| `hola, quiero comprar SMS` | Pregunta cantidad |
| `quiero comprar 30000 SMS` | Cotización $249.900 IVA incl. |
| `quiero 12500 SMS` | Redondeo 13.000, $8/SMS, $123.760 total |
| Ver precios | Tabla de tramos |

## Admin (telvoice-sms-agent)

Con Supabase configurado en el agente:

- `/admin/web-agent/leads`
- `/admin/web-agent/sessions`
- `/admin/web-agent/quotes`
- `/admin/pricing-tiers`

## API

### POST `/api/web-agent/chat`

```json
{
  "session_token": "tva_xxx",
  "message": "cotizar 30000 sms",
  "current_url": "https://www.telvoice.cl/"
}
```

Respuesta: `reply`, `intent`, `quick_actions`, `quote`, `lead_required`, `ctas`, `session_id`.

### POST `/api/web-agent/lead`

### POST `/api/web-agent/quote`

### GET `/api/web-agent/pricing`
