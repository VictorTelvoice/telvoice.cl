export const MOCK_SA_CLIENTS = [
  {
    id: "c1",
    company: "Retail Andes SpA",
    contact: "María González",
    email: "ops@retailandes.cl",
    phone: "+56 9 8765 4321",
    country: "Chile",
    status: "activo",
    balance: "12.450",
    monthly: "8.200",
    created: "12 ene 2026",
  },
  {
    id: "c2",
    company: "Finanzas Sur Ltda.",
    contact: "Carlos Pérez",
    email: "carlos@finanzasur.cl",
    phone: "+56 9 1234 5678",
    country: "Chile",
    status: "activo",
    balance: "3.100",
    monthly: "5.400",
    created: "03 feb 2026",
  },
  {
    id: "c3",
    company: "Logística Express",
    contact: "Ana Ruiz",
    email: "ana@logexpress.cl",
    phone: "+56 9 5555 0101",
    country: "Chile",
    status: "pendiente",
    balance: "0",
    monthly: "120",
    created: "18 may 2026",
  },
  {
    id: "c4",
    company: "HealthPlus",
    contact: "Dr. Silva",
    email: "sms@healthplus.cl",
    phone: "+56 2 2345 6789",
    country: "Chile",
    status: "suspendido",
    balance: "890",
    monthly: "0",
    created: "20 nov 2025",
  },
];

export const MOCK_SA_BAGS = [
  { name: "Bolsa Chile 1.000 SMS", country: "CL", sms: 1000, price: "$12.000", unit: "$12", cost: "$7.200", margin: "40%", status: "activa" },
  { name: "Bolsa Chile 5.000 SMS", country: "CL", sms: 5000, price: "$55.000", unit: "$11", cost: "$33.000", margin: "40%", status: "activa" },
  { name: "Bolsa Chile 10.000 SMS", country: "CL", sms: 10000, price: "$100.000", unit: "$10", cost: "$60.000", margin: "40%", status: "activa" },
  { name: "Bolsa Chile 50.000 SMS", country: "CL", sms: 50000, price: "$450.000", unit: "$9", cost: "$270.000", margin: "40%", status: "activa" },
  { name: "Bolsa Chile 100.000 SMS", country: "CL", sms: 100000, price: "$820.000", unit: "$8,2", cost: "$492.000", margin: "40%", status: "activa" },
];

export const MOCK_SA_PROVIDERS = [
  { name: "aSMSC / Telvoice", type: "HTTP API", route: "Chile masivo", status: "activo", cost: "$6,2", capacity: "Alto", delivery: "96,4%", latency: "1,2s", traffic: "Alto" },
  { name: "Proveedor backup HQ", type: "SMPP", route: "Chile HQ", status: "en_prueba", cost: "$5,8", capacity: "Medio", delivery: "94,1%", latency: "2,1s", traffic: "Bajo" },
  { name: "Ruta económica mock", type: "Mock", route: "Chile promo", status: "degradado", cost: "$4,5", capacity: "Medio", delivery: "88,0%", latency: "3,8s", traffic: "Medio" },
];

export const MOCK_SA_ROUTES = [
  { country: "Chile", operator: "Entel", provider: "aSMSC", type: "Transaccional", priority: 1, cost: "$6,0", price: "$10", margin: "40%", status: "operativa", dlr: true },
  { country: "Chile", operator: "Movistar", provider: "aSMSC", type: "Directa", priority: 1, cost: "$6,2", price: "$10", margin: "38%", status: "operativa", dlr: true },
  { country: "Chile", operator: "Claro", provider: "aSMSC", type: "HQ", priority: 2, cost: "$5,9", price: "$9,5", margin: "38%", status: "degradada", dlr: true },
  { country: "Chile", operator: "WOM", provider: "Backup", type: "Económica", priority: 3, cost: "$5,2", price: "$8,5", margin: "39%", status: "mantenimiento", dlr: true },
];

export const MOCK_SA_DLR = [
  { date: "22 may 14:32", client: "Retail Andes", campaign: "OTP Login", phone: "+56987654321", provider: "aSMSC", operator: "Entel", status: "entregado", code: "—", sent: "14:32", delivered: "14:32" },
  { date: "22 may 13:10", client: "Finanzas Sur", campaign: "Cobranza", phone: "+56912345678", provider: "aSMSC", operator: "Movistar", status: "pendiente", code: "—", sent: "13:10", delivered: "—" },
  { date: "21 may 18:05", client: "Retail Andes", campaign: "Retail Mayo", phone: "+56955550101", provider: "aSMSC", operator: "Claro", status: "fallido", code: "INVALID_MSISDN", sent: "18:05", delivered: "—" },
];

export const MOCK_SA_MESSAGES = [
  { client: "Retail Andes", campaign: "OTP", phone: "+56987654321", status: "entregado", provider: "aSMSC", operator: "Entel", date: "22 may 14:32", country: "CL" },
  { client: "Finanzas Sur", campaign: "Recordatorio", phone: "+56912345678", status: "entregado", provider: "aSMSC", operator: "Movistar", date: "22 may 11:00", country: "CL" },
  { client: "Logística Express", campaign: "Despacho", phone: "+56922223333", status: "fallido", provider: "Backup", operator: "WOM", date: "21 may 09:44", country: "CL" },
];

export const MOCK_SA_ORDERS = [
  { date: "22 may 10:15", client: "Retail Andes", bag: "10.000 SMS CL", qty: 10000, amount: "$100.000", payment: "MercadoPago", payStatus: "pagada", creditStatus: "acreditada", ref: "MP-88421" },
  { date: "21 may 16:40", client: "Finanzas Sur", bag: "5.000 SMS CL", qty: 5000, amount: "$55.000", payment: "Transferencia", payStatus: "pendiente", creditStatus: "pendiente", ref: "TRF-1201" },
  { date: "20 may 09:00", client: "HealthPlus", bag: "1.000 SMS CL", qty: 1000, amount: "$12.000", payment: "MercadoPago", payStatus: "rechazada", creditStatus: "—", ref: "MP-88390" },
];

export const MOCK_SA_WALLETS = [
  { client: "Retail Andes SpA", country: "CL", available: "12.450", reserved: "200", consumed: "87.550", purchased: "100.000", lastMove: "22 may · Compra", status: "activo" },
  { client: "Finanzas Sur Ltda.", country: "CL", available: "3.100", reserved: "0", consumed: "46.900", purchased: "50.000", lastMove: "21 may · Débito envío", status: "activo" },
  { client: "Logística Express", country: "CL", available: "0", reserved: "0", consumed: "120", purchased: "0", lastMove: "18 may · Alta", status: "pendiente" },
];

export const MOCK_SA_CAMPAIGNS = [
  { client: "Retail Andes", name: "OTP Verificación", sent: 1200, delivered: 1188, status: "activa", date: "22 may 2026" },
  { client: "Finanzas Sur", name: "Cobranza Mayo", sent: 890, delivered: 810, status: "activa", date: "21 may 2026" },
  { client: "Retail Andes", name: "Retail Mayo", sent: 2400, delivered: 2280, status: "pausada", date: "20 may 2026" },
];

export const MOCK_SA_TOP_CLIENTS = [
  { client: "Retail Andes SpA", consumed: "87.550", balance: "12.450", rate: "96,8%", status: "activo" },
  { client: "Finanzas Sur Ltda.", consumed: "46.900", balance: "3.100", rate: "94,2%", status: "activo" },
  { client: "Logística Express", consumed: "120", balance: "0", rate: "91,0%", status: "pendiente" },
];

export const MOCK_SA_ALERTS = [
  "Cliente Logística Express con saldo en cero — revisar activación.",
  "Ruta WOM en mantenimiento — tráfico redirigido a backup.",
  "Proveedor backup HQ con latencia elevada (>2s).",
  "Compra pendiente de Finanzas Sur — validar transferencia.",
  "API cliente HealthPlus con 12 errores 401 en las últimas 24h.",
];

export const MOCK_SA_API_KEYS = [
  { client: "Retail Andes", key: "tv_live_••••••8f2a", status: "activa", perms: "send,status", lastUse: "Hace 5 min", requests: 842, errors: 2, ips: "190.5.x.x" },
  { client: "Finanzas Sur", key: "tv_live_••••••1c9b", status: "activa", perms: "send", lastUse: "Hace 2 h", requests: 210, errors: 0, ips: "—" },
];
