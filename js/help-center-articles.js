/**
 * Centro de ayuda Telvoice — contenido editable (artículos, categorías, videos).
 */
window.HELP_CENTER = {
  siteName: "Telvoice.cl",
  portalUrl: "https://telvoice.net/",
  home: {
    title: "Centro de ayuda Telvoice",
    subtitle: "Aprende a enviar SMS, revisar reportes y usar tu portal paso a paso",
    searchPlaceholder: "Buscar tutoriales, reportes o envío de SMS",
  },
  categories: [
    {
      slug: "primeros-pasos",
      title: "Primeros pasos",
      description: "Acceso al portal, navegación del panel y lectura general.",
      href: "primeros-pasos/",
    },
    {
      slug: "envio-de-sms",
      title: "Envío de SMS",
      description: "Tutoriales para envío rápido y envío masivo desde el portal.",
      href: "envio-de-sms/",
    },
    {
      slug: "reportes-y-seguimiento",
      title: "Reportes y seguimiento",
      description: "Consulta de DLR, resultados y exportación a Excel.",
      href: "reportes-y-seguimiento/",
    },
    {
      slug: "cuenta-y-acceso",
      title: "Cuenta y acceso",
      description: "Credenciales, permisos y configuración (en ampliación).",
      href: "cuenta-y-acceso/",
    },
    {
      slug: "preguntas-frecuentes",
      title: "Preguntas frecuentes",
      description: "Dudas comunes del servicio y del portal cliente.",
      href: "preguntas-frecuentes/",
    },
  ],
  featuredSlugs: [
    "envio-rapido-de-sms",
    "envio-masivo-de-sms",
    "descargar-reporte-de-envios",
  ],
  articles: {
    "envio-rapido-de-sms": {
      title: "Envío rápido de SMS",
      slug: "envio-rapido-de-sms",
      category: "envio-de-sms",
      categoryTitle: "Envío de SMS",
      summary:
        "Envía un SMS puntual desde Quick SMS en el portal cliente: tipo de mensaje, remitente, destinatarios y confirmación.",
      estimatedTime: "2 min",
      videoUrl: "",
      videoProvider: "youtube",
      videoThumbnail: "",
      videoTitle: "Envío rápido de SMS en el portal Telvoice",
      videoTranscript:
        "Tutorial del flujo Quick SMS: inicio de sesión, menú Send SMS, configuración del mensaje, destinatarios y confirmación del envío.",
      prerequisites: [
        "Tener acceso al portal del cliente con usuario y contraseña activos.",
        "Contar con saldo SMS disponible en tu cuenta.",
        "Tener los números destino en formato internacional (ej. 569XXXXXXXX).",
      ],
      steps: [
        {
          stepNumber: 1,
          stepTitle: "Inicia sesión en el portal",
          stepBody:
            "Abre el portal cliente de Telvoice e ingresa tus credenciales. Verifica que tu cuenta muestre saldo y acceso al módulo de envíos.",
          imageUrl: "",
          imageAlt: "Pantalla de login del portal cliente Telvoice",
        },
        {
          stepNumber: 2,
          stepTitle: "Abre Send SMS y elige Quick SMS",
          stepBody:
            "En el menú principal, entra a Send SMS y selecciona la opción Quick SMS para un envío puntual.",
          imageUrl: "",
          imageAlt: "Menú Send SMS con opción Quick SMS",
        },
        {
          stepNumber: 3,
          stepTitle: "Configura tipo de SMS y Sender ID",
          stepBody:
            "Elige el tipo de SMS según tu operación (transaccional, promocional, etc.) y define el Sender ID que verá el destinatario.",
          imageUrl: "",
          imageAlt: "Formulario Quick SMS con tipo y remitente",
        },
        {
          stepNumber: 4,
          stepTitle: "Codificación y programación (opcional)",
          stepBody:
            "Selecciona la codificación del mensaje (GSM o Unicode si aplica). Si necesitas programar el envío, indica fecha y hora de despacho.",
          imageUrl: "",
          imageAlt: "Opciones de codificación y programación",
        },
        {
          stepNumber: 5,
          stepTitle: "Redacta el mensaje",
          stepBody:
            "Escribe el texto del SMS respetando el límite de caracteres. Revisa la vista previa antes de continuar.",
          imageUrl: "",
          imageAlt: "Campo de texto del mensaje SMS",
        },
        {
          stepNumber: 6,
          stepTitle: "Ingresa destinatarios y confirma",
          stepBody:
            "Agrega uno o más números destino, completa el captcha de seguridad si se solicita y confirma el envío. El sistema mostrará el estado del despacho.",
          imageUrl: "",
          imageAlt: "Destinatarios y botón de confirmación de envío",
        },
      ],
      notes: [
        "Quick SMS es ideal para pruebas, OTP manuales o envíos puntuales.",
        "Verifica el código de país antes de enviar (Chile: 56 + 9 dígitos móviles).",
        "Si el mensaje no se entrega, revisa el DLR en Reportes y seguimiento.",
      ],
      relatedArticles: ["envio-masivo-de-sms", "descargar-reporte-de-envios"],
      seoTitle: "Envío rápido de SMS | Centro de ayuda Telvoice",
      seoDescription:
        "Aprende a enviar un SMS puntual desde Quick SMS en el portal cliente de Telvoice: login, remitente, mensaje y confirmación.",
    },
    "envio-masivo-de-sms": {
      title: "Envío masivo de SMS",
      slug: "envio-masivo-de-sms",
      category: "envio-de-sms",
      categoryTitle: "Envío de SMS",
      summary:
        "Carga un archivo .xls o .csv con destinatarios y variables para despachar un lote de SMS desde el portal cliente.",
      estimatedTime: "3 min",
      videoUrl: "",
      videoProvider: "youtube",
      videoThumbnail: "",
      videoTitle: "Envío masivo de SMS por archivo",
      videoTranscript:
        "Tutorial de envío masivo: Upload File, selección de columna telefónica, variables personalizadas y confirmación del lote.",
      prerequisites: [
        "Acceso al portal cliente y saldo SMS suficiente para el volumen del archivo.",
        "Archivo .xls o .csv con al menos una columna de teléfonos en formato internacional.",
        "Sender ID autorizado para el tipo de tráfico que vas a enviar.",
      ],
      steps: [
        {
          stepNumber: 1,
          stepTitle: "Inicia sesión en el portal",
          stepBody: "Accede al portal cliente con tus credenciales.",
          imageUrl: "",
          imageAlt: "Acceso al portal cliente Telvoice",
        },
        {
          stepNumber: 2,
          stepTitle: "Entra a Send SMS → Upload File",
          stepBody:
            "Desde Send SMS, elige la modalidad Upload File para cargar tu base de destinatarios.",
          imageUrl: "",
          imageAlt: "Opción Upload File en Send SMS",
        },
        {
          stepNumber: 3,
          stepTitle: "Define tipo de SMS y Sender ID",
          stepBody:
            "Selecciona el tipo de mensaje y el remitente (Sender ID) que aplicará a todo el lote.",
          imageUrl: "",
          imageAlt: "Tipo de SMS y Sender ID en envío masivo",
        },
        {
          stepNumber: 4,
          stepTitle: "Sube el archivo",
          stepBody:
            "Carga tu archivo .xls o .csv. Espera a que el sistema valide filas y columnas antes de continuar.",
          imageUrl: "",
          imageAlt: "Carga de archivo de destinatarios",
        },
        {
          stepNumber: 5,
          stepTitle: "Selecciona la columna telefónica",
          stepBody:
            "Indica qué columna contiene los números móviles. Revisa una muestra de registros para detectar errores de formato.",
          imageUrl: "",
          imageAlt: "Selección de columna de teléfonos",
        },
        {
          stepNumber: 6,
          stepTitle: "Variables personalizadas (opcional)",
          stepBody:
            "Si tu mensaje usa campos dinámicos (nombre, código, etc.), mapea cada variable a la columna correspondiente del archivo.",
          imageUrl: "",
          imageAlt: "Mapeo de variables en el mensaje",
        },
        {
          stepNumber: 7,
          stepTitle: "Programación y confirmación",
          stepBody:
            "Opcionalmente programa fecha y hora de envío. Revisa el resumen del lote (cantidad, costo estimado) y confirma el despacho.",
          imageUrl: "",
          imageAlt: "Confirmación de envío masivo",
        },
      ],
      notes: [
        "Normaliza los números antes de subir el archivo para evitar rechazos.",
        "Haz una prueba con un archivo pequeño antes de campañas grandes.",
        "Respeta bases autorizadas y políticas de uso responsable del servicio.",
      ],
      relatedArticles: ["envio-rapido-de-sms", "descargar-reporte-de-envios"],
      seoTitle: "Envío masivo de SMS | Centro de ayuda Telvoice",
      seoDescription:
        "Guía para enviar SMS por lote cargando archivo Excel o CSV en el portal cliente Telvoice.",
    },
    "descargar-reporte-de-envios": {
      title: "Descargar reporte de envíos",
      slug: "descargar-reporte-de-envios",
      category: "reportes-y-seguimiento",
      categoryTitle: "Reportes y seguimiento",
      summary:
        "Consulta el DLR Report por rango de fechas y descarga los resultados en Excel desde View Reports.",
      estimatedTime: "2 min",
      videoUrl: "",
      videoProvider: "youtube",
      videoThumbnail: "",
      videoTitle: "Descargar DLR Report en Excel",
      videoTranscript:
        "Tutorial para abrir DLR Report, filtrar por fechas, revisar entregas y exportar con Download Excel.",
      prerequisites: [
        "Acceso al portal cliente con permisos de reportes.",
        "Conocer el rango de fechas del envío o campaña a revisar.",
      ],
      steps: [
        {
          stepNumber: 1,
          stepTitle: "Inicia sesión en el portal",
          stepBody: "Accede al portal cliente de Telvoice.",
          imageUrl: "",
          imageAlt: "Login del portal cliente",
        },
        {
          stepNumber: 2,
          stepTitle: "Abre View Reports",
          stepBody: "En el menú principal, ingresa a la sección View Reports.",
          imageUrl: "",
          imageAlt: "Menú View Reports",
        },
        {
          stepNumber: 3,
          stepTitle: "Selecciona DLR Report",
          stepBody:
            "Elige el reporte DLR (Delivery Report) para ver el estado de entrega de tus mensajes.",
          imageUrl: "",
          imageAlt: "Opción DLR Report",
        },
        {
          stepNumber: 4,
          stepTitle: "Define el rango de fechas",
          stepBody:
            "Indica fecha inicial y final del período a consultar. Aplica el filtro para cargar los registros.",
          imageUrl: "",
          imageAlt: "Filtro de fechas en DLR Report",
        },
        {
          stepNumber: 5,
          stepTitle: "Revisa el reporte en pantalla",
          stepBody:
            "Verifica columnas de estado, destinatario, fecha y detalle. Identifica entregados, fallidos o pendientes.",
          imageUrl: "",
          imageAlt: "Tabla de resultados DLR",
        },
        {
          stepNumber: 6,
          stepTitle: "Descarga en Excel",
          stepBody:
            "Haz clic en Download Excel para exportar el reporte. Guarda el archivo y compártelo con tu equipo si es necesario.",
          imageUrl: "",
          imageAlt: "Botón Download Excel",
        },
      ],
      notes: [
        "Para campañas recientes, espera unos minutos a que se actualicen los estados DLR.",
        "Usa rangos acotados si el reporte es muy grande y la descarga tarda.",
      ],
      relatedArticles: ["envio-rapido-de-sms", "envio-masivo-de-sms"],
      seoTitle: "Descargar reporte de envíos | Centro de ayuda Telvoice",
      seoDescription:
        "Aprende a consultar el DLR Report por fechas y descargar el Excel desde el portal cliente Telvoice.",
    },
  },
};
