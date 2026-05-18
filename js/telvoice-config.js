/**
 * Configuración comercial Telvoice.cl — editar precios y contacto aquí.
 * No hay checkout integrado: CHECKOUT_URL debe quedar null hasta tener pasarela real.
 */
window.TELVOICE_CONFIG = {
  salesEmail: "ventas@telvoice.net",
  whatsapp: {
    number: "56912345678",
    message: "Hola, quiero cotizar una bolsa de SMS para Chile.",
  },
  checkoutUrl: null,
  ivaRate: 0.19,
  quoteVolumeMin: 200000,
  hero: {
    fromPriceSms: 5,
    fromPriceNote: "bolsas desde 100.000 SMS",
    corporatePriceSms: 4,
    corporateNote: "desde 500.000 SMS/mes (plan corporativo)",
  },
  bags: [
    {
      id: "3k",
      label: "Bolsa 3.000 SMS",
      sms: 3000,
      priceNet: 24000,
      pxSms: 8,
    },
    {
      id: "15k",
      label: "Bolsa 15.000 SMS",
      sms: 15000,
      priceNet: 105000,
      pxSms: 7,
      featured: true,
    },
    {
      id: "100k",
      label: "Bolsa 100.000 SMS",
      sms: 100000,
      priceNet: 600000,
      pxSms: 6,
    },
  ],
  volumeTiers: [
    { min: 1000, max: 4000, pxSMS: 10, plan: "Starter" },
    { min: 4001, max: 4999, pxSMS: 10, plan: "Starter" },
    { min: 5000, max: 9000, pxSMS: 9, plan: "Starter" },
    { min: 9001, max: 9999, pxSMS: 9, plan: "Starter" },
    { min: 10000, max: 14000, pxSMS: 8, plan: "Silver" },
    { min: 15000, max: 49000, pxSMS: 7, plan: "Silver" },
    { min: 49001, max: 49999, pxSMS: 7, plan: "Silver" },
    { min: 50000, max: 90000, pxSMS: 6, plan: "Business" },
    { min: 90001, max: 99999, pxSMS: 6, plan: "Business" },
    { min: 100000, max: 120000, pxSMS: 5, plan: "Pro" },
  ],
};
