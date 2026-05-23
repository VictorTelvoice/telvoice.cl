export type AppNavItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
};

export const APP_NAV: AppNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/app/dashboard", icon: "dashboard" },
  { id: "buy-sms", label: "Comprar SMS", href: "/app/buy-sms", icon: "shopping_cart" },
  { id: "wallet", label: "Mi saldo", href: "/app/wallet", icon: "account_balance_wallet" },
  { id: "send-sms", label: "Enviar SMS", href: "/app/send-sms", icon: "send" },
  { id: "campaigns", label: "Campañas", href: "/app/campaigns", icon: "campaign" },
  { id: "inbox", label: "Bandeja", href: "/app/inbox", icon: "inbox" },
  { id: "contacts", label: "Contactos", href: "/app/contacts", icon: "contacts" },
  { id: "templates", label: "Plantillas", href: "/app/templates", icon: "description" },
  { id: "reports", label: "Reportes", href: "/app/reports", icon: "bar_chart" },
  { id: "invoices", label: "Facturas", href: "/app/invoices", icon: "receipt_long" },
  { id: "api", label: "API", href: "/app/api", icon: "api" },
  { id: "support", label: "Soporte", href: "/app/support", icon: "support_agent" },
  { id: "settings", label: "Configuración", href: "/app/settings", icon: "settings" },
];

export const APP_ORDERS_NAV: AppNavItem = {
  id: "orders",
  label: "Mis órdenes",
  href: "/app/orders",
  icon: "receipt",
};
