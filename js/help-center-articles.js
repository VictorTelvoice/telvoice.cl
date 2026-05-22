/**
 * Centro de ayuda Telvoice — contenido editable (artículos, categorías, videos).
 */
window.HELP_CENTER = {
  siteName: "Telvoice.cl",
  portalUrl: "https://portal.telvoice.net/",
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
      description: "Credenciales, permisos por rol y recuperación de acceso al portal.",
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
  faqSections: [
    {
      id: "servicio",
      title: "Servicio y bolsas SMS",
      description: "Compra, precios, operadores y condiciones del servicio en Chile.",
      items: [
        {
          question: "¿Qué es una bolsa de SMS?",
          answer:
            "Es una cantidad prepagada de mensajes que puedes comprar para enviar campañas, notificaciones o recordatorios a teléfonos en Chile.",
        },
        {
          question: "¿Cómo funciona el envío de SMS masivos?",
          answer:
            "Puedes enviar SMS desde tu sistema vía nuestra API REST o desde el panel de administración web. Solo debes subir tu base de datos de teléfonos, redactar el mensaje y programar el envío. Los mensajes se procesan hacia la red chilena con rutas orientadas a una entrega estable.",
        },
        {
          question: "¿Cómo compro una bolsa de SMS en Telvoice.cl?",
          answer:
            'En la <a href="../../#calculadora" class="font-semibold text-primary hover:underline">calculadora</a> eliges el volumen, revisas el precio y completas el pago con Mercado Pago. Recibes confirmación y acceso al portal para usar tus SMS.',
        },
        {
          question: "¿En cuánto tiempo se integra la API?",
          answer:
            "La integración vía API dependerá del sistema del cliente, el tipo de uso y la validación técnica. Telvoice puede entregar orientación para facilitar el proceso, junto con documentación y ejemplos según el tipo de integración requerida.",
        },
        {
          question: "¿Qué operadores móviles incluyen?",
          answer:
            "Cubrimos los cuatro operadores principales de Chile: Entel, Movistar, Claro y WOM, con rutas orientadas a maximizar la entrega hacia sus redes móviles.",
        },
        {
          question: "¿Los SMS vencen?",
          answer:
            "Las condiciones de uso y vigencia se informan al momento de comprar cada bolsa. Para volúmenes altos podemos acordar condiciones especiales en tu cotización.",
        },
        {
          question: "¿Tienen soporte técnico en Chile?",
          answer:
            "Sí. Telvoice.cl es operado por TelefoníaChile LTDA, empresa establecida en Chile. Nuestro equipo técnico y comercial está disponible en horario local y puedes comunicarte en español para cualquier consulta o incidencia.",
        },
        {
          question: "¿Cómo se emite la factura?",
          answer:
            "Emitimos factura electrónica afecta al IVA por cada período facturado, en pesos chilenos (CLP). La factura se envía automáticamente al correo registrado y queda disponible en el portal del SII bajo el RUT de TelefoníaChile LTDA.",
        },
        {
          question: "¿Puedo enviar SMS desde mi propio sistema?",
          answer:
            "Sí. Telvoice puede entregar integración vía API para empresas que necesitan automatizar envíos.",
        },
        {
          question: "¿Sirve para campañas promocionales?",
          answer:
            "Sí, siempre que la empresa utilice bases autorizadas y respete las buenas prácticas de comunicación.",
        },
        {
          question: "¿Puedo cotizar grandes volúmenes?",
          answer:
            'Sí. Para volúmenes sobre 100.000 SMS mensuales puedes solicitar una cotización especial desde la sección <a href="../../#empresas" class="font-semibold text-primary hover:underline">Empresas</a> o el <a href="../../#contacto" class="font-semibold text-primary hover:underline">formulario de contacto</a>.',
        },
        {
          question: "¿Telvoice.cl es lo mismo que portal.telvoice.net?",
          answer:
            "<strong>Telvoice.cl</strong> está enfocado en el mercado chileno y en la compra de bolsas SMS. <strong>portal.telvoice.net</strong> es el portal cliente donde envías mensajes, revisas reportes y administras tu cuenta.",
        },
      ],
    },
    {
      id: "portal",
      title: "Portal cliente y envíos",
      description: "Acceso, envíos, reportes DLR y uso del panel web.",
      items: [
        {
          question: "¿Cómo ingreso al portal cliente?",
          answer:
            'Abre <a href="https://portal.telvoice.net/" class="font-semibold text-primary hover:underline" target="_blank" rel="noopener noreferrer">portal.telvoice.net</a> con el usuario y contraseña que te entregó Telvoice. Guía: <a href="../primeros-pasos/acceso-al-portal-cliente/" class="font-semibold text-primary hover:underline">Acceso al portal cliente</a>.',
        },
        {
          question: "¿Cuál es la diferencia entre envío rápido y envío masivo?",
          answer:
            'El <strong>envío rápido (Quick SMS)</strong> sirve para uno o pocos destinatarios desde el portal. El <strong>envío masivo</strong> carga un archivo Excel o CSV con cientos o miles de números. Tutoriales en <a href="../envio-de-sms/" class="font-semibold text-primary hover:underline">Envío de SMS</a>.',
        },
        {
          question: "¿Cómo reviso si mis SMS se entregaron?",
          answer:
            'En el portal, abre <strong>View Reports → DLR Report</strong>, filtra por fechas y descarga Excel. Paso a paso en <a href="../reportes-y-seguimiento/descargar-reporte-de-envios/" class="font-semibold text-primary hover:underline">Descargar reporte de envíos</a>.',
        },
        {
          question: "¿Necesito API o puedo usar solo el panel web?",
          answer:
            'Puedes operar solo con el panel web del portal. La <a href="../../#api" class="font-semibold text-primary hover:underline">API REST</a> es opcional para integrar con CRM, ERP o aplicaciones propias.',
        },
        {
          question: "¿Qué formato deben tener los números móviles?",
          answer:
            "Usa formato internacional: Chile <strong>569XXXXXXXX</strong> (código 56 + 9 dígitos). Revisa una muestra del archivo antes de envíos masivos.",
        },
        {
          question: "¿Olvidé mi contraseña del portal?",
          answer:
            'Contacta a Telvoice desde el <a href="../../#contacto" class="font-semibold text-primary hover:underline">formulario de contacto</a> indicando la razón social de tu cuenta para validar identidad y restablecer el acceso.',
        },
      ],
    },
  ],
  articles: {
    "acceso-al-portal-cliente": {
      title: "Acceso al portal cliente",
      slug: "acceso-al-portal-cliente",
      category: "primeros-pasos",
      categoryTitle: "Primeros pasos",
      summary:
        "Cómo ingresar a portal.telvoice.net con tu usuario, verificar saldo SMS y ubicar el menú principal del portal.",
      estimatedTime: "1 min",
      videoUrl: "",
      videoProvider: "youtube",
      videoThumbnail: "",
      videoTitle: "Acceso al portal cliente Telvoice",
      videoTranscript: "Inicio de sesión y vista general del panel.",
      prerequisites: [
        "Credenciales entregadas por Telvoice (usuario y contraseña).",
        "Navegador actualizado (Chrome, Firefox, Safari o Edge).",
      ],
      steps: [
        {
          stepNumber: 1,
          stepTitle: "Abre el portal cliente",
          stepBody:
            "Ingresa a portal.telvoice.net desde el enlace «Ir al portal» en este sitio o el que te envió tu ejecutivo.",
          imageUrl: "",
          imageAlt: "URL del portal cliente Telvoice",
        },
        {
          stepNumber: 2,
          stepTitle: "Inicia sesión",
          stepBody:
            "Completa usuario y contraseña. Si olvidaste la clave, contacta a soporte de Telvoice para restablecerla.",
          imageUrl: "",
          imageAlt: "Formulario de login",
        },
        {
          stepNumber: 3,
          stepTitle: "Revisa saldo y menú",
          stepBody:
            "Tras ingresar, verifica tu saldo SMS y localiza Send SMS, View Reports y la configuración de cuenta.",
          imageUrl: "",
          imageAlt: "Panel principal del portal",
        },
      ],
      notes: [
        "Guarda el portal en favoritos para acceso rápido.",
        "No compartas tus credenciales fuera de tu equipo autorizado.",
      ],
      relatedArticles: ["navegacion-panel-sms", "envio-rapido-de-sms"],
      seoTitle: "Acceso al portal cliente | Centro de ayuda Telvoice",
      seoDescription:
        "Guía para iniciar sesión en el portal cliente Telvoice y revisar saldo y menú principal.",
    },
    "navegacion-panel-sms": {
      title: "Navegación del panel SMS",
      slug: "navegacion-panel-sms",
      category: "primeros-pasos",
      categoryTitle: "Primeros pasos",
      summary:
        "Recorrido por las secciones del portal: envíos, reportes, campañas y configuración básica.",
      estimatedTime: "2 min",
      videoUrl: "",
      videoProvider: "youtube",
      videoThumbnail: "",
      videoTitle: "Navegación del panel SMS",
      videoTranscript: "Tour por menús Send SMS y View Reports.",
      prerequisites: ["Sesión activa en el portal cliente."],
      steps: [
        {
          stepNumber: 1,
          stepTitle: "Menú Send SMS",
          stepBody:
            "Aquí encuentras Quick SMS (envío puntual) y Upload File (envío masivo por archivo).",
          imageUrl: "",
          imageAlt: "Menú Send SMS",
        },
        {
          stepNumber: 2,
          stepTitle: "Menú View Reports",
          stepBody:
            "Consulta DLR y otros reportes de entrega. Exporta resultados a Excel.",
          imageUrl: "",
          imageAlt: "Menú View Reports",
        },
        {
          stepNumber: 3,
          stepTitle: "Cuenta y configuración",
          stepBody:
            "Revisa datos de usuario, remitentes autorizados y preferencias según los permisos de tu rol.",
          imageUrl: "",
          imageAlt: "Configuración de cuenta",
        },
      ],
      notes: [
        "Si no ves alguna opción, puede que tu usuario no tenga permisos; solicita ajuste a tu administrador o a Telvoice.",
      ],
      relatedArticles: ["acceso-al-portal-cliente", "envio-rapido-de-sms"],
      seoTitle: "Navegación del panel SMS | Centro de ayuda Telvoice",
      seoDescription:
        "Conoce las secciones principales del portal cliente Telvoice para enviar SMS y revisar reportes.",
    },
    "credenciales-portal-cliente": {
      title: "Credenciales y acceso al portal",
      slug: "credenciales-portal-cliente",
      category: "cuenta-y-acceso",
      categoryTitle: "Cuenta y acceso",
      summary:
        "Usuarios, contraseñas, permisos por rol y buenas prácticas de seguridad en el portal cliente.",
      estimatedTime: "2 min",
      videoUrl: "",
      videoProvider: "youtube",
      videoThumbnail: "",
      videoTitle: "Credenciales del portal Telvoice",
      videoTranscript: "Gestión de accesos y permisos.",
      prerequisites: ["Ser administrador de cuenta o tener credenciales activas."],
      steps: [
        {
          stepNumber: 1,
          stepTitle: "Usuario y contraseña",
          stepBody:
            "Cada operador debe tener su propio usuario. Evita cuentas compartidas para trazabilidad y seguridad.",
          imageUrl: "",
          imageAlt: "Usuarios del portal",
        },
        {
          stepNumber: 2,
          stepTitle: "Permisos por rol",
          stepBody:
            "Algunos perfiles solo envían SMS; otros también ven reportes o administran usuarios. Confirma el rol asignado a tu equipo.",
          imageUrl: "",
          imageAlt: "Roles y permisos",
        },
        {
          stepNumber: 3,
          stepTitle: "Recuperación de acceso",
          stepBody:
            "Si no puedes ingresar, contacta a Telvoice con el RUT o razón social de la cuenta para validar identidad y restablecer acceso.",
          imageUrl: "",
          imageAlt: "Soporte de acceso",
        },
      ],
      notes: [
        "Telvoice no solicita contraseñas por correo ni WhatsApp.",
        "Reporta accesos sospechosos de inmediato a soporte.",
      ],
      relatedArticles: ["acceso-al-portal-cliente"],
      seoTitle: "Credenciales portal cliente | Centro de ayuda Telvoice",
      seoDescription:
        "Usuarios, permisos y recuperación de acceso al portal cliente Telvoice.",
    },
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
