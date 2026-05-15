/**
 * Configuración editable de bolsas SMS — Telvoice.cl
 * Actualiza precios, URLs de checkout y textos comerciales desde este archivo.
 */
window.TELVOICE_CONFIG = {
  /** IVA Chile (19%) */
  ivaRate: 0.19,

  /** URL de pasarela de pago. null = flujo placeholder (solicitud comercial). */
  checkoutUrl: null,

  /** Contacto comercial */
  contactEmail: "ventas@telvoice.cl",
  whatsappUrl: null,

  /** Política de vigencia (FAQ y legal) */
  creditValidityNote:
    "Las condiciones de uso y vigencia del saldo se informan al momento de comprar cada bolsa.",

  /**
   * Planes de venta.
   * priceNet: precio en CLP sin IVA. null = cotizar.
   * quoteOnly: true fuerza formulario de alto volumen.
   */
  smsPlans: [
    {
      id: "pack-1000",
      quantity: 1000,
      label: "1.000 SMS",
      priceNet: 9000,
      recommended: false,
      quoteOnly: false,
      cardDescription:
        "Ideal para probar campañas, recordatorios o avisos puntuales.",
    },
    {
      id: "pack-5000",
      quantity: 5000,
      label: "5.000 SMS",
      priceNet: 45000,
      recommended: true,
      quoteOnly: false,
      cardDescription:
        "La opción recomendada para empresas que envían de forma recurrente.",
    },
    {
      id: "pack-10000",
      quantity: 10000,
      label: "10.000 SMS",
      priceNet: 90000,
      recommended: false,
      quoteOnly: false,
      cardDescription:
        "Mayor ahorro para campañas mensuales y comunicación activa.",
    },
    {
      id: "pack-50000",
      quantity: 50000,
      label: "50.000 SMS",
      priceNet: 400000,
      recommended: false,
      quoteOnly: false,
      cardDescription: "Pensado para operaciones de alto volumen.",
    },
    {
      id: "pack-100000-plus",
      quantity: 100000,
      label: "100.000+ SMS",
      priceNet: null,
      recommended: false,
      quoteOnly: true,
      cardDescription:
        "Precio especial para empresas, integradores y mayoristas.",
    },
  ],
};
