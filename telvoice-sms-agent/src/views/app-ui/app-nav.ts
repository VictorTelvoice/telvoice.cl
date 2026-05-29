export type AppNavItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
};

/** Acción principal del panel — primero en el menú, diseño diferenciado. */
export const APP_NAV_SEND_SMS: AppNavItem = {
  id: "send-sms",
  label: "Enviar SMS",
  href: "/app/send-sms",
  icon: "send",
};

/** Sección principal tras Enviar SMS. */
export const APP_NAV_PRIMARY: AppNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/app/dashboard", icon: "dashboard" },
  { id: "reports", label: "Reportes", href: "/app/reports", icon: "bar_chart" },
  { id: "inbox", label: "Bandeja", href: "/app/inbox", icon: "inbox" },
  { id: "wallet", label: "Mi saldo", href: "/app/wallet", icon: "account_balance_wallet" },
  { id: "campaigns", label: "Campañas", href: "/app/campaigns", icon: "campaign" },
];

export const APP_ORDERS_NAV: AppNavItem = {
  id: "orders",
  label: "Mis órdenes",
  href: "/app/orders",
  icon: "receipt",
};

/** Resto del menú (orden original, sin ítems ya listados arriba). */
export const APP_NAV_REST: AppNavItem[] = [
  { id: "buy-sms", label: "Comprar SMS", href: "/app/buy-sms", icon: "shopping_cart" },
  APP_ORDERS_NAV,
  { id: "contacts", label: "Contactos", href: "/app/contacts", icon: "contacts" },
  { id: "templates", label: "Plantillas", href: "/app/templates", icon: "description" },
  { id: "invoices", label: "Facturas", href: "/app/invoices", icon: "receipt_long" },
  { id: "api", label: "API", href: "/app/api", icon: "api" },
  { id: "manual", label: "Manual de envío", href: "/app/manual", icon: "menu_book" },
  { id: "support", label: "Soporte", href: "/app/support", icon: "support_agent" },
  { id: "settings", label: "Configuración", href: "/app/settings", icon: "settings" },
];

/** Orden completo (compatibilidad). */
export const APP_NAV: AppNavItem[] = [
  APP_NAV_SEND_SMS,
  ...APP_NAV_PRIMARY,
  ...APP_NAV_REST,
];
