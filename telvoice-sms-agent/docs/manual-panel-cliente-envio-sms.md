# Manual del panel cliente — Envío SMS y campañas

Guía operativa para usuarios del panel Telvoice (`https://agent.telvoice.cl/app`). Describe cómo gestionar contactos, plantillas, envíos individuales, campañas masivas, envíos programados y campañas desde agendas, hasta el seguimiento de entregas (DLR).

Ruta web: **Soporte → Guía de envío SMS** (`/app/support/manual`) · PDF: `/app/support/manual.pdf`

---

## Tabla de contenidos

1. [Antes de empezar](#1-antes-de-empezar)
2. [Acceso y navegación](#2-acceso-y-navegación)
3. [Saldo SMS y compras](#3-saldo-sms-y-compras)
4. [Contactos y agendas](#4-contactos-y-agendas)
5. [Plantillas SMS](#5-plantillas-sms)
6. [Enviar SMS — pantalla principal](#6-enviar-sms--pantalla-principal)
7. [Envío individual](#7-envío-individual)
8. [Campaña masiva](#8-campaña-masiva)
9. [Envío programado](#9-envío-programado)
10. [Envío desde plantilla](#10-envío-desde-plantilla)
11. [Campañas desde contactos (wizard)](#11-campañas-desde-contactos-wizard)
12. [Lanzar campaña real desde borrador](#12-lanzar-campaña-real-desde-borrador)
13. [Listado y detalle de campañas](#13-listado-y-detalle-de-campañas)
14. [Bandeja de mensajes](#14-bandeja-de-mensajes)
15. [Reportes y exportación DLR](#15-reportes-y-exportación-dlr)
16. [Estados de mensaje y DLR](#16-estados-de-mensaje-y-dlr)
17. [Límites, segmentos y remitente](#17-límites-segmentos-y-remitente)
18. [Errores frecuentes](#18-errores-frecuentes)
19. [Soporte y configuración](#19-soporte-y-configuración)
20. [Resumen de rutas útiles](#20-resumen-de-rutas-útiles)

---

## 1. Antes de empezar

### 1.1 Requisitos para enviar SMS reales

| Requisito | Descripción |
|-----------|-------------|
| **Cuenta activa** | Usuario con sesión válida en el panel cliente. |
| **Empresa asociada** | Tu perfil debe estar vinculado a una empresa Telvoice. |
| **Rol operativo** | Perfiles **Owner**, **Admin** u **Operator** pueden enviar y gestionar campañas. El rol **Viewer** solo consulta. |
| **Saldo SMS** | Debes tener SMS disponibles en **Mi saldo**. El costo se descuenta al aceptar cada mensaje por el proveedor. |
| **Plan tarifario activo** | La empresa debe tener rate plan configurado con envío habilitado (`live_enabled`). |
| **Ruta y proveedor activos** | Telvoice debe tener una ruta SMS activa hacia el operador para tu cuenta. |
| **Remitente (Sender ID)** | Obligatorio en todos los envíos. Máximo 11 caracteres alfanuméricos (A–Z, 0–9). Puede estar sujeto a allowlist de tu empresa. |

### 1.2 Qué significa «envío real»

Todos los envíos desde el panel cliente se registran en modo **LIVE SEND**: el mensaje sale hacia el operador (aSMSC) y consume saldo real. No existe simulación mock en el panel cliente.

- **MASIVA** — campaña con varios destinatarios enviada de inmediato.
- **PROGRAMADO** — campaña agendada para fecha/hora futura (zona Chile).
- **LIVE SEND** — envío individual o campaña desde contactos tras confirmación explícita.

### 1.3 Consumo de saldo

- **Envío individual:** se descuenta al aceptar el mensaje.
- **Campaña masiva / programada:** se descuenta por cada destinatario aceptado en cola.
- **Campaña desde contactos:** el borrador **no** descuenta saldo; el débito ocurre al procesar cada mensaje en cola tras **Enviar campaña real**.

---

## 2. Acceso y navegación

### 2.1 Ingreso

1. Abre `https://agent.telvoice.cl/login`.
2. Inicia sesión con tu usuario cliente.
3. Tras autenticarte, accedes al panel en `/app/dashboard`.

### 2.2 Menú principal

| Menú | Ruta | Para qué sirve |
|------|------|----------------|
| **Enviar SMS** | `/app/send-sms` | Envíos individuales, masivos, programados y desde plantilla. |
| **Dashboard** | `/app/dashboard` | Resumen de saldo, envíos del mes y gráficos DLR. |
| **Reportes** | `/app/reports` | Reporte detallado de entregas con filtros y CSV. |
| **Bandeja** | `/app/inbox` | Historial de mensajes enviados desde el panel. |
| **Mi saldo** | `/app/wallet` | Movimientos y saldo SMS. |
| **Campañas** | `/app/campaigns` | Listado, borradores y detalle de campañas. |
| **Comprar SMS** | `/app/buy-sms` | Adquisición de bolsas SMS. |
| **Mis órdenes** | `/app/orders` | Estado de compras. |
| **Contactos** | `/app/contacts` | Agendas, contactos e importación. |
| **Plantillas** | `/app/templates` | Biblioteca de textos reutilizables. |
| **Facturas** | `/app/invoices` | Comprobantes de facturación. |
| **API** | `/app/api` | Claves API, webhook DLR y documentación. |
| **Soporte** | `/app/support` | Tickets de ayuda. |
| **Configuración** | `/app/settings` | Datos de empresa, facturación y preferencias. |

---

## 3. Saldo SMS y compras

### 3.1 Consultar saldo

- En **Dashboard** aparece el balance disponible.
- En **Mi saldo** (`/app/wallet`) ves el detalle de movimientos: compras acreditadas, consumos por envío, ajustes, etc.

### 3.2 Comprar SMS

1. Ve a **Comprar SMS** o usa el botón **Comprar SMS** del dashboard.
2. Elige el paquete y completa el pago (Mercado Pago u otro medio configurado).
3. Tras acreditarse la orden, el saldo se refleja en **Mi saldo**.

### 3.3 Antes de una campaña grande

1. Calcula el costo estimado en la pantalla de envío o en el wizard de campaña (**Total SMS estimado**).
2. Verifica que **Saldo después** sea ≥ 0 en el resumen económico.
3. Si el saldo es insuficiente, compra SMS antes de lanzar.

---

## 4. Contactos y agendas

Ruta: **Contactos** → `/app/contacts`

Los contactos se organizan en **agendas** (listas). Son la base para campañas masivas, programadas y el wizard de campañas.

### 4.1 Crear una agenda

1. En Contactos, pulsa **Gestión rápida** o **Nueva agenda**.
2. Paso 1 del asistente: ingresa **Nombre de la agenda** (ej. «Clientes VIP»).
3. Guarda. La agenda aparece en el panel lateral izquierdo.

### 4.2 Agregar contactos manualmente

1. Abre **Gestión rápida** → elige la agenda (paso 2).
2. Selecciona **Contacto manual** (paso 3).
3. Completa nombre, teléfono (Chile: `569XXXXXXXX` o `9XXXXXXXX`), email opcional.
4. Guarda.

### 4.3 Importar planilla (CSV o Excel)

**Desde el asistente en Contactos:**

1. Gestión rápida → elige agenda → **Importar planilla**.
2. Pega contenido CSV o arrastra archivo CSV/Excel.
3. **Previsualizar importación** — revisa válidos, omitidos y errores.
4. **Confirmar importación**.

**Desde la página dedicada** `/app/contacts/import`:

Columnas reconocidas (cabecera opcional):

| Columna | Obligatorio | Ejemplo |
|---------|-------------|---------|
| `nombre` | Recomendado | Juan Pérez |
| `telefono` / `teléfono` | Sí | 56912345678 |
| `email` | No | juan@ejemplo.cl |
| `agenda` | No | Clientes VIP |
| `tags` | No | vip,premium |
| `notas` | No | Cliente desde web |

Ejemplo CSV:

```csv
nombre,telefono,email,tags
Juan Pérez,56912345678,juan@ejemplo.cl,vip
María López,56987654321,maria@ejemplo.cl,
```

### 4.4 Estados de contacto

| Estado | Significado |
|--------|-------------|
| **active** | Válido para campañas. |
| **blocked** | Bloqueado; se omite en envíos. |
| **opt_out** | Solicitó no recibir SMS; se omite. |
| **duplicate** | Duplicado detectado. |
| **incomplete** | Datos incompletos; puede omitirse. |

Al preparar una campaña, el sistema muestra cuántos contactos fueron **omitidos** por inválidos, bloqueados, opt-out o duplicados.

### 4.4 Filtrar y buscar

- Usa **Buscar** por nombre o teléfono.
- Filtra por **Agenda** en el desplegable; la URL incluirá `?agenda=<id>` — ese identificador sirve para el wizard de campañas (ver sección 11).
- **Limpiar** restablece filtros.

### 4.5 Duplicar o eliminar agenda

En cada tarjeta de agenda:

- **Duplicar** — copia la agenda.
- **Eliminar** — quita la agenda (los contactos no se borran).

---

## 5. Plantillas SMS

Ruta: **Plantillas** → `/app/templates`

Las plantillas aceleran redacción y mantienen mensajes consistentes.

### 5.1 Crear plantilla

1. Pulsa **Nueva plantilla**.
2. Completa:
   - **Nombre** (interno, ej. «Código OTP»).
   - **Categoría:** OTP, Transaccional, Recordatorio, Marketing, Interno, etc.
   - **Mensaje** — puedes usar variables (ver abajo).
   - **Estado:** **Activa** (usable en envíos) o **Borrador** (solo guardada).
3. **Guardar plantilla**.

### 5.2 Variables disponibles

En plantillas y en el campo mensaje del envío puedes usar:

| Variable | Uso típico |
|----------|------------|
| `{{nombre}}` | Nombre del destinatario |
| `{{codigo}}` | OTP o código |
| `{{monto}}` | Monto en recordatorios de pago |
| `{{empresa}}` | Nombre comercial |
| `{{fecha}}` | Fecha dinámica |

En la pantalla **Enviar SMS** también aparecen chips `{nombre}`, `{codigo}`, `{empresa}`, `{fecha}` para insertar rápidamente.

> **Nota:** En campañas masivas con CSV por fila, las variables se sustituyen según la lógica del envío; en envío individual desde plantilla + contacto, se usa el contacto seleccionado.

### 5.3 Editar, duplicar o eliminar

Desde la tabla de plantillas: acciones por fila para editar, duplicar o eliminar. Solo las plantillas **Activas** aparecen en **Enviar SMS → Desde plantilla**.

---

## 6. Enviar SMS — pantalla principal

Ruta: **Enviar SMS** → `/app/send-sms`

Cuatro modos (pestañas o tarjetas superiores):

| Modo | Uso |
|------|-----|
| **SMS individual** | Un destinatario, un mensaje. |
| **Campaña masiva** | Muchos destinatarios, envío inmediato. |
| **Envío programado** | Muchos destinatarios, fecha/hora futura. |
| **Desde plantilla** | Mensaje predefinido + contacto o agenda. |

### 6.1 Panel operativo (chips superiores)

Al cargar la página verás indicadores en tiempo real:

- **Saldo SMS** — disponible ahora.
- **Ruta** — ruta SMS asignada.
- **Webhook** — si tienes URL DLR configurada.
- **Cuota hoy / Enviados hoy** — contador informativo (si aplica política diaria).
- **TPS** — velocidad máxima de envío configurada para tu cuenta.

Si el envío no está habilitado, verás un aviso y el botón de envío permanecerá deshabilitado hasta resolver bloqueos (saldo, plan, ruta, permisos).

### 6.2 Campos comunes

| Campo | Descripción |
|-------|-------------|
| **Nombre de campaña** | Opcional; identifica el envío en listados (se genera uno por defecto si lo dejas vacío). |
| **Remitente / Sender ID** | Máx. 11 caracteres alfanuméricos. Se sugiere automáticamente desde el nombre de tu empresa. |
| **Mensaje SMS** | Texto del SMS. |
| **Vista previa** | Simulación visual del mensaje en un teléfono. |
| **Caracteres / Segmentos / Costo est. / Codificación** | Calculados en vivo (GSM-7 o UCS-2 si hay caracteres especiales). |

---

## 7. Envío individual

**Modo:** SMS individual

### Pasos

1. Ve a **Enviar SMS** → **SMS individual**.
2. Verifica **Saldo SMS** y que no haya bloqueos en los chips superiores.
3. (Opcional) **Nombre de campaña**.
4. **Remitente / Sender ID** — obligatorio.
5. **Número destinatario** — formato Chile: `569XXXXXXXX` (sin `+`). Ejemplo: `56912345678`.
6. Redacta **Mensaje SMS**. Revisa **Segmentos** y **Costo est.**
7. Pulsa **Enviar SMS**.
8. Aparece el modal **¡SMS enviado!** con destino, segmentos y saldo restante.
9. Opciones: **Ir a bandeja** para ver el mensaje, o continuar enviando.

### Límite de segmentos (individual)

El envío individual tiene un tope de segmentos por mensaje (habitualmente **3 segmentos**). Si superas el límite, el botón se deshabilita y debes acortar el texto.

> Las campañas masivas **no** aplican este tope en el formulario; el costo se calcula por segmentos reales.

### Confirmación y DLR

El mensaje queda en estado `sent` / `pending` / `delivered` según respuesta del operador. Los DLR pueden llegar vía webhook configurado en **API** (consulta con soporte si necesitas integración).

---

## 8. Campaña masiva

**Modo:** Campaña masiva

Envía el mismo mensaje (o mensajes por fila) a múltiples destinatarios **de inmediato**.

### 8.1 Destinatarios

Elige **una o ambas** fuentes:

**A) Agenda de contactos**

1. Desplegable **Contactos** — selecciona una agenda.
2. Los números válidos de esa agenda se cargan en la previsualización.

**B) Archivo CSV**

1. **Cargar CSV**.
2. Formatos admitidos:
   - **Solo números** — una columna o una fila por número; usas un **mensaje común** en el textarea.
   - **Número + mensaje por fila** — columnas `numero` (o `telefono`) y `mensaje`. En este caso el textarea de mensaje común se bloquea.

Ejemplo CSV solo números:

```csv
56912345678
56987654321
```

Ejemplo CSV con mensaje por fila:

```csv
numero,mensaje
56912345678,Hola Juan tu pedido está listo
56987654321,Hola María tu pedido está listo
```

### 8.2 Previsualización

La tabla muestra **Número**, **Mensaje**, **Seg.** (segmentos) y **SMS** (costo). Abajo verás un resumen:

> «X listos · Y con error · Z SMS estimados»

Filas con error (número inválido, etc.) no se envían.

### 8.3 Enviar

1. Completa **Remitente** y **Mensaje** (si no vienen del CSV).
2. Revisa el costo total estimado vs. saldo.
3. Pulsa **Enviar campaña**.
4. Modal **¡Envío exitoso!** — destinatarios, en cola/enviados, saldo.
5. El despacho continúa en segundo plano respetando **TPS** (velocidad configurada, típicamente hasta ~20 SMS/s según tu plan).

### 8.4 Seguimiento

- **Ver campañas** — abre el listado con la campaña recién creada (modo **MASIVA**).
- **Ir a bandeja** — mensajes individuales generados.

---

## 9. Envío programado

**Modo:** Envío programado

Igual que la campaña masiva, pero con **fecha y hora** de despacho.

### Pasos adicionales

1. Selecciona destinatarios (agenda y/o CSV) como en masiva.
2. **Fecha programada** — calendario.
3. **Hora** — hora local **America/Santiago** (Chile).
4. Pulsa **Programar envío**.

### Reglas de programación

- La fecha/hora debe ser **al menos 1 minuto en el futuro**.
- Si falta fecha u hora, el formulario muestra error.
- Tras confirmar: modal **¡Envío programado!** con la fecha formateada.
- En **Campañas**, el modo aparece como **PROGRAMADO**.

El worker de Telvoice encolará y enviará automáticamente a la hora indicada.

---

## 10. Envío desde plantilla

**Modo:** Desde plantilla

### Pasos

1. **Plantilla** — elige una plantilla **Activa**.
2. El texto se carga en el mensaje (editable si lo necesitas).
3. **Contactos** — elige una agenda:
   - Si la agenda tiene **un solo** teléfono → envío **individual**.
   - Si tiene **varios** → el modo cambia automáticamente a comportamiento **masivo**.
4. Completa **Remitente** si no está prefijado.
5. Envía con **Enviar SMS** o **Enviar campaña** según el caso.

Ideal para OTP, confirmaciones transaccionales o recordatorios estandarizados.

---

## 11. Campañas desde contactos (wizard)

Ruta: **Campañas → Nueva campaña** → `/app/campaigns/new`

Flujo avanzado: preparar audiencia desde contactos, estimar costo, guardar **borrador** y luego lanzar envío real desde el detalle.

### 11.1 Cómo llegar con audiencia definida

El wizard necesita parámetros en la URL:

| Parámetro | Ejemplo | Audiencia |
|-----------|---------|-----------|
| `list_id` | `/app/campaigns/new?list_id=uuid-agenda` | Todos los contactos **activos** de esa agenda. |
| `tag_id` | `/app/campaigns/new?tag_id=uuid-tag` | Contactos con ese tag. |
| `contacts` | `/app/campaigns/new?contacts=id1,id2` | Contactos específicos (UUIDs separados por coma). |

**Obtener el `list_id` de una agenda:**

1. Ve a **Contactos**.
2. Haz clic en la agenda del panel lateral (o filtra por agenda).
3. La URL será `/app/contacts?agenda=<UUID>` — ese UUID es el `list_id`.

**Alternativa más simple:** usa **Enviar SMS → Campaña masiva** y elige la agenda en el desplegable, sin pasar por el wizard.

### 11.2 Paso 1 — Audiencia

Muestra KPIs:

- Encontrados, Válidos, Inválidos, Bloqueados, Opt-out, Duplicados omitidos.

Si hay omitidos, aparece aviso amarillo explicando las causas.

### 11.3 Paso 2 — Mensaje

1. **Nombre campaña** — identificador interno.
2. **Sender ID** — remitente (máx. 11 alfanuméricos).
3. **Mensaje SMS** — cuerpo del texto.
4. **Actualizar previsualización** — recalcula caracteres, segmentos y costos.

### 11.4 Paso 3 — Resumen económico

- Destinatarios válidos.
- SMS por destinatario (segmentos).
- **Total SMS estimado**.
- **Saldo disponible** y **Saldo después**.

Si hay bloqueo (`blockReason`): sin destinatarios válidos o saldo insuficiente, no podrás guardar borrador.

### 11.5 Paso 4 — Confirmación

1. Lee el aviso: **guardar borrador no envía SMS ni descuenta saldo**.
2. Pulsa **Guardar borrador**.
3. Redirección al **detalle de la campaña** (`/app/campaigns/:id`).

---

## 12. Lanzar campaña real desde borrador

Ruta: **Campañas → Ver detalle** → `/app/campaigns/:id`

Para borradores creados desde contactos (`source: contacts_audience`).

### 12.1 Preparación para envío real

El panel **Preparación para envío real** valida:

| Check | Qué verifica |
|-------|----------------|
| Saldo SMS | Suficiente para el estimado. |
| Permiso live | Plan con envío habilitado. |
| Campañas | Permiso de campañas en plan. |
| Ruta / proveedor | Conectividad operativa. |
| Rate plan | Plan tarifario asignado. |
| Remitente | Sender ID permitido para la empresa. |
| TPS | Velocidad de despacho configurada. |

Estados: **Listo** (verde), **Bloqueado** (amarillo/rojo) con lista de motivos.

### 12.2 Enviar campaña real

1. Revisa KPIs: destinatarios, SMS consumidos, modo **BORRADOR** / **LIVE SEND**.
2. En el bloque **Enviar campaña real**:
   - Marca la casilla de **autorización** (consentimiento de envío comercial real).
   - Escribe exactamente **`ENVIAR`** en el campo de confirmación.
3. Pulsa el botón de envío.
4. Los mensajes pasan a **cola**; el worker los despacha respetando TPS.
5. El saldo se debita **por mensaje aceptado**, no en un solo cargo upfront.

### 12.3 Después del lanzamiento

- **Timeline** — campaña creada → encolada → procesando → finalizada.
- **Estado cola** — contadores queued / sent / failed.
- **Mensajes enviados** — tabla con destinatario, estado, proveedor, referencia.
- **Tráfico (TPS)** — metadatos de política aplicada (si visible).

---

## 13. Listado y detalle de campañas

Ruta: **Campañas** → `/app/campaigns`

### 13.1 Listado

Columnas: Fecha, Nombre, Remitente, Destinatarios, SMS, Estado, Modo, Acciones.

**Modos visibles:**

| Etiqueta | Significado |
|----------|-------------|
| **BORRADOR** | Guardada, sin envío. |
| **MASIVA** | Envío masivo inmediato. |
| **PROGRAMADO** | Agendada. |
| **LIVE SEND** | Envío real (individual o desde contactos). |

**Estados:**

| Estado | Significado |
|--------|-------------|
| Borrador | Sin lanzar. |
| En curso / processing | Despachando. |
| Completada | Finalizada. |
| Fallida | Error global o sin envíos válidos. |

Filtros: **Buscar** por nombre, **Limpiar**.

Acciones: **Ver detalle**, **Nueva campaña**, **Envío SMS**.

### 13.2 Detalle

Incluye: resumen, timeline, audiencia, mensaje, saldo/wallet, cola, mensajes enviados y (en producción) trazabilidad TPS.

---

## 14. Bandeja de mensajes

Ruta: **Bandeja** → `/app/inbox`

Historial de mensajes enviados desde el panel.

| Columna | Descripción |
|---------|-------------|
| Fecha | Creación del registro. |
| Destinatario | Número E.164 Chile. |
| Remitente | Sender ID usado. |
| Mensaje | Texto (truncado). |
| Seg. | Segmentos. |
| Costo | SMS debitados. |
| Estado | sent, delivered, failed, etc. |
| Modo | LIVE SEND, MASIVA, etc. |
| Referencia | ID del proveedor (aSMSC). |
| Error | Detalle si falló. |

Útil para comprobar un envío puntual tras **Enviar SMS**.

---

## 15. Reportes y exportación DLR

Ruta: **Reportes** → `/app/reports`

Reporte enterprise de entregas con filtros avanzados:

- Rango de fechas.
- Remitente, teléfono, job/campaña.
- Estado DLR, país, MCC/MNC.

**Buscar** aplica filtros. **Exportar CSV** (`/app/reports/export.csv`) descarga el resultado para análisis en Excel o BI.

El **Dashboard** ofrece vista resumida: tasa de entrega del mes y volumen últimos 7 días.

---

## 16. Estados de mensaje y DLR

| Estado | Significado para el cliente |
|--------|----------------------------|
| **queued** | En cola interna, pendiente de despacho. |
| **pending** | Enviado al proveedor, esperando DLR. |
| **sent** | Aceptado por el operador. |
| **delivered** | Entregado al handset (DLR OK). |
| **failed** / **rejected** | No entregado; revisa número o contenido. |
| **expired** | Ventana de entrega expirada. |

Los DLR pueden reflejarse en **Bandeja** y **Reportes** con delay de segundos a minutos según operador.

---

## 17. Límites, segmentos y remitente

### 17.1 Segmentos y codificación

| Codificación | 1 segmento | Segmentos adicionales |
|--------------|------------|------------------------|
| **GSM-7** (sin acentos raros) | 160 caracteres | 153 por segmento extra |
| **UCS-2** (emoji, tildes especiales) | 70 caracteres | 67 por segmento extra |

Cada segmento = **1 SMS** de saldo (salvo acuerdos especiales en plan).

### 17.2 Remitente (Sender ID)

- Máximo **11** caracteres.
- Solo **A–Z** y **0–9** (sin espacios ni símbolos).
- Debe estar autorizado para tu empresa; si no, verás error al enviar.

### 17.3 Teléfonos Chile

Formatos aceptados habitualmente:

- `56912345678` (recomendado).
- `912345678` (se normaliza a 56…).

### 17.4 TPS (velocidad)

El despacho masivo no es instantáneo: respeta **TPS** configurado (ej. 5–20 SMS/s). Una campaña de 1.000 SMS puede tardar varios minutos. El detalle de campaña muestra información de tráfico cuando está disponible.

### 17.5 Cuota diaria

Por defecto el límite efectivo es tu **saldo SMS**. Si Telvoice activa cuota diaria en tu contrato, verás contador **Cuota hoy** en Enviar SMS.

### 17.6 Opt-out y cumplimiento

No envíes SMS comerciales a contactos en **opt_out** o **blocked**. El sistema los omite automáticamente en campañas, pero eres responsable de la base de datos que cargas vía CSV.

---

## 18. Errores frecuentes

| Mensaje / situación | Causa probable | Qué hacer |
|---------------------|----------------|-----------|
| Sin permiso | Rol viewer o sesión inválida | Contacta al admin de tu empresa. |
| Saldo insuficiente | SMS agotados | **Comprar SMS** y reintentar. |
| Número inválido | Formato incorrecto | Usa `569XXXXXXXX`. |
| Supera máximo de segmentos | Mensaje muy largo (individual) | Acorta texto o divide en campaña masiva. |
| Sender ID inválido | Caracteres no permitidos o > 11 | Usa solo letras y números. |
| No hay ruta SMS activa | Configuración telco | Abre ticket en **Soporte**. |
| Envío no habilitado / live_enabled | Plan sin envío | Solicita habilitación comercial. |
| Escribe ENVIAR para confirmar | Confirmación campaña live | Escribe exactamente `ENVIAR`. |
| La simulación mock está deshabilitada | Ruta antigua | Usa **Enviar campaña real** en el detalle. |
| Intenta en unos segundos (TPS) | Ventana de velocidad | Espera y reintenta envío individual. |
| Fecha programada inválida | Hora pasada o < 1 min | Elige hora futura. |
| Sin destinatarios válidos | CSV vacío o contactos omitidos | Revisa agenda/import. |
| Envío ya procesándose | Doble clic / refresh | Espera; el idempotency key evita duplicados. |

Los errores aparecen como banner rojo en la parte superior de la página o en el modal de confirmación.

---

## 19. Soporte y configuración

### 19.1 Soporte

Ruta: **Soporte** → `/app/support`

- **Nuevo ticket** — categorías: Saldo SMS, API/Webhook, SMPP, facturación, etc.
- Email: `soporte@telvoice.cl`
- Responde en el hilo del ticket; puedes marcar como resuelto cuando cierre.

### 19.2 Configuración

Ruta: **Configuración** → `/app/settings`

Pestañas: **Empresa**, **Facturación**, **Seguridad**, **Notificaciones**, **Preferencias**.

### 19.3 API (envíos automatizados)

Ruta: **API** → `/app/api`

Para integraciones server-to-server: claves API, scopes, webhook DLR y documentación PDF. El panel web y la API comparten saldo y políticas de routing.

---

## 20. Resumen de rutas útiles

| Acción | Ruta |
|--------|------|
| Enviar SMS | `/app/send-sms` |
| Campaña masiva | `/app/send-sms` (modo masiva) |
| Programar envío | `/app/send-sms` (modo programado) |
| Nueva campaña (wizard) | `/app/campaigns/new?list_id=<uuid>` |
| Listado campañas | `/app/campaigns` |
| Detalle / lanzar live | `/app/campaigns/<id>` |
| Contactos | `/app/contacts` |
| Import CSV contactos | `/app/contacts/import` |
| Plantillas | `/app/templates` |
| Bandeja | `/app/inbox` |
| Reportes DLR | `/app/reports` |
| Saldo | `/app/wallet` |
| Comprar SMS | `/app/buy-sms` |
| Soporte | `/app/support` |

---

## Flujos rápidos (cheat sheet)

### Enviar OTP a un cliente

1. **Plantillas** → crear OTP activa con `{{codigo}}`.
2. **Enviar SMS** → **Desde plantilla** → elige plantilla y contacto.
3. **Enviar SMS** → confirma en bandeja.

### Promoción a una agenda

1. **Contactos** → importa o mantén agenda actualizada.
2. **Enviar SMS** → **Campaña masiva** → elige agenda.
3. Redacta mensaje → **Enviar campaña**.

### Recordatorio programado

1. **Enviar SMS** → **Envío programado**.
2. Agenda + mensaje + fecha/hora Chile.
3. **Programar envío**.

### Campaña grande con revisión previa

1. **Contactos** → copia UUID de agenda desde URL.
2. `/app/campaigns/new?list_id=<uuid>` → completa wizard.
3. **Guardar borrador** → detalle → **Enviar campaña real** + `ENVIAR`.

---

*Documento mantenido por el equipo Telvoice. Para cambios en políticas comerciales, TPS o límites de segmentos, consulta tu contrato o soporte.*
