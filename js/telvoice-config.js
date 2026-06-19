/**
 * Configuración comercial Telvoice.cl — editar precios y contacto aquí.
 * Pago online vía Mercado Pago Checkout Pro (API /api/mercadopago/*).
 */
window.TELVOICE_CONFIG = {
  apiOrigin: "https://www.telvoice.cl",
  /** API de cotización SMS (fuente única sms_pricing_tiers). */
  pricingApiOrigin: "https://agent.telvoice.cl",
  /** Portal cliente SMS (enlaces «Ir al portal»). */
  customerPortalUrl: "https://agent.telvoice.cl/app/dashboard",
  helpCenterUrl: "/ayuda/",
  /** Muestra ayuda de pago sandbox en el modal (true solo en pruebas). */
  mercadoPagoSandbox: false,
  salesEmail: "ventas@telvoice.net",
  whatsapp: {
    number: "56997980116",
    message: "Hola, quiero cotizar una bolsa de SMS para Chile.",
  },
  phone: {
    display: "+56 9 9979 8016",
    tel: "+56997980116",
  },
  checkoutUrl: null,
  /**
   * Por defecto NO permitimos fallback automático al checkout legacy.
   * Se puede habilitar explícitamente (por ejemplo en staging) inyectando:
   * window.__TELVOICE_PUBLIC_ENV__ = { NEXT_PUBLIC_ALLOW_LEGACY_CHECKOUT_FALLBACK: "true" }
   * o configurando allowLegacyCheckoutFallback=true aquí.
   */
  allowLegacyCheckoutFallback: false,
  /** Chip «Bolsa prueba» en calculadora — solo QA interno; false en producción controlada. */
  showTestPurchaseChip: false,
  /**
   * Bolsa Chile 200 SMS / $1.000 IVA incl. — oculta en landing; solo vía agente.
   * Cambiar a true para mostrar el chip en la calculadora de telvoice.cl.
   */
  showRetail200PurchaseChip: false,
  retail200Bag: {
    id: "200",
    planName: "Bolsa Chile 200 SMS",
    label: "Bolsa Chile 200 SMS",
    sms: 200,
    priceNet: 840,
    pxSms: 5,
    maxNeed: 200,
  },
  ivaRate: 0.19,
  quoteVolumeMin: 100001,
  hero: {
    bagsFromLabel: "Bolsas desde 1.000 SMS",
    fromPriceDetail: "Para campañas pequeñas hasta envíos de alto volumen",
    fromPriceSms: 5,
    fromPriceNote: "Plan Corporativo · 100.000 SMS",
  },
  bags: [],
  /** Se cargan desde GET /api/public/sms-pricing-tiers al iniciar la página. */
  volumeTiers: [],
  calcMaxVolume: 120000,
};
