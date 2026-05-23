export interface InboxMessageMock {
  id: string;
  phone: string;
  message: string;
  campaign: string;
  date: string;
  operator: string;
  status: string;
  cost: string;
  direction: "out" | "in";
  messageId: string;
  deliveredAt?: string;
}

export const MOCK_INBOX_MESSAGES: InboxMessageMock[] = [
  {
    id: "m1",
    phone: "+56 9 8765 4321",
    message: "Tu código de verificación Telvoice es 4921. Válido 10 min.",
    campaign: "OTP Login",
    date: "22 may 2026, 14:32",
    operator: "Entel",
    status: "entregado",
    cost: "1 SMS",
    direction: "out",
    messageId: "tv-8f2a91bc",
    deliveredAt: "22 may 2026, 14:32",
  },
  {
    id: "m2",
    phone: "+56 9 1234 5678",
    message: "Hola, quiero más información sobre planes SMS.",
    campaign: "—",
    date: "22 may 2026, 13:10",
    operator: "Movistar",
    status: "respondido",
    cost: "—",
    direction: "in",
    messageId: "tv-in-4412",
  },
  {
    id: "m3",
    phone: "+56 9 5555 0101",
    message: "Promoción fin de mes: 15% dto en bolsa SMS empresas.",
    campaign: "Retail Mayo",
    date: "21 may 2026, 18:05",
    operator: "Claro",
    status: "pendiente",
    cost: "1 SMS",
    direction: "out",
    messageId: "tv-7c11aa02",
  },
  {
    id: "m4",
    phone: "+56 9 2222 3333",
    message: "Recordatorio: tu pedido #8842 está en camino.",
    campaign: "Logística",
    date: "21 may 2026, 09:44",
    operator: "WOM",
    status: "fallido",
    cost: "0 SMS",
    direction: "out",
    messageId: "tv-fail-009",
  },
  {
    id: "m5",
    phone: "+56 9 7777 8888",
    message: "STOP",
    campaign: "—",
    date: "20 may 2026, 22:18",
    operator: "Entel",
    status: "optout",
    cost: "—",
    direction: "in",
    messageId: "tv-opt-12",
  },
];

export const MOCK_API_LOGS = [
  {
    date: "22 may 14:35",
    endpoint: "/api/sms/send",
    method: "POST",
    http: 200,
    phone: "+56987654321",
    result: "accepted",
    ms: 142,
  },
  {
    date: "22 may 14:20",
    endpoint: "/api/sms/status",
    method: "GET",
    http: 200,
    phone: "tv-8f2a91bc",
    result: "delivered",
    ms: 89,
  },
  {
    date: "22 may 13:55",
    endpoint: "/api/sms/send",
    method: "POST",
    http: 401,
    phone: "+56911112222",
    result: "invalid_api_key",
    ms: 12,
  },
  {
    date: "22 may 12:10",
    endpoint: "/api/balance",
    method: "GET",
    http: 200,
    phone: "—",
    result: "ok",
    ms: 67,
  },
  {
    date: "22 may 11:02",
    endpoint: "/api/sms/send",
    method: "POST",
    http: 429,
    phone: "masivo",
    result: "rate_limited",
    ms: 8,
  },
];

export const MOCK_BOT_ACTIONS = [
  {
    date: "22 may 14:40",
    action: "Saldo consultado",
    result: "12.450 SMS disponibles",
    channel: "Telegram",
    status: "ok",
  },
  {
    date: "22 may 11:15",
    action: "Campaña creada",
    result: "Retail Mayo · 2.400 destinatarios",
    channel: "Telegram",
    status: "ok",
  },
  {
    date: "21 may 19:02",
    action: "Contactos revisados",
    result: "38 duplicados detectados",
    channel: "Telegram",
    status: "warn",
  },
  {
    date: "21 may 09:30",
    action: "Error detectado",
    result: "DLR timeout en lote #884",
    channel: "Telegram",
    status: "err",
  },
];
