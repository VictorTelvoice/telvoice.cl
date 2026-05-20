/**
 * Configuración comercial Telvoice.cl — editar precios y contacto aquí.
 * Pago online vía Mercado Pago Checkout Pro (API /api/mercadopago/*).
 */
window.TELVOICE_CONFIG = {
  apiOrigin: "https://www.telvoice.cl",
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
  ivaRate: 0.19,
  quoteVolumeMin: 100001,
  hero: {
    bagsFromLabel: "Bolsas desde 1.000 SMS",
    fromPriceDetail: "Para campañas pequeñas hasta envíos de alto volumen",
    fromPriceSms: 5,
    fromPriceNote: "Plan Corporativo · 100.000 SMS",
  },
  bags: [
    {
      id: "1k",
      planName: "Plan Starter",
      label: "Plan Starter — 1.000 SMS",
      sms: 1000,
      priceNet: 10000,
      pxSms: 10,
      maxNeed: 1000,
    },
    {
      id: "15k",
      planName: "Plan Business",
      label: "Plan Business — 15.000 SMS",
      sms: 15000,
      priceNet: 105000,
      pxSms: 7,
      maxNeed: 15000,
      featured: true,
    },
    {
      id: "100k",
      planName: "Plan Corporativo",
      label: "Plan Corporativo — 100.000 SMS",
      sms: 100000,
      priceNet: 500000,
      pxSms: 5,
      maxNeed: 100000,
    },
  ],
  volumeTiers: [
    { min: 200, max: 200, pxSMS: 10, label: "200 SMS — prueba pago online" },
    { min: 1000, max: 4000, pxSMS: 10, label: "1.000 a 4.000 SMS" },
    { min: 5000, max: 9000, pxSMS: 9, label: "5.000 a 9.000 SMS" },
    { min: 10000, max: 14000, pxSMS: 8, label: "10.000 a 14.000 SMS" },
    { min: 15000, max: 49000, pxSMS: 7, label: "15.000 a 49.000 SMS" },
    { min: 50000, max: 90000, pxSMS: 6, label: "50.000 a 90.000 SMS" },
    { min: 100000, max: 120000, pxSMS: 5, label: "100.000 a 120.000 SMS" },
  ],
  calcMaxVolume: 120000,
};
