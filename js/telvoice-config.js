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
  /** Google Tag Manager — también vía __TELVOICE_PUBLIC_ENV__.GTM_CONTAINER_ID */
  gtmContainerId: "GTM-PWGG2W28",
  /** GA4 directo (opcional si no usas GTM). También vía __TELVOICE_PUBLIC_ENV__.GTAG_MEASUREMENT_ID */
  gtagMeasurementId: null,
  /** Muestra ayuda de pago sandbox en el modal (true solo en pruebas locales). */
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
  /** Tramos por defecto (6) si la API de precios no responde. */
  volumeTiers: [
    { min: 1000, max: 4000, pxSMS: 10, label: "1.000 a 4.000 SMS" },
    { min: 5000, max: 9000, pxSMS: 9, label: "5.000 a 9.000 SMS" },
    { min: 10000, max: 14000, pxSMS: 8, label: "10.000 a 14.000 SMS" },
    { min: 15000, max: 49000, pxSMS: 7, label: "15.000 a 49.000 SMS" },
    { min: 50000, max: 90000, pxSMS: 6, label: "50.000 a 90.000 SMS" },
    { min: 100000, max: 120000, pxSMS: 5, label: "100.000 a 120.000 SMS" },
  ],
  calcMaxVolume: 120000,
};
