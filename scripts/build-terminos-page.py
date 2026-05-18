#!/usr/bin/env python3
"""Genera content/terminos-y-condiciones.html y terminos-y-condiciones/index.html."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Cada sección: (título, bloques) donde bloque es ("p", texto) o ("ul", [items])
SECTIONS = [
    ("1. Aceptación de los términos", [
        ("p", "Al acceder, navegar, registrarse, comprar bolsas de SMS, solicitar acceso API o utilizar cualquier servicio disponible en Telvoice.cl, el usuario declara haber leído, entendido y aceptado estos Términos y Condiciones."),
        ("p", "Si el usuario actúa en representación de una empresa, sociedad, institución u organización, declara contar con facultades suficientes para aceptar estos términos en nombre de dicha entidad."),
        ("p", "Si el usuario no está de acuerdo con estos Términos y Condiciones, deberá abstenerse de utilizar el sitio, contratar servicios o enviar tráfico SMS a través de Telvoice.cl."),
    ]),
    ("2. Descripción del servicio", [
        ("p", "Telvoice.cl es una plataforma orientada a la venta, gestión y operación de servicios de mensajería SMS para empresas, emprendedores, instituciones y organizaciones que necesitan enviar campañas, notificaciones, alertas, validaciones, recordatorios, mensajes transaccionales y comunicaciones comerciales en Chile."),
        ("p", "Los servicios pueden incluir, según disponibilidad:"),
        ("ul", [
            "Compra online de bolsas de SMS.",
            "Administración de saldo disponible.",
            "Acceso a plataforma de envío.",
            "Envío de campañas SMS.",
            "Acceso API para integración con sistemas externos.",
            "Reportes operativos y estados de envío cuando estén disponibles.",
            "Soporte comercial y técnico asociado al uso del servicio.",
            "Servicios complementarios de mensajería, integración o conectividad.",
        ]),
        ("p", "Telvoice.cl podrá modificar, ampliar, limitar o actualizar las funcionalidades disponibles en la plataforma para mejorar la operación, seguridad, cumplimiento normativo o calidad del servicio."),
    ]),
    ("3. Naturaleza del servicio SMS", [
        ("p", "El SMS es un canal de comunicación móvil que depende de múltiples factores técnicos y operativos, incluyendo plataformas de envío, rutas SMS, agregadores, operadores móviles, disponibilidad de red, filtros antifraude, regulación local, numeración, configuración del remitente y calidad de la base de destinatarios."),
        ("p", "Por esta razón, Telvoice.cl realizará esfuerzos razonables para entregar un servicio estable y profesional, pero no garantiza que todos los mensajes sean entregados, leídos o recibidos en un plazo específico, salvo que exista un acuerdo comercial escrito que establezca condiciones particulares."),
        ("p", "Los reportes de entrega, cuando estén disponibles, reflejan información técnica recibida desde la cadena de envío y no constituyen necesariamente prueba de lectura por parte del destinatario final."),
    ]),
    ("4. Registro de cuenta", [
        ("p", "Para utilizar determinados servicios, el usuario podrá necesitar crear una cuenta o entregar información comercial, técnica o de facturación."),
        ("p", "El usuario se obliga a entregar información verdadera, actualizada y completa. Telvoice.cl podrá solicitar antecedentes adicionales para verificar identidad, actividad comercial, cumplimiento normativo, origen del tráfico o legitimidad de las campañas."),
        ("p", "El usuario es responsable de mantener la confidencialidad de sus credenciales de acceso, claves API, tokens, usuarios, contraseñas y cualquier otro mecanismo de autenticación."),
        ("p", "Cualquier actividad realizada desde la cuenta del usuario se presumirá efectuada por este, salvo prueba en contrario."),
    ]),
    ("5. Compra de bolsas SMS", [
        ("p", "Telvoice.cl podrá ofrecer bolsas de SMS con distintas cantidades, precios, condiciones, descuentos o modalidades comerciales."),
        ("p", "Antes de realizar una compra, el usuario deberá revisar:"),
        ("ul", [
            "Cantidad de SMS incluidos.",
            "Precio total.",
            "Moneda de pago.",
            "Impuestos aplicables, si corresponde.",
            "Medio de pago disponible.",
            "Condiciones de uso.",
            "Vigencia de la bolsa, si la hubiere.",
            "Restricciones técnicas o comerciales.",
            "Condiciones de activación del servicio.",
        ]),
        ("p", "La compra se entenderá confirmada una vez aprobado el pago y validada la operación por Telvoice.cl o por el proveedor de pagos correspondiente."),
    ]),
    ("6. Precios, pagos y facturación", [
        ("p", "Los precios publicados en Telvoice.cl podrán expresarse en pesos chilenos, dólares estadounidenses u otra moneda indicada en el sitio."),
        ("p", "Telvoice.cl podrá modificar precios, promociones, descuentos o condiciones comerciales en cualquier momento. Dichos cambios no afectarán compras ya confirmadas, salvo que exista error manifiesto, fraude, uso indebido o imposibilidad técnica o normativa de prestar el servicio."),
        ("p", "Los pagos podrán procesarse mediante pasarelas de pago externas. Telvoice.cl no almacena directamente los datos completos de tarjetas bancarias u otros instrumentos de pago, salvo la información mínima necesaria para registrar la transacción, emitir comprobantes o cumplir obligaciones legales."),
        ("p", "La emisión de factura, boleta u otro documento tributario se realizará conforme a la información entregada por el usuario y a la normativa aplicable."),
    ]),
    ("7. Saldo SMS y consumo", [
        ("p", "El saldo SMS adquirido por el usuario será cargado en su cuenta o habilitado para su operación según el proceso definido por Telvoice.cl."),
        ("p", "El consumo de SMS puede variar según factores técnicos como:"),
        ("ul", [
            "Longitud del mensaje.",
            "Uso de caracteres especiales.",
            "Codificación GSM o Unicode.",
            "Mensajes concatenados.",
            "País o destino.",
            "Tipo de ruta.",
            "Configuración del remitente.",
            "Reintentos o reglas técnicas aplicables.",
        ]),
        ("p", "Un mensaje que exceda la longitud estándar de un SMS puede ser dividido en varias partes y descontar más de una unidad del saldo disponible."),
        ("p", "La plataforma podrá mostrar el consumo estimado o real de SMS, pero el usuario es responsable de revisar sus campañas antes de enviarlas."),
    ]),
    ("8. Uso permitido del servicio", [
        ("p", "El usuario podrá utilizar Telvoice.cl para fines lícitos, legítimos y relacionados con su actividad comercial, institucional u operacional."),
        ("p", "Entre los usos permitidos se incluyen:"),
        ("ul", [
            "Campañas comerciales autorizadas.",
            "Recordatorios de citas.",
            "Notificaciones de despacho.",
            "Alertas operativas.",
            "Confirmaciones de compra.",
            "Mensajes transaccionales.",
            "Códigos de validación u OTP.",
            "Comunicaciones de cobranza permitidas por la ley.",
            "Información relevante para clientes, usuarios o afiliados.",
        ]),
        ("p", "El usuario deberá asegurarse de contar con base legal, autorización, consentimiento o justificación suficiente para contactar a los destinatarios de sus mensajes."),
    ]),
    ("9. Uso prohibido", [
        ("p", "El usuario no podrá utilizar Telvoice.cl para enviar, facilitar o promover mensajes relacionados con:"),
        ("ul", [
            "Spam o comunicaciones no autorizadas.",
            "Fraude, phishing, smishing o suplantación de identidad.",
            "Estafas, engaños o captación ilícita de datos.",
            "Malware, enlaces maliciosos o sitios fraudulentos.",
            "Amenazas, acoso, extorsión o intimidación.",
            "Contenido falso, engañoso o confuso.",
            "Actividades ilegales o contrarias al orden público.",
            "Venta no autorizada de productos regulados.",
            "Contenido discriminatorio, violento, abusivo o difamatorio.",
            "Promoción de sustancias, servicios o actividades prohibidas.",
            "Mensajes que vulneren derechos de terceros.",
            "Campañas que infrinjan normativa de telecomunicaciones, consumidor, protección de datos o publicidad.",
        ]),
        ("p", "Telvoice.cl podrá suspender, bloquear, rechazar o eliminar cualquier campaña, cuenta, remitente, integración o tráfico que considere riesgoso, abusivo, ilegal, fraudulento o contrario a estos términos."),
    ]),
    ("10. Responsabilidad sobre bases de datos", [
        ("p", "El usuario es el único responsable de la legalidad, calidad, origen, actualización y autorización de las bases de datos utilizadas para sus campañas SMS."),
        ("p", "El usuario declara que:"),
        ("ul", [
            "Los destinatarios fueron obtenidos de forma legítima.",
            "Cuenta con autorización o base legal suficiente para contactarlos.",
            "Mantiene registros de consentimiento cuando corresponda.",
            "Respeta solicitudes de exclusión, baja u oposición.",
            "No utiliza bases compradas, extraídas o recolectadas ilegalmente.",
            "No envía mensajes a personas que hayan solicitado no ser contactadas.",
            "Cumple la normativa aplicable sobre protección de datos, consumidor, telecomunicaciones, publicidad y comercio electrónico.",
        ]),
        ("p", "Telvoice.cl no será responsable por reclamos, multas, sanciones, denuncias o daños derivados del uso indebido de bases de datos por parte del usuario."),
    ]),
    ("11. Cumplimiento normativo en comunicaciones SMS", [
        ("p", "El usuario se obliga a cumplir toda normativa aplicable a sus campañas, incluyendo disposiciones sobre telecomunicaciones, protección al consumidor, protección de datos personales, publicidad, comercio electrónico, cobranza, identificación del remitente, horarios permitidos, prefijos, numeración y mecanismos de exclusión."),
        ("p", "Cuando la normativa chilena exija condiciones especiales para comunicaciones masivas, automatizadas, informativas, promocionales, solicitadas o no solicitadas, el usuario será responsable de cumplir dichas exigencias antes de enviar sus campañas."),
        ("p", "Telvoice.cl podrá solicitar antecedentes, ajustar condiciones técnicas, exigir cambios en el contenido, suspender envíos o rechazar tráfico si estima que una campaña podría incumplir normativa vigente, afectar la reputación de rutas, generar reclamos o comprometer la operación."),
    ]),
    ("12. Contenido de los mensajes", [
        ("p", "El usuario es el único responsable del contenido de los mensajes enviados mediante Telvoice.cl."),
        ("p", "Cada mensaje debe ser claro, veraz y no inducir a error. Cuando corresponda, deberá identificar adecuadamente al remitente, informar el propósito de la comunicación y respetar mecanismos de baja, exclusión u oposición."),
        ("p", "Telvoice.cl podrá revisar, bloquear o rechazar contenido que, a su solo criterio razonable, pueda considerarse riesgoso, fraudulento, ilegal, engañoso, abusivo o perjudicial para la operación del servicio."),
    ]),
    ("13. API e integraciones", [
        ("p", "Telvoice.cl podrá entregar acceso API para que el usuario integre el envío de SMS en sus sistemas, CRM, ecommerce, plataformas internas, aplicaciones o software de terceros."),
        ("p", "El usuario será responsable de:"),
        ("ul", [
            "Proteger sus claves API y credenciales.",
            "No compartir accesos con terceros no autorizados.",
            "Implementar medidas de seguridad adecuadas.",
            "Evitar envíos duplicados, erróneos o abusivos.",
            "Validar números, contenidos y destinatarios antes del envío.",
            "Mantener registros de sus solicitudes.",
            "Cumplir límites técnicos, reglas de uso y documentación vigente.",
        ]),
        ("p", "Telvoice.cl podrá limitar, suspender o revocar accesos API ante uso indebido, sobrecarga, riesgo de seguridad, incumplimiento normativo o afectación de la estabilidad del servicio."),
    ]),
    ("14. Disponibilidad del servicio", [
        ("p", "Telvoice.cl procurará mantener una operación estable y disponible, pero no garantiza disponibilidad ininterrumpida."),
        ("p", "El servicio puede verse afectado por:"),
        ("ul", [
            "Mantenimiento programado.",
            "Fallas técnicas.",
            "Caídas de proveedores.",
            "Problemas de conectividad.",
            "Bloqueos o filtros de operadores.",
            "Cambios regulatorios.",
            "Eventos de fuerza mayor.",
            "Uso indebido de la plataforma.",
            "Incidentes de seguridad.",
            "Saturación de tráfico o rutas.",
        ]),
        ("p", "Telvoice.cl podrá realizar mantenimientos, actualizaciones o ajustes técnicos sin aviso previo cuando sean necesarios para proteger la seguridad, continuidad o calidad de la operación."),
    ]),
    ("15. Entregabilidad y reportes", [
        ("p", "Telvoice.cl podrá entregar información de estado de los mensajes, como enviado, procesado, entregado, rechazado, expirado, fallido u otros estados disponibles según la ruta y operador."),
        ("p", "Los reportes de entrega dependen de información recibida desde operadores, proveedores o sistemas intermedios. Por lo tanto, pueden existir demoras, diferencias, ausencia de confirmación o estados no concluyentes."),
        ("p", "El usuario entiende que un SMS enviado no implica necesariamente que el destinatario lo haya leído, abierto o actuado en consecuencia."),
    ]),
    ("16. Seguridad", [
        ("p", "Telvoice.cl implementará medidas razonables para proteger la plataforma, cuentas, información comercial, credenciales y operación del servicio."),
        ("p", "El usuario deberá adoptar sus propias medidas de seguridad, incluyendo contraseñas robustas, control de accesos, resguardo de claves API, protección de sistemas internos y monitoreo de integraciones."),
        ("p", "El usuario deberá informar inmediatamente a Telvoice.cl si detecta uso no autorizado de su cuenta, pérdida de credenciales, filtración de claves API o cualquier incidente que pueda comprometer la operación."),
    ]),
    ("17. Protección de datos personales", [
        ("p", "Telvoice.cl podrá tratar datos personales de usuarios, clientes, contactos comerciales, representantes de empresas y destinatarios de campañas, en la medida necesaria para prestar el servicio, gestionar cuentas, procesar pagos, emitir documentos, entregar soporte, prevenir fraude, cumplir obligaciones legales y operar la plataforma."),
        ("p", "Respecto de los datos de destinatarios cargados o utilizados por el usuario para campañas SMS, el usuario será responsable de contar con autorización o base legal suficiente para su tratamiento y contacto."),
        ("p", "Telvoice.cl podrá actuar como proveedor tecnológico o encargado operativo del tratamiento respecto de ciertos datos utilizados para ejecutar campañas, sin que ello libere al usuario de su responsabilidad sobre el origen, licitud y uso de sus bases de datos."),
        ("p", "El tratamiento de datos personales se regirá por la Política de Privacidad de Telvoice.cl y por la normativa aplicable."),
    ]),
    ("18. Confidencialidad", [
        ("p", "Toda información técnica, comercial, operacional, tarifaria, documental o estratégica intercambiada entre Telvoice.cl y el usuario será considerada confidencial, salvo que sea pública, haya sido obtenida legítimamente por otra vía o deba ser revelada por obligación legal o requerimiento de autoridad competente."),
        ("p", "El usuario no podrá divulgar credenciales, documentación técnica privada, tarifas especiales, rutas, configuraciones, accesos o información operacional sin autorización previa y por escrito de Telvoice.cl."),
    ]),
    ("19. Propiedad intelectual", [
        ("p", "Todos los derechos sobre el sitio web, marca, logotipo, textos, diseño, software, interfaz, documentación, procesos, contenido, estructura y elementos visuales de Telvoice.cl pertenecen a Telefoniachile Ltda, sus titulares, licenciantes o proveedores autorizados."),
        ("p", "El uso del servicio no otorga al usuario propiedad alguna sobre la plataforma, software, marca, rutas, tecnología, documentación o infraestructura utilizada."),
        ("p", "El usuario no podrá copiar, modificar, distribuir, descompilar, revender, sublicenciar o explotar comercialmente la plataforma sin autorización expresa."),
    ]),
    ("20. Suspensión o término del servicio", [
        ("p", "Telvoice.cl podrá suspender o terminar total o parcialmente el acceso del usuario al servicio en caso de:"),
        ("ul", [
            "Incumplimiento de estos términos.",
            "Uso fraudulento o ilegal.",
            "Reclamos reiterados de destinatarios.",
            "Riesgo regulatorio o reputacional.",
            "Envío de spam o tráfico no autorizado.",
            "Falta de pago.",
            "Uso indebido de API.",
            "Amenaza a la seguridad o estabilidad del servicio.",
            "Requerimiento de autoridad competente.",
            "Uso de bases de datos no autorizadas.",
            "Contenido prohibido o engañoso.",
        ]),
        ("p", "La suspensión podrá realizarse sin devolución de montos cuando exista incumplimiento grave, fraude, abuso, infracción normativa o daño a la operación."),
    ]),
    ("21. Devoluciones, anulaciones y derecho de retracto", [
        ("p", "Las solicitudes de devolución o anulación serán evaluadas conforme a la normativa aplicable, el estado de activación del servicio, el consumo de saldo y las condiciones informadas al momento de la compra."),
        ("p", "Cuando el servicio haya sido activado, utilizado, consumido total o parcialmente, o cuando el usuario haya solicitado expresamente el inicio de la prestación, los montos asociados al saldo consumido no serán reembolsables."),
        ("p", "Cuando corresponda ejercer derecho de retracto conforme a la legislación aplicable, Telvoice.cl procesará la solicitud según los plazos, requisitos y condiciones legales vigentes."),
        ("p", "Telvoice.cl podrá informar de manera previa, destacada y fácilmente accesible la exclusión del derecho de retracto cuando dicha exclusión sea procedente conforme a la normativa aplicable."),
        ("p", "No procederán devoluciones cuando existan indicios de fraude, abuso, uso indebido, incumplimiento de estos términos, tráfico prohibido o suspensión por causas atribuibles al usuario."),
    ]),
    ("22. Limitación de responsabilidad", [
        ("p", "Telvoice.cl no será responsable por daños, pérdidas, multas, sanciones, reclamos, lucro cesante, pérdida de datos, pérdida de oportunidades comerciales, daño reputacional o perjuicios indirectos derivados de:"),
        ("ul", [
            "Uso indebido del servicio por parte del usuario.",
            "Contenido de los mensajes enviados.",
            "Bases de datos no autorizadas.",
            "Errores en números de destino.",
            "Campañas mal configuradas.",
            "Incumplimiento normativo del usuario.",
            "Fallas de operadores móviles o terceros.",
            "Bloqueos, filtros o rechazos de red.",
            "Interrupciones de conectividad.",
            "Uso no autorizado de credenciales.",
            "Decisiones comerciales tomadas en base a reportes o métricas.",
            "Eventos de fuerza mayor.",
        ]),
        ("p", "En ningún caso la responsabilidad total de Telvoice.cl excederá el monto efectivamente pagado por el usuario por el servicio específico que dio origen al reclamo durante los últimos 30 días, salvo que la ley aplicable disponga algo distinto."),
    ]),
    ("23. Indemnidad", [
        ("p", "El usuario se obliga a mantener indemne a Telefoniachile Ltda, Telvoice.cl, sus representantes, socios, trabajadores, proveedores y relacionados frente a cualquier reclamo, denuncia, multa, sanción, demanda, daño, costo o gasto derivado de:"),
        ("ul", [
            "Uso indebido del servicio.",
            "Incumplimiento de estos términos.",
            "Infracción de normativa aplicable.",
            "Envío de mensajes no autorizados.",
            "Uso de bases de datos ilegales o no consentidas.",
            "Contenido fraudulento, engañoso o ilícito.",
            "Vulneración de derechos de terceros.",
            "Incumplimiento de obligaciones de protección de datos.",
        ]),
    ]),
    ("24. Modificaciones del servicio y de estos términos", [
        ("p", "Telvoice.cl podrá modificar estos Términos y Condiciones en cualquier momento para adaptarlos a cambios legales, técnicos, comerciales, operativos o de seguridad."),
        ("p", "Las modificaciones serán publicadas en el sitio web con su fecha de actualización. El uso continuado del servicio después de publicadas las modificaciones implicará aceptación de los nuevos términos."),
        ("p", "Si un cambio afecta materialmente un servicio contratado, Telvoice.cl procurará informar al usuario por medios razonables."),
    ]),
    ("25. Comunicaciones", [
        ("p", "Telvoice.cl podrá contactar al usuario mediante correo electrónico, teléfono, WhatsApp, SMS, plataforma web u otros canales informados por el usuario."),
        ("p", "El usuario acepta recibir comunicaciones relacionadas con:"),
        ("ul", [
            "Confirmación de compra.",
            "Activación de servicios.",
            "Soporte técnico.",
            "Facturación.",
            "Seguridad.",
            "Cambios operativos.",
            "Actualizaciones legales.",
            "Información relevante sobre el servicio contratado.",
        ]),
    ]),
    ("26. Fuerza mayor", [
        ("p", "Telvoice.cl no será responsable por incumplimientos o demoras causadas por hechos fuera de su control razonable, incluyendo desastres naturales, fallas eléctricas, interrupciones de internet, actos de autoridad, cambios regulatorios, conflictos laborales, ciberataques, fallas de proveedores, indisponibilidad de operadores, emergencias nacionales o eventos de fuerza mayor."),
    ]),
    ("27. Legislación aplicable y jurisdicción", [
        ("p", "Estos Términos y Condiciones se regirán por las leyes de la República de Chile, salvo que exista un contrato escrito distinto entre las partes."),
        ("p", "Cualquier controversia relacionada con el uso de Telvoice.cl, la contratación de servicios o la interpretación de estos términos será sometida a los tribunales competentes conforme a la legislación chilena, sin perjuicio de los derechos irrenunciables que la ley otorgue a consumidores o usuarios cuando corresponda."),
    ]),
    ("28. Contacto", [
        ("p", "Para consultas comerciales, soporte o asuntos relacionados con estos Términos y Condiciones, el usuario podrá contactar a Telvoice.cl a través de:"),
        ("contact", [
            ("Correo comercial", "contacto@telvoice.cl", "mailto:contacto@telvoice.cl"),
            ("Correo legal / cumplimiento", "legal@telvoice.cl", "mailto:legal@telvoice.cl"),
            ("Domicilio comercial", "Av Caupolicán 222, Temuco, Chile", None),
            ("Sitio web", "telvoice.cl", "https://telvoice.cl/"),
        ]),
    ]),
]


def render_block(block):
    kind = block[0]
    if kind == "p":
        return f'        <p>{block[1]}</p>\n'
    if kind == "ul":
        items = "".join(f"          <li>{item}</li>\n" for item in block[1])
        return f"        <ul>\n{items}        </ul>\n"
    if kind == "contact":
        rows = []
        for label, value, href in block[1]:
            if href:
                rows.append(
                    f'          <dt>{label}</dt><dd><a href="{href}">{value}</a></dd>'
                )
            else:
                rows.append(f"          <dt>{label}</dt><dd>{value}</dd>")
        return "        <dl class=\"legal-contact-list\">\n" + "\n".join(rows) + "\n        </dl>\n"
    return ""


def render_sections():
    parts = []
    for title, blocks in SECTIONS:
        body = "".join(render_block(b) for b in blocks)
        parts.append(
            f'      <section class="legal-section" id="{title.split(".")[0].strip()}">\n'
            f"        <h2>{title}</h2>\n{body}"
            f"      </section>\n"
        )
    return "".join(parts)


def render_content_fragment():
    return f"""<!-- Editar contenido legal en scripts/build-terminos-page.py (SECTIONS) y ejecutar: python3 scripts/build-terminos-page.py -->
<div class="legal-sections">
{render_sections()}  <div class="legal-actions">
    <a href="../" class="legal-btn-back">Volver al inicio</a>
  </div>
</div>
"""


def render_page(content_html: str) -> str:
    # fix typo div
    content_html = content_html.replace("</div>", "</div>").replace("<div", "<div").replace("</div>", "</div>")
    return f"""<!DOCTYPE html>
<html class="light" lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="Condiciones de uso, compra online de bolsas SMS, API, cumplimiento y operación de servicios de mensajería SMS en Telvoice.cl." />
  <title>Términos y Condiciones | Telvoice.cl</title>
  <link rel="canonical" href="https://telvoice.cl/terminos-y-condiciones/" />
  <link rel="icon" href="../assets/telvoice-isotipo.png" type="image/png" sizes="any" />
  <meta name="theme-color" content="#0052cc" />
  <meta property="og:locale" content="es_CL" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://telvoice.cl/terminos-y-condiciones/" />
  <meta property="og:site_name" content="Telvoice" />
  <meta property="og:title" content="Términos y Condiciones | Telvoice.cl" />
  <meta property="og:description" content="Condiciones de uso, compra online de bolsas SMS, API, cumplimiento y operación de servicios de mensajería SMS en Telvoice.cl." />
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&amp;display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
  <link href="https://fonts.googleapis.com" rel="preconnect" />
  <link crossorigin href="https://fonts.gstatic.com" rel="preconnect" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&amp;family=Montserrat:wght@600;700&amp;display=swap" rel="stylesheet" />
  <script id="tailwind-config">
    tailwind.config = {{
      theme: {{
        extend: {{
          colors: {{
            primary: "#0052cc",
            background: "#faf8ff",
            surface: "#faf8ff",
            "on-background": "#131b2e",
            "on-surface-variant": "#434654",
            "on-primary": "#ffffff",
            "outline-variant": "#c3c6d6",
            "surface-container-low": "#f2f3ff",
          }},
          spacing: {{ "margin-page": "40px", "container-max": "1440px" }},
          fontFamily: {{
            h2: ["Montserrat", "sans-serif"],
            h3: ["Montserrat", "sans-serif"],
            "body-md": ["Inter", "sans-serif"],
            "body-lg": ["Inter", "sans-serif"],
            "body-sm": ["Inter", "sans-serif"],
            "label-caps": ["Montserrat", "sans-serif"],
          }},
          fontSize: {{
            h2: ["32px", {{ lineHeight: "40px", fontWeight: "600" }}],
            h3: ["24px", {{ lineHeight: "32px", fontWeight: "600" }}],
            "body-lg": ["18px", {{ lineHeight: "28px" }}],
            "body-md": ["16px", {{ lineHeight: "24px" }}],
            "body-sm": ["14px", {{ lineHeight: "20px" }}],
            "label-caps": ["12px", {{ lineHeight: "16px", fontWeight: "700" }}],
          }},
        }},
      }},
    }};
  </script>
  <link rel="stylesheet" href="../css/legal-pages.css" />
</head>
<body class="bg-background text-on-background font-body-md antialiased">
  <nav class="legal-nav bg-surface/90 backdrop-blur-md sticky top-0 z-50 border-b border-outline-variant/30 w-full">
    <div class="flex justify-between items-center gap-4 py-4 pl-8 pr-4 sm:pl-12 sm:pr-6 md:pl-20 md:pr-8 lg:pl-28 lg:pr-10 max-w-container-max mx-auto">
      <a href="../" class="flex items-center gap-2 shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="telvoice.cl, ir al inicio">
        <img src="../assets/telvoice-isotipo.png" alt="" width="36" height="36" class="h-9 w-9 object-contain" decoding="async" />
        <span class="font-h3 text-h3 font-bold tracking-tight lowercase inline-flex items-baseline">
          <span class="text-black">telvoice</span><span class="font-h3 text-body-lg font-bold hero-grad-text">.cl</span>
        </span>
      </a>
      <ul class="hidden lg:flex gap-1 items-center">
        <li><a class="font-body-md text-on-surface-variant hover:text-primary px-4 py-2 rounded-full hover:bg-surface-container-low" href="../index.html#precios">Precios</a></li>
        <li><a class="font-body-md text-on-surface-variant hover:text-primary px-4 py-2 rounded-full hover:bg-surface-container-low" href="../index.html#casos-uso">Casos de uso</a></li>
        <li><a class="font-body-md text-on-surface-variant hover:text-primary px-4 py-2 rounded-full hover:bg-surface-container-low" href="../index.html#api">API</a></li>
        <li><a class="font-body-md text-on-surface-variant hover:text-primary px-4 py-2 rounded-full hover:bg-surface-container-low" href="../index.html#empresas">Empresas</a></li>
        <li><a class="font-body-md text-on-surface-variant hover:text-primary px-4 py-2 rounded-full hover:bg-surface-container-low" href="../index.html#contacto">Contacto</a></li>
      </ul>
      <button type="button" id="menu-toggle" class="lg:hidden inline-flex items-center justify-center w-11 h-11 rounded-full border border-outline-variant/60" aria-expanded="false" aria-controls="mobile-panel" aria-label="Abrir menú">
        <span class="material-symbols-outlined" id="menu-icon-open">menu</span>
        <span class="material-symbols-outlined hidden" id="menu-icon-close">close</span>
      </button>
    </div>
    <div id="mobile-panel" class="hidden lg:hidden border-t border-outline-variant/30 bg-surface/95 py-4 pl-8 pr-4 sm:pl-12 md:pl-20 max-w-container-max mx-auto">
      <ul class="flex flex-col gap-1">
        <li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="../index.html#precios">Precios</a></li>
        <li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="../index.html#casos-uso">Casos de uso</a></li>
        <li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="../index.html#api">API</a></li>
        <li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="../index.html#empresas">Empresas</a></li>
        <li><a class="block font-body-md py-3 px-4 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary" href="../index.html#contacto">Contacto</a></li>
      </ul>
    </div>
  </nav>

  <main class="legal-page">
    <article class="legal-doc mx-auto">
      <header class="legal-doc-header">
        <p class="legal-eyebrow">Documento legal</p>
        <h1>Términos y Condiciones</h1>
        <p class="legal-lead">Condiciones generales de uso, compra y operación de los servicios SMS ofrecidos por Telvoice.cl.</p>
        <p class="legal-updated"><strong>Última actualización:</strong> 18 de mayo de 2026</p>
        <dl class="legal-meta">
          <div><dt>Titular del servicio</dt><dd>Telefoniachile Ltda</dd></div>
          <div><dt>RUT / Identificación tributaria</dt><dd>76.287.242-0</dd></div>
          <div><dt>Domicilio comercial</dt><dd>Av Caupolicán 222, Temuco, Chile</dd></div>
          <div><dt>Correo de contacto</dt><dd><a href="mailto:contacto@telvoice.cl">contacto@telvoice.cl</a></dd></div>
          <div><dt>Correo para asuntos legales o cumplimiento</dt><dd><a href="mailto:legal@telvoice.cl">legal@telvoice.cl</a></dd></div>
          <div><dt>Sitio web</dt><dd><a href="https://telvoice.cl/">telvoice.cl</a></dd></div>
        </dl>
      </header>
{content_html}
    </article>
  </main>

  <footer class="legal-footer bg-primary text-on-primary" role="contentinfo">
    <div class="max-w-container-max mx-auto px-4 sm:px-margin-page pt-12 pb-6">
      <div class="grid grid-cols-1 gap-10 border-b border-on-primary/20 pb-10 md:grid-cols-2 lg:grid-cols-12">
        <div class="lg:col-span-4">
          <a href="../" class="inline-flex items-center gap-2 text-on-primary" aria-label="telvoice.cl, ir al inicio">
            <img src="../assets/telvoice-isotipo.png" alt="" width="40" height="40" class="h-10 w-10 object-contain" />
            <span class="font-h3 text-h3 font-bold lowercase">telvoice<span class="text-body-lg">.cl</span></span>
          </a>
          <p class="mt-4 max-w-sm font-body-md text-on-primary/85">SMS masivos para empresas en Chile: bolsas prepago, precios por volumen, pago online y API.</p>
        </div>
        <div class="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-8">
          <div>
            <p class="font-label-caps text-label-caps uppercase tracking-wider text-on-primary/55">Telvoice.cl</p>
            <ul class="mt-4 space-y-3">
              <li><a class="text-on-primary/90 hover:text-on-primary" href="../index.html#precios">Bolsas SMS</a></li>
              <li><a class="text-on-primary/90 hover:text-on-primary" href="../index.html#api">API SMS</a></li>
              <li><a class="text-on-primary/90 hover:text-on-primary" href="../index.html#contacto">Contacto</a></li>
            </ul>
          </div>
          <div>
            <p class="font-label-caps text-label-caps uppercase tracking-wider text-on-primary/55">Legal</p>
            <ul class="mt-4 space-y-3">
              <li><a class="text-on-primary font-semibold" href="./" aria-current="page">Términos y condiciones</a></li>
              <li><a class="text-on-primary/90 hover:text-on-primary" href="../politica-de-privacidad/">Política de privacidad</a></li>
              <li><a class="text-on-primary/90 hover:text-on-primary" href="../uso-responsable/">Uso responsable</a></li>
            </ul>
          </div>
        </div>
      </div>
      <p class="pt-8 font-body-sm text-on-primary/65">© 2026 Telvoice.cl. Todos los derechos reservados.</p>
    </div>
  </footer>
  <script src="../js/telvoice-legal-nav.js"></script>
</body>
</html>
"""


def main():
    fragment = render_content_fragment()
    fragment = fragment.replace("<div", "<div").replace("</div>", "</div>")
    fragment = fragment.replace("div", "div")  # cleanup below
    fragment = fragment.replace("<div", "<div").replace("</div>", "</div>")

    page = render_page(fragment)
    page = page.replace("<div", "<div").replace("</div>", "</div>")

    (ROOT / "content" / "terminos-y-condiciones.html").write_text(fragment, encoding="utf-8")
    (ROOT / "terminos-y-condiciones" / "index.html").write_text(page, encoding="utf-8")
    print("Generated content/terminos-y-condiciones.html and terminos-y-condiciones/index.html")


if __name__ == "__main__":
    main()