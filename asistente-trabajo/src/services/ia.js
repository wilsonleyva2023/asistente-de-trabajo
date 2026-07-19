// "Cerebro" del asistente: conversa con Gemini usando herramientas (function calling).

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODELO = 'gemini-3.1-flash-lite';
const URL_API = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${GEMINI_API_KEY}`;

const INSTRUCCION_SISTEMA = `Sos el asistente personal de un técnico argentino que trabaja en plomería, gas, electricidad, aire acondicionado y cámaras de seguridad. Le hablás de tú/vos, en español rioplatense, tono cercano y directo, sin formalismos innecesarios.

Tu propósito: ayudarlo con la gestión diaria de su negocio — clientes, presupuestos, recibos, trabajos, equipos, agenda de visitas, cobros y notas.

REGLAS GENERALES:
- Priorizá usar una herramienta cuando el pedido encaje con alguna.
- Si falta un dato obligatorio, preguntalo antes de inventarlo.
- Si el pedido está relacionado con su trabajo/negocio pero no encaja con ninguna herramienta (dudas técnicas, cálculos, redactar un mensaje para un cliente), respondé vos directamente, breve y útil.
- Si te preguntan algo totalmente ajeno al trabajo (charla general, entretenimiento), respondé amablemente que sos su asistente de trabajo y redirigí a lo que sí podés hacer.

CLIENTES CON EL MISMO NOMBRE:
- Si hay varios con el mismo nombre, vas a recibir una lista con datos de cada uno (id, dirección, teléfono, deuda, último presupuesto). Preguntale al usuario cuál es usando esos datos específicos, no le muestres la lista en crudo.
- Una vez identificado, usá cliente_id en las siguientes acciones sobre ese cliente en la misma charla, no cliente_nombre.
- MANTENÉ EL FOCO: una vez que quedó claro de qué cliente se habla, seguí hablando de ESE MISMO en los mensajes siguientes, no lo mezcles con otro de nombre parecido. Solo cambiás si el usuario nombra a otro cliente explícitamente.
- Si el usuario corrige un dato mal cargado (ej: "es Berisso, no Berizo"), usá editar_cliente sobre el existente. NUNCA crees un cliente nuevo para una corrección.
- Cuando acciones sobre un presupuesto YA EXISTENTE (reenviar, editar, borrar, ítems), el sistema ya filtra a los clientes con presupuesto activo — no preguntes por los que no tienen.
- Las categorías de cliente las define el usuario libremente (no hay una lista fija) — usá exactamente la palabra que él use.
- Si el usuario no aclara de qué cliente habla en un mensaje (ej: "agregale el teléfono"), y en la charla reciente quedó claro de quién se trataba, asumí que sigue siendo ese mismo cliente.
- Antes de crear un cliente nuevo, si buscar_cliente (u otra búsqueda) encuentra a alguien con un nombre muy parecido, preguntale al usuario si es la misma persona antes de crear uno nuevo, para evitar duplicados.
- Para "mostrame a Fulano" sin más contexto, dá un resumen corto (2-3 líneas: contacto, deuda, último trabajo). Si el usuario pide "toda la ficha" o "el detalle completo", ahí sí mostrá todo.

PRESUPUESTOS:
- Pueden tener varios ítems. Si te dan varias cosas en un pedido, cargalas como ítems separados.
- Por defecto NO generes el PDF al crear/modificar — confirmá en texto con el detalle. Generá el PDF (generar_pdf=true) solo si el usuario lo pide explícitamente ("pdf", "documento", "mandámelo").
- Cuando el usuario cuente que un cliente aceptó, rechazó, o no decidió, usá cambiar_estado_presupuesto — si no, el sistema va a seguir sugiriendo recontactarlo aunque ya esté cerrado.
- crear_presupuesto ya genera automáticamente la deuda pendiente asociada, no hace falta un paso aparte.

RECIBOS: si falta concepto o monto, y el cliente tiene un presupuesto activo, usá sus datos automáticamente. Al generar un recibo, la deuda pendiente correspondiente se salda sola.

COBROS Y PAGOS (fluidez):
- Si el usuario dice que un cliente "pagó todo" o el monto coincide con lo pendiente, cerrá la deuda directo sin pedirle que confirme el monto de nuevo.
- No pidas confirmación para registrar un pago que el usuario ya te contó que pasó — la confirmación es solo para borrar cosas o para montos que parezcan un error de tipeo.
- Si no te aclaran de qué cobro hablan, asumí que es el más reciente del cliente activo de la charla.
- Cuando el usuario marque un trabajo como terminado (completar_visita), preguntale de una si ya le cobró, en la misma respuesta.
- Si te piden "cobrale y hacele el recibo" en un mismo pedido, encadená las dos herramientas vos mismo, no le pidas que lo repita en dos mensajes.

TRABAJOS: registrar_trabajo puede incluir el gasto real en materiales (para saber la ganancia neta) y queda con garantía de 90 días por defecto (se puede cambiar).

EQUIPOS: no son solo aires acondicionados — pueden ser termotanques, bombas de agua, calefones, cámaras de seguridad, o cualquier otro. Al registrar uno, si el usuario no menciona mantenimiento, cargalo simple sin insistir en preguntarlo. Mantené el foco en el último equipo del que se habló (equipo activo), igual que con clientes/presupuestos/visitas. Si un cliente ya tiene un equipo muy parecido (mismo tipo), preguntale si es una actualización del mismo antes de cargar uno nuevo duplicado.

NOTAS: guardalas directo con lo que el usuario diga, sin pedir título ni categoría si no las da — asigná categoría sola si es evidente por el contenido (ej: mencionar "comprar" → categoría "compras"). Reconocé que algo es una nota aunque no se use la palabra "nota" o "anotá" explícitamente, si por el contexto es claramente algo para guardar y recordar después (una lista, un dato suelto). Si el usuario está hablando de una visita o un cliente puntual en la charla, ligá la nota a eso automáticamente sin preguntar. Mantené el foco en la última nota mencionada (nota activa) para poder editarla/completarla sin que la tengan que describir de nuevo. La confirmación al guardar una nota debe ser cortita (ej: "Guardado ✅"), sin explicaciones de más. listar_notas y buscar_nota no muestran las completadas por defecto — si el usuario quiere verlas, pasá incluir_completadas=true.

REPORTES Y NEGOCIO:
- Reconocé preguntas casuales como "¿cómo ando?", "¿cómo viene el mes?", "¿cómo va mi negocio?" como pedidos de reporte, no hace falta que usen la palabra "reporte".
- Si la pregunta es amplia y no específica, usá consultar_negocio_completo en vez de hacerle elegir entre varios reportes.
- Por defecto, respondé en texto corto y directo (3-5 líneas con lo esencial). Generá PDF solo si el usuario lo pide explícitamente ("mandámelo en pdf", "expórtalo").
- Cuando dés una comparación entre períodos, acompañá el número con una palabra clara (mejor, peor, similar), no solo el porcentaje.
- Priorizá mostrar primero cualquier alerta relevante (deudas viejas, presupuestos por vencer) antes que los números generales, si hay algo urgente.
- Reconocé períodos hablados naturalmente ("el mes pasado", "este trimestre", "este año") calculando vos la fecha correspondiente.
- Mantené el foco en qué tipo de reporte se está hablando en la charla (reporte activo), para entender preguntas de seguimiento como "¿y el mes pasado?" sin que reformulen todo.

FOTOS, AUDIO Y DOCUMENTOS:
- Si el usuario manda una foto/audio/documento sin instrucción clara, decidí vos qué hacer según el contexto reciente de la charla (si se estaba hablando de un cliente puntual, es lo más probable que sea para él) — no preguntes "¿qué hago con esto?" salvo que sea genuinamente ambiguo.
- Si una foto es claramente un ticket o comprobante de compra, leé el monto vos mismo de la imagen y usá registrar_gasto_desde_ticket, sin pedirle al usuario que te dicte el número.
- Si una foto muestra la chapita/etiqueta de un equipo con marca, modelo o número de serie visible, leelos vos y usá editar_equipo para cargarlos, en vez de preguntarle al usuario.
- Si es un documento largo, dale un resumen de 2-3 líneas con lo más importante, no le repitas todo el texto.
- La confirmación al guardar una foto/audio/documento debe ser cortita, sin explicaciones de más.

AGENDA Y VISITAS (agendar_trabajo, no crear_recordatorio, cuando sea una visita a un cliente en fecha/hora concretas):
- Al agendar, preguntá o asumí un aviso previo razonable (ej: 2 horas antes) si el usuario no lo aclara, pero dejá que él lo elija si quiere ("avisame el día anterior", "avisame 3 horas antes").
- Cuando el usuario diga que terminó un trabajo agendado, usá completar_visita — y ofrecele registrar el trabajo realizado y/o generar el recibo en el mismo intercambio.
- Cuando diga que tiene que volver otro día, usá reagendar_visita con la nueva fecha.
- consultar_agenda acepta un rango: "hoy", "manana", o "semana". Si no aclara, asumí "hoy".
- Si el usuario pregunta por un día puntual que no es "hoy" ni "mañana" (ej: "el jueves", "el 25 de julio", "el lunes que viene"), calculá vos la fecha real usando la fecha de hoy como referencia, y pasala como fecha_iso en formato YYYY-MM-DD a consultar_agenda o consultar_recordatorios.
- consultar_agenda y consultar_recordatorios te devuelven los datos en crudo (no los mandan al chat ellos solos) — con esos datos armá VOS la respuesta final, organizada por día, clara y fácil de leer, mencionando el presupuesto de cada visita si lo tiene, y la dirección si dos visitas del mismo día quedan en zonas muy distintas (avisale al usuario para que lo tenga en cuenta, sin calcular distancia exacta). Si el usuario no aclaró el rango, o pide "mi agenda" en general, usá "semana" por defecto (no "hoy"), y llamá tanto a consultar_agenda como a consultar_recordatorios para no dejar nada afuera.
- Al usar agendar_trabajo, si el resultado indica que ese día ya tiene varias visitas (4 o más), avisale al usuario que el día está cargado.
- Si el usuario pide algo relacionado con el presupuesto activo (agregarle, sacarle, mandarlo en pdf) sin repetir el nombre del cliente, asumí que se refiere al último presupuesto del que se habló en la charla.
- Si el usuario te da TODOS los datos de un presupuesto en un solo mensaje (cliente, ítems, y si quiere el pdf), hacelo todo junto sin preguntar de a un dato por vez.
- Un mensaje de audio largo con todos los datos también se procesa todo junto, igual que el texto.
- No pidas confirmación para cambios chicos y reversibles (agregar un ítem, corregir un monto). Pedí confirmación SOLO para borrar algo o para cambios grandes.
- Si el usuario menciona que cobró algo, aunque no diga la palabra "recibo", interpretalo como que quiere generar un recibo (usá crear_recibo).
- Si te pegan una respuesta que parece ser de un cliente aceptando (ej: "dale, acepto", "va bien", "dale dale"), interpretalo como que ese cliente aceptó su presupuesto activo, y usá cambiar_estado_presupuesto.
- Si el usuario pide deshacer lo último que hizo, usá deshacer_ultima_accion.
- El modo rápido (activar_modo_rapido) hace que, mientras esté activo, tus confirmaciones sean de una sola línea corta, sin explicaciones extra — mantenelo así hasta que lo desactiven.
- Usá consultar_dias_libres si el usuario pregunta qué día tiene libre para ofrecerle a un cliente nuevo.
- Usá contar_visitas_cliente si preguntan si un cliente es frecuente o cuántas veces lo visitaron.
- Usá consultar_reagendados_frecuentes si preguntan por clientes problemáticos con la agenda.
- Antes de agendar, si hay otra visita muy cerca en el horario, el sistema te va a avisar del choque — contáselo al usuario y preguntale si sigue igual o cambia el horario. Lo mismo si choca con un horario bloqueado propio del usuario.
- Cuando agendás una visita, si el resultado indica que el cliente tiene una deuda pendiente o un mantenimiento próximo, comentáselo al usuario en la misma respuesta (ej: "Che, de paso Roberto te debe $20.000, aprovechá para cobrarle" o "tiene un mantenimiento de aire próximo, ¿lo sumamos a la misma visita?").
- Cuando el usuario marque una visita como completada, en la misma conversación ofrecele (sin que tenga que pedirlo aparte) registrar el trabajo, cobrar, y preguntar si quedó conforme — no hace falta esperar tres mensajes separados.
- Mantené el foco en la última visita de la que se habló en la charla (visita activa), igual que con el cliente/presupuesto/cobro.
- Cuando el usuario reagende o cancele una visita, ofrecele de una un mensaje pre-armado para avisarle al cliente del cambio.
- Si el usuario pide agendar sin dar una hora exacta ("agendame a Roberto esta semana"), usá consultar_dias_libres primero para sugerirle un hueco disponible en vez de preguntarle cuál hora quiere a ciegas.
- Si un mensaje trae varias instrucciones relacionadas a la misma visita (ej: hora + qué llevar), cargalas todas juntas en la misma llamada a agendar_trabajo.

RECORDATORIOS: para avisos generales que NO son una visita a un cliente (ej: "recordame pagar el monotributo", "ir al doctor"). Se pueden editar y eliminar buscando por el texto, y consultar por rango con consultar_recordatorios.
- MUY IMPORTANTE: cuando el usuario pregunte de forma general "qué tengo hoy/mañana/esta semana" o "mi agenda", sin aclarar si se refiere solo a trabajos con clientes, llamá TANTO a consultar_agenda COMO a consultar_recordatorios con el mismo rango, para no dejar afuera nada de lo que agendó (visitas a clientes Y recordatorios sueltos). Se muestran en mensajes separados, no hace falta mezclarlos en un solo texto.

BORRAR: TEMPORAL VS. DEFINITIVO:
- Por defecto, borrar es TEMPORAL (se archiva, se puede restaurar). Solo permanente=true si el usuario lo pide explícitamente ("para siempre", "definitivamente").
- SIEMPRE pedí confirmación antes de borrar, esperando la respuesta del usuario en el mensaje siguiente. Si es definitivo, remarcá que no tiene vuelta atrás.
- Los borrados nunca aparecen en consultas normales. Para verlos, hay que pedirlo explícitamente (listar_presupuestos_archivados).

REPORTES: generar_extracto_cliente (historial completo de plata de un cliente), generar_bitacora (diario de trabajos de un mes), consultar_reporte_mensual (números del negocio).

Si te preguntan qué podés hacer, respondé de forma natural agrupando por categorías con ejemplos concretos, no como lista de comandos. Si piden "dame un ejemplo", inventá uno concreto aclarando que es de ejemplo. Si mandan foto/audio/documento, interpretalo y actuá según corresponda.

FORMATO DE RESPUESTAS (Telegram, sin markdown):
- Nunca uses ** para negrita ni _ para cursiva, se ven como asteriscos sueltos.
- Para listas, usá • al principio de cada línea.
- Usá emojis con moderación para dar vida y ordenar visualmente (✅ 📋 💰 📅 🔧 ⚠️ 📝), sin exagerar.
- Escribí como en WhatsApp: frases cortas, párrafos breves, natural.

Fecha y hora actuales: ${new Date().toISOString()}`;

const ITEM_SCHEMA = { type: 'OBJECT', properties: { descripcion: { type: 'STRING' }, monto: { type: 'NUMBER' } }, required: ['descripcion', 'monto'] };
const CID = { type: 'STRING', description: 'ID exacto del cliente si ya se identificó en esta charla (evita ambigüedad).' };
const CNOM = { type: 'STRING' };

const HERRAMIENTAS = [
  {
    functionDeclarations: [
      // ---- CLIENTES ----
      {
        name: 'buscar_cliente',
        description: 'Busca un cliente (por nombre o apodo) y muestra su ficha completa.',
        parameters: { type: 'OBJECT', properties: { nombre: { type: 'STRING' } }, required: ['nombre'] },
      },
      {
        name: 'crear_cliente',
        description: 'Da de alta un cliente nuevo. Alcanza con el nombre, el resto es opcional y se puede completar después.',
        parameters: {
          type: 'OBJECT',
          properties: {
            nombre: { type: 'STRING' },
            telefono: { type: 'STRING' },
            direccion: { type: 'STRING' },
            notas: { type: 'STRING' },
            apodo: { type: 'STRING', description: 'Referencia para distinguirlo si hay otro con el mismo nombre.' },
            referido_por: { type: 'STRING', description: 'Quién lo recomendó, si el usuario lo menciona.' },
            categoria: { type: 'STRING', description: 'Categoría libre que el usuario defina (ej: arquitecto, administrador de consorcio, comercio, cliente pudiente).' },
            cumpleanos_iso: { type: 'STRING', description: 'Fecha de cumpleaños en formato YYYY-MM-DD, si la menciona.' },
            horario_preferido: { type: 'STRING' },
            relacion: { type: 'STRING', description: 'Relación con otro cliente si la menciona (ej: "padre de Jennifer").' },
            descuento_habitual: { type: 'NUMBER', description: 'Porcentaje de descuento habitual, si lo menciona.' },
            contacto_secundario: { type: 'STRING', description: 'Otro contacto del mismo cliente (ej: encargado, familiar), nombre y teléfono.' },
          },
          required: ['nombre'],
        },
      },
      {
        name: 'editar_cliente',
        description: 'Corrige o completa datos de un cliente ya cargado, incluyendo categoría, prioridad, bloqueo, cumpleaños, etc.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: CID,
            cliente_nombre: CNOM,
            nuevo_nombre: { type: 'STRING' },
            nuevo_telefono: { type: 'STRING' },
            nueva_direccion: { type: 'STRING' },
            nuevo_apodo: { type: 'STRING' },
            nuevas_notas: { type: 'STRING' },
            nueva_categoria: { type: 'STRING' },
            prioritario: { type: 'BOOLEAN', description: 'true para marcarlo como cliente VIP/de confianza.' },
            bloqueado: { type: 'BOOLEAN', description: 'true para marcarlo como "no volver a atender".' },
            cumpleanos_iso: { type: 'STRING' },
            nuevo_horario_preferido: { type: 'STRING' },
            nueva_relacion: { type: 'STRING' },
            nuevo_descuento_habitual: { type: 'NUMBER' },
            nuevo_contacto_secundario: { type: 'STRING' },
          },
          required: ['cliente_nombre'],
        },
      },
      {
        name: 'eliminar_cliente',
        description: 'Borra un cliente completo. SOLO tras confirmación explícita.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM, permanente: { type: 'BOOLEAN' } }, required: ['cliente_nombre'] },
      },
      {
        name: 'restaurar_cliente',
        description: 'Recupera el último cliente borrado temporalmente que coincida con el nombre.',
        parameters: { type: 'OBJECT', properties: { cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      {
        name: 'buscar_clientes_por_categoria',
        description: 'Lista los clientes de una categoría (la que el usuario haya definido, ej: arquitectos, comercios).',
        parameters: { type: 'OBJECT', properties: { categoria: { type: 'STRING' } }, required: ['categoria'] },
      },
      {
        name: 'buscar_cliente_por_telefono',
        description: 'Busca qué cliente corresponde a un número de teléfono.',
        parameters: { type: 'OBJECT', properties: { telefono: { type: 'STRING' } }, required: ['telefono'] },
      },
      {
        name: 'listar_clientes_recientes',
        description: 'Lista los clientes más recientes/activos, para acceso rápido sin buscar por nombre.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'combinar_clientes',
        description: 'Une dos clientes duplicados en uno solo (todo el historial del segundo pasa al primero, y el segundo queda borrado).',
        parameters: {
          type: 'OBJECT',
          properties: { nombre_a_conservar: { type: 'STRING' }, nombre_a_fusionar: { type: 'STRING' } },
          required: ['nombre_a_conservar', 'nombre_a_fusionar'],
        },
      },
      {
        name: 'agregar_direccion_cliente',
        description: 'Agrega una dirección adicional a un cliente que tiene más de un lugar (ej: local, depósito).',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_id: CID, cliente_nombre: CNOM, etiqueta: { type: 'STRING' }, direccion: { type: 'STRING' } },
          required: ['cliente_nombre', 'direccion'],
        },
      },
      {
        name: 'registrar_satisfaccion',
        description: 'Registra si el cliente quedó conforme con el último trabajo realizado.',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_id: CID, cliente_nombre: CNOM, satisfaccion: { type: 'STRING', description: "'conforme', 'neutral' o 'disconforme'." } },
          required: ['cliente_nombre', 'satisfaccion'],
        },
      },
      {
        name: 'consultar_clientes_en_silencio',
        description: 'Lista clientes sin contacto hace varios meses, para retomarlos.',
        parameters: { type: 'OBJECT', properties: { meses: { type: 'NUMBER' } } },
      },
      {
        name: 'consultar_rechazados_para_reintentar',
        description: 'Lista presupuestos rechazados hace tiempo, que podría valer la pena reofrecer.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'consultar_trabajos_repetidos',
        description: 'Dice si un cliente tuvo trabajos parecidos repetidos en los últimos meses (posible problema de fondo).',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },

      // ---- PRESUPUESTOS ----
      {
        name: 'crear_presupuesto',
        description: 'Crea un presupuesto (con ítems) para un cliente. Por defecto NO genera PDF, solo confirma en texto.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: CID,
            cliente_nombre: CNOM,
            items: { type: 'ARRAY', items: ITEM_SCHEMA },
            generar_pdf: { type: 'BOOLEAN' },
            dias_validez: { type: 'NUMBER', description: 'Días de validez del presupuesto, si el usuario pide algo distinto a 15.' },
            direccion_trabajo: { type: 'STRING' },
            alcance_texto: { type: 'STRING' },
            incluir_alcance: { type: 'BOOLEAN' },
            garantia_texto: { type: 'STRING' },
            incluir_garantia: { type: 'BOOLEAN' },
            forma_pago_texto: { type: 'STRING' },
            incluir_forma_pago: { type: 'BOOLEAN' },
          },
          required: ['cliente_nombre', 'items'],
        },
      },
      {
        name: 'agregar_items_presupuesto',
        description: 'Agrega ítems al presupuesto activo de un cliente.',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_id: CID, cliente_nombre: CNOM, items: { type: 'ARRAY', items: ITEM_SCHEMA }, generar_pdf: { type: 'BOOLEAN' } },
          required: ['cliente_nombre', 'items'],
        },
      },
      {
        name: 'quitar_items_presupuesto',
        description: 'Saca ítems puntuales del presupuesto activo de un cliente.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: CID,
            cliente_nombre: CNOM,
            descripciones_items: { type: 'ARRAY', items: { type: 'STRING' } },
            permanente: { type: 'BOOLEAN' },
            generar_pdf: { type: 'BOOLEAN' },
          },
          required: ['cliente_nombre', 'descripciones_items'],
        },
      },
      {
        name: 'editar_presupuesto',
        description: 'Corrige el monto total y/o descripción general del presupuesto activo (cambios simples, no por ítem).',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_id: CID, cliente_nombre: CNOM, nuevo_monto: { type: 'NUMBER' }, nueva_descripcion: { type: 'STRING' } },
          required: ['cliente_nombre'],
        },
      },
      {
        name: 'cambiar_estado_presupuesto',
        description: "Marca el presupuesto activo como 'aceptado', 'rechazado' o 'no_concretado'.",
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM, estado: { type: 'STRING' } }, required: ['cliente_nombre', 'estado'] },
      },
      {
        name: 'reenviar_presupuesto',
        description: 'Vuelve a generar y enviar el PDF del presupuesto activo.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: CID,
            cliente_nombre: CNOM,
            direccion_trabajo: { type: 'STRING' },
            alcance_texto: { type: 'STRING' },
            incluir_alcance: { type: 'BOOLEAN' },
            garantia_texto: { type: 'STRING' },
            incluir_garantia: { type: 'BOOLEAN' },
            forma_pago_texto: { type: 'STRING' },
            incluir_forma_pago: { type: 'BOOLEAN' },
          },
          required: ['cliente_nombre'],
        },
      },
      {
        name: 'eliminar_presupuesto',
        description: 'Borra el presupuesto activo de un cliente. SOLO tras confirmación.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM, permanente: { type: 'BOOLEAN' } }, required: ['cliente_nombre'] },
      },
      {
        name: 'restaurar_presupuesto',
        description: 'Recupera el último presupuesto borrado temporalmente de un cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      {
        name: 'listar_presupuestos',
        description: 'Lista TODOS los presupuestos activos guardados (de cualquier cliente y estado), no solo los que hay que recontactar.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'listar_presupuestos_archivados',
        description: 'Lista los presupuestos borrados temporalmente. Solo si el usuario lo pide explícitamente.',
        parameters: { type: 'OBJECT', properties: {} },
      },

      {
        name: 'guardar_plantilla_presupuesto',
        description: 'Guarda un presupuesto (o sus ítems) como plantilla reutilizable con un nombre.',
        parameters: { type: 'OBJECT', properties: { nombre_plantilla: { type: 'STRING' }, items: { type: 'ARRAY', items: ITEM_SCHEMA } }, required: ['nombre_plantilla', 'items'] },
      },
      {
        name: 'crear_presupuesto_desde_plantilla',
        description: 'Crea un presupuesto para un cliente usando una plantilla guardada.',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_id: CID, cliente_nombre: CNOM, nombre_plantilla: { type: 'STRING' }, generar_pdf: { type: 'BOOLEAN' } },
          required: ['cliente_nombre', 'nombre_plantilla'],
        },
      },
      {
        name: 'repetir_presupuesto',
        description: 'Crea un presupuesto nuevo para un cliente, usando como base su último presupuesto (mismos ítems, con los cambios que pida el usuario).',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: CID,
            cliente_nombre: CNOM,
            nuevo_monto_total: { type: 'NUMBER', description: 'Si el usuario pide un monto total distinto, en vez de mantener los montos originales.' },
            generar_pdf: { type: 'BOOLEAN' },
          },
          required: ['cliente_nombre'],
        },
      },
      {
        name: 'crear_presupuestos_lote',
        description: 'Crea el mismo presupuesto (mismos ítems) para varios clientes distintos en un solo pedido.',
        parameters: {
          type: 'OBJECT',
          properties: { nombres_clientes: { type: 'ARRAY', items: { type: 'STRING' } }, items: { type: 'ARRAY', items: ITEM_SCHEMA } },
          required: ['nombres_clientes', 'items'],
        },
      },
      {
        name: 'deshacer_ultima_accion',
        description: 'Deshace la última acción de crear/editar/borrar que se hizo en esta charla, si es posible.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'contar_presupuestos_hoy',
        description: 'Dice cuántos presupuestos y recibos se generaron hoy.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'consultar_historial_presupuesto',
        description: 'Muestra el historial de cambios (creación, ítems agregados/quitados, cambios de estado) del presupuesto activo de un cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      {
        name: 'exportar_mes_presupuestos',
        description: "Genera un PDF con todos los presupuestos/recibos de un mes. mes_iso formato 'YYYY-MM', si no se da usa el mes actual.",
        parameters: { type: 'OBJECT', properties: { mes_iso: { type: 'STRING' } } },
      },
      {
        name: 'guardar_foto',
        description: 'Guarda la última foto adjunta ligada a un cliente y/o a su presupuesto activo (queda disponible para siempre). Si el usuario menciona que es de "antes", "después", "firma" o "ticket/comprobante", asignale esa etiqueta.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: CID,
            cliente_nombre: CNOM,
            descripcion: { type: 'STRING' },
            etiqueta: { type: 'STRING', description: "'antes', 'despues', 'firma', 'ticket', o vacío si es general." },
          },
          required: ['cliente_nombre'],
        },
      },
      {
        name: 'ver_fotos_cliente',
        description: 'Muestra la galería de fotos guardadas de un cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      {
        name: 'guardar_documento_cliente',
        description: 'Guarda el último documento adjunto (PDF, etc.) de forma permanente, ligado a un cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM, resumen: { type: 'STRING', description: 'Resumen corto de qué es el documento.' } }, required: ['cliente_nombre'] },
      },
      {
        name: 'guardar_audio_nota',
        description: 'Guarda el último audio recibido (el archivo original, no solo su transcripción) ligado a un cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      {
        name: 'registrar_gasto_desde_ticket',
        description: 'Cuando el usuario manda la foto de un ticket/factura y pide anotar el gasto, extraé vos el monto de la imagen y registralo como gasto de materiales del último trabajo del cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM, monto: { type: 'NUMBER', description: 'Monto que leíste en la foto del ticket.' } }, required: ['cliente_nombre', 'monto'] },
      },
      {
        name: 'listar_archivos_recientes',
        description: 'Lista las últimas fotos guardadas en general.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'consultar_rentabilidad',
        description: 'Dice cuánto ganó realmente en el último trabajo de un cliente (cobrado menos gasto en materiales).',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      {
        name: 'consultar_tasa_conversion',
        description: 'Dice qué porcentaje de los presupuestos de un mes se convirtieron en trabajo aceptado.',
        parameters: { type: 'OBJECT', properties: { mes_iso: { type: 'STRING' } } },
      },
      {
        name: 'activar_modo_rapido',
        description: 'Activa o desactiva el modo rápido (respuestas más cortas, con menos explicación) para esta charla.',
        parameters: { type: 'OBJECT', properties: { activar: { type: 'BOOLEAN' } }, required: ['activar'] },
      },

      // ---- RECIBOS ----
      {
        name: 'crear_recibo',
        description: 'Genera un recibo de pago en PDF. Si falta concepto/monto, usa el presupuesto activo del cliente. Salda (o reduce) la deuda asociada.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: CID,
            cliente_nombre: CNOM,
            concepto: { type: 'STRING' },
            monto: { type: 'NUMBER' },
            es_pago_parcial: { type: 'BOOLEAN', description: 'true si el monto es solo una parte de lo que debe, no el total.' },
          },
          required: ['cliente_nombre'],
        },
      },

      // ---- COBROS / DEUDAS ----
      { name: 'consultar_pendientes', description: 'Muestra los cobros pendientes.', parameters: { type: 'OBJECT', properties: {} } },
      {
        name: 'registrar_pago_parcial',
        description: 'Registra un pago (parcial o completo) sobre la deuda pendiente de un cliente. Si el monto coincide con lo pendiente, la deuda queda saldada sola.',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_id: CID, cliente_nombre: CNOM, monto: { type: 'NUMBER' }, metodo_pago: { type: 'STRING', description: "'efectivo', 'transferencia', 'tarjeta', etc." } },
          required: ['cliente_nombre', 'monto'],
        },
      },
      {
        name: 'eliminar_cobro',
        description: 'Borra una deuda de un cliente. SOLO tras confirmación.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM, permanente: { type: 'BOOLEAN' } }, required: ['cliente_nombre'] },
      },
      {
        name: 'restaurar_cobro',
        description: 'Recupera la última deuda borrada temporalmente de un cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      {
        name: 'consultar_historial_pagos',
        description: 'Muestra todos los pagos que hizo un cliente históricamente (no solo la deuda activa).',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      {
        name: 'crear_plan_cuotas',
        description: 'Divide la deuda activa de un cliente en cuotas mensuales.',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_id: CID, cliente_nombre: CNOM, cantidad_cuotas: { type: 'NUMBER' }, primera_fecha_iso: { type: 'STRING' } },
          required: ['cliente_nombre', 'cantidad_cuotas'],
        },
      },
      {
        name: 'pagar_cuota',
        description: 'Marca como pagada una cuota puntual del plan de pagos de un cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM, numero_cuota: { type: 'NUMBER' } }, required: ['cliente_nombre', 'numero_cuota'] },
      },
      {
        name: 'aplicar_recargo',
        description: 'Aplica un recargo porcentual a la deuda vencida de un cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM, porcentaje: { type: 'NUMBER' } }, required: ['cliente_nombre', 'porcentaje'] },
      },
      {
        name: 'aplicar_descuento_pronto_pago',
        description: 'Ofrece un descuento si el cliente paga antes de una fecha.',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_id: CID, cliente_nombre: CNOM, porcentaje: { type: 'NUMBER' }, fecha_limite_iso: { type: 'STRING' } },
          required: ['cliente_nombre', 'porcentaje', 'fecha_limite_iso'],
        },
      },
      {
        name: 'guardar_comprobante_pago',
        description: 'Guarda la foto de un comprobante de pago (transferencia, etc.) ligada a la deuda activa de un cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      {
        name: 'consultar_deudas_por_antiguedad',
        description: 'Agrupa las deudas pendientes por qué tan vencidas están (recientes, 30+, 60+ días), para priorizar el reclamo.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'consultar_estado_caja',
        description: 'Da un resumen financiero completo de un vistazo: pendiente total, cobrado hoy, y proyección de ingresos.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'consultar_reporte_metodo_pago',
        description: "Muestra cuánto cobraste por cada método de pago (efectivo, transferencia, etc.) en un período. mes_iso formato 'YYYY-MM', si no se da usa el mes actual.",
        parameters: { type: 'OBJECT', properties: { mes_iso: { type: 'STRING' } } },
      },
      {
        name: 'generar_mensaje_reclamo',
        description: 'Genera un mensaje pre-armado y respetuoso para reclamarle a un cliente una deuda vencida.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      {
        name: 'exportar_cobros_mes',
        description: "Genera un documento con el resumen de cobros de un mes, listo para el contador/monotributo. mes_iso formato 'YYYY-MM'.",
        parameters: { type: 'OBJECT', properties: { mes_iso: { type: 'STRING' } } },
      },
      {
        name: 'consultar_puntualidad_cliente',
        description: 'Dice qué tan puntual es un cliente pagando (cuántas veces pagó a tiempo vs. tarde).',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      { name: 'consultar_recontactar', description: 'Presupuestos sin cerrar para recontactar al cliente.', parameters: { type: 'OBJECT', properties: {} } },

      // ---- TRABAJOS ----
      {
        name: 'registrar_trabajo',
        description: 'Registra un trabajo realizado para un cliente.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: CID,
            cliente_nombre: CNOM,
            descripcion: { type: 'STRING' },
            gasto_materiales: { type: 'NUMBER', description: 'Cuánto gastó el técnico en materiales, si lo menciona.' },
            garantia_dias: { type: 'NUMBER', description: 'Días de garantía si el usuario especifica uno distinto a 90.' },
          },
          required: ['cliente_nombre', 'descripcion'],
        },
      },
      {
        name: 'editar_trabajo',
        description: 'Corrige el último trabajo registrado de un cliente.',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_id: CID, cliente_nombre: CNOM, nueva_descripcion: { type: 'STRING' }, nuevo_gasto_materiales: { type: 'NUMBER' } },
          required: ['cliente_nombre'],
        },
      },
      {
        name: 'eliminar_trabajo',
        description: 'Borra el último trabajo registrado de un cliente. SOLO tras confirmación.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },

      // ---- EQUIPOS ----
      {
        name: 'registrar_equipo',
        description: 'Registra un equipo instalado (termotanque, split de aire, bomba, calefón, cámara, o cualquier otro) y programa mantenimiento futuro recurrente si corresponde. No pidas mantenimiento si el usuario no lo menciona, se puede cargar simple.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: CID,
            cliente_nombre: CNOM,
            tipo: { type: 'STRING', description: 'Tipo de equipo: termotanque, split de aire, bomba de agua, calefón, cámara de seguridad, etc.' },
            marca: { type: 'STRING' },
            modelo: { type: 'STRING' },
            numero_serie: { type: 'STRING' },
            meses_mantenimiento: { type: 'NUMBER' },
            aviso_automatico: { type: 'BOOLEAN' },
            garantia_fabrica_meses: { type: 'NUMBER' },
            vida_util_anios: { type: 'NUMBER' },
          },
          required: ['cliente_nombre', 'tipo'],
        },
      },
      {
        name: 'editar_equipo',
        description: 'Corrige datos de un equipo ya cargado (marca, modelo, tipo, etc).',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: CID,
            cliente_nombre: CNOM,
            equipo_texto: { type: 'STRING', description: 'Tipo o marca del equipo a editar, si el cliente tiene varios.' },
            nuevo_tipo: { type: 'STRING' },
            nueva_marca: { type: 'STRING' },
            nuevo_modelo: { type: 'STRING' },
            nuevo_numero_serie: { type: 'STRING' },
            nuevos_repuestos_necesarios: { type: 'STRING' },
          },
          required: ['cliente_nombre'],
        },
      },
      {
        name: 'consultar_equipos_cliente',
        description: 'Lista todos los equipos instalados de un cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      {
        name: 'consultar_historial_mantenimientos',
        description: 'Muestra los mantenimientos ya realizados a un equipo de un cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM, equipo_texto: { type: 'STRING' } }, required: ['cliente_nombre'] },
      },
      {
        name: 'consultar_mantenimientos_vencidos',
        description: 'Lista mantenimientos que ya vencieron hace tiempo y todavía no se hicieron.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'consultar_estadistica_equipos',
        description: 'Cuenta cuántos equipos de cada tipo instalaste en total.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'consultar_equipos_para_reemplazo',
        description: 'Lista equipos que se acercan al fin de su vida útil estimada.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'generar_ficha_equipo',
        description: 'Genera un PDF con la ficha técnica de un equipo de un cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM, equipo_texto: { type: 'STRING' } }, required: ['cliente_nombre'] },
      },
      {
        name: 'registrar_mantenimiento_realizado',
        description: 'Registra que se hizo el mantenimiento de un equipo, con el gasto en repuestos si corresponde, y reprograma la próxima fecha.',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_id: CID, cliente_nombre: CNOM, equipo_texto: { type: 'STRING' }, gasto_repuestos: { type: 'NUMBER' }, descripcion: { type: 'STRING' } },
          required: ['cliente_nombre'],
        },
      },
      {
        name: 'anotar_repuestos_necesarios',
        description: 'Anota qué repuestos se van a necesitar para el próximo mantenimiento de un equipo.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM, equipo_texto: { type: 'STRING' }, repuestos: { type: 'STRING' } }, required: ['cliente_nombre', 'repuestos'] },
      },
      {
        name: 'consultar_mantenimientos_agrupables',
        description: 'Lista clientes con varios equipos cuyo mantenimiento vence cerca en el tiempo, para agruparlos en una sola visita.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'eliminar_equipo',
        description: 'Da de baja un equipo (deja de generar avisos de mantenimiento). SOLO tras confirmación.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM, tipo: { type: 'STRING' } }, required: ['cliente_nombre', 'tipo'] },
      },

      // ---- AGENDA / VISITAS ----
      {
        name: 'agendar_trabajo',
        description: 'Agenda una visita a un cliente en fecha y hora concretas, con aviso previo. Antes de agendar, si el cliente tiene una deuda pendiente o un mantenimiento próximo, se te va a avisar para que se lo comentes al usuario.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: CID,
            cliente_nombre: CNOM,
            descripcion: { type: 'STRING' },
            fecha_hora_iso: { type: 'STRING' },
            aviso_horas_antes: { type: 'NUMBER', description: 'Cuántas horas antes avisar (24 = un día antes).' },
            que_llevar: { type: 'STRING', description: 'Herramientas o materiales a llevar, si el usuario lo menciona.' },
            duracion_minutos: { type: 'NUMBER', description: 'Cuánto va a durar la visita, si el usuario lo menciona (por defecto 60).' },
            recurrencia_meses: { type: 'NUMBER', description: 'Si la visita se repite cada tantos meses, poné el número (ej: 3 para trimestral).' },
          },
          required: ['cliente_nombre', 'descripcion', 'fecha_hora_iso'],
        },
      },
      {
        name: 'completar_visita',
        description: 'Marca como terminada la próxima visita agendada de un cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      {
        name: 'reagendar_visita',
        description: 'Cambia la fecha/hora de la próxima visita agendada de un cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM, nueva_fecha_hora_iso: { type: 'STRING' } }, required: ['cliente_nombre', 'nueva_fecha_hora_iso'] },
      },
      {
        name: 'cancelar_visita',
        description: 'Cancela la próxima visita agendada de un cliente (sin reagendar).',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM, motivo: { type: 'STRING' } }, required: ['cliente_nombre'] },
      },
      {
        name: 'confirmar_visita',
        description: 'Marca que el cliente confirmó explícitamente que va a estar en la visita agendada.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      {
        name: 'consultar_agenda',
        description: "Muestra la agenda de visitas. Usá rango ('hoy', 'manana', 'semana', 'mes') para períodos relativos, o fecha_iso ('YYYY-MM-DD') para un día puntual calculando la fecha real vos mismo.",
        parameters: { type: 'OBJECT', properties: { rango: { type: 'STRING' }, fecha_iso: { type: 'STRING' } } },
      },
      {
        name: 'consultar_dias_libres',
        description: 'Muestra qué días de la semana (o rango pedido) no tienen ninguna visita agendada.',
        parameters: { type: 'OBJECT', properties: { rango: { type: 'STRING' } } },
      },
      {
        name: 'consultar_reagendados_frecuentes',
        description: 'Muestra clientes que reagendaron su visita 2 o más veces (para detectar patrones).',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'contar_visitas_cliente',
        description: 'Dice cuántas veces se visitó a un cliente en el último año (para saber si es frecuente).',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      {
        name: 'generar_agenda_pdf',
        description: "Genera un PDF con la agenda de un rango ('semana' por defecto). También sirve como calendario mensual si rango='mes'.",
        parameters: { type: 'OBJECT', properties: { rango: { type: 'STRING' } } },
      },
      {
        name: 'exportar_agenda_calendario',
        description: 'Exporta la agenda de un rango en formato .ics para importar a Google Calendar u otro calendario.',
        parameters: { type: 'OBJECT', properties: { rango: { type: 'STRING' } } },
      },
      {
        name: 'consultar_historial_visitas',
        description: 'Muestra el historial detallado de visitas pasadas a un cliente, con fechas.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      {
        name: 'bloquear_horario',
        description: 'Bloquea un horario fijo propio (ej: almuerzo) para que el sistema avise si intentan agendar algo ahí.',
        parameters: {
          type: 'OBJECT',
          properties: { hora_inicio: { type: 'STRING', description: "Formato HH:MM" }, hora_fin: { type: 'STRING' }, descripcion: { type: 'STRING' } },
          required: ['hora_inicio', 'hora_fin'],
        },
      },
      {
        name: 'consultar_horas_trabajadas',
        description: "Suma las horas trabajadas (visitas completadas) en un rango. rango: 'semana' (defecto) o 'mes'.",
        parameters: { type: 'OBJECT', properties: { rango: { type: 'STRING' } } },
      },
      {
        name: 'consultar_resumen_dia',
        description: 'Da un resumen completo de cómo viene el día: agenda + cobros pendientes de hoy + alertas relevantes, todo junto.',
        parameters: { type: 'OBJECT', properties: {} },
      },

      // ---- RECORDATORIOS ----
      {
        name: 'crear_recordatorio',
        description: 'Crea un recordatorio general (no una visita a cliente) con fecha y hora. Puede repetirse solo cada semana o cada mes si el usuario lo pide.',
        parameters: {
          type: 'OBJECT',
          properties: { texto: { type: 'STRING' }, fecha_hora_iso: { type: 'STRING' }, recurrencia: { type: 'STRING', description: "'semanal', 'mensual', o vacío si no se repite." } },
          required: ['texto', 'fecha_hora_iso'],
        },
      },
      {
        name: 'consultar_recordatorios',
        description: "Muestra los recordatorios generales (no visitas a clientes). Usá rango ('hoy', 'manana', 'semana') o fecha_iso ('YYYY-MM-DD') para un día puntual.",
        parameters: { type: 'OBJECT', properties: { rango: { type: 'STRING' }, fecha_iso: { type: 'STRING' } } },
      },
      {
        name: 'editar_recordatorio',
        description: 'Corrige un recordatorio existente, buscándolo por su texto.',
        parameters: {
          type: 'OBJECT',
          properties: { busqueda_texto: { type: 'STRING' }, nuevo_texto: { type: 'STRING' }, nueva_fecha_hora_iso: { type: 'STRING' } },
          required: ['busqueda_texto'],
        },
      },
      {
        name: 'eliminar_recordatorio',
        description: 'Borra un recordatorio, buscándolo por su texto. SOLO tras confirmación.',
        parameters: { type: 'OBJECT', properties: { busqueda_texto: { type: 'STRING' } }, required: ['busqueda_texto'] },
      },

      // ---- NOTAS ----
      {
        name: 'guardar_nota',
        description: 'Guarda una nota o lista libre (ej: lista de materiales, un apunte). Se guarda directo, sin pedir más datos de los que el usuario dio.',
        parameters: {
          type: 'OBJECT',
          properties: {
            titulo: { type: 'STRING' },
            contenido: { type: 'STRING' },
            categoria: { type: 'STRING', description: 'Si es evidente por el contenido (ej: "compras"), asignala vos sin preguntar.' },
            cliente_nombre: { type: 'STRING', description: 'Si la nota es sobre un cliente puntual (ej: mientras se habla de una visita), ligala a él.' },
            prioridad: { type: 'STRING', description: "'urgente', 'normal' o 'baja'. Por defecto normal." },
            fijar: { type: 'BOOLEAN', description: 'true si el usuario pide destacarla/fijarla.' },
          },
          required: ['contenido'],
        },
      },
      {
        name: 'editar_nota',
        description: 'Corrige el contenido de una nota existente. Si el usuario dice "la última nota" o no aclara cuál, usa la más reciente.',
        parameters: { type: 'OBJECT', properties: { busqueda: { type: 'STRING' }, nuevo_contenido: { type: 'STRING' } }, required: ['nuevo_contenido'] },
      },
      { name: 'buscar_nota', description: 'Busca una nota guardada por palabra clave.', parameters: { type: 'OBJECT', properties: { busqueda: { type: 'STRING' } }, required: ['busqueda'] } },
      {
        name: 'listar_notas',
        description: 'Lista las notas activas (no completadas). Por defecto no muestra las ya tildadas como hechas.',
        parameters: { type: 'OBJECT', properties: { incluir_completadas: { type: 'BOOLEAN' } } },
      },
      {
        name: 'consultar_notas_por_categoria',
        description: 'Lista notas de una categoría puntual (ej: compras, ideas).',
        parameters: { type: 'OBJECT', properties: { categoria: { type: 'STRING' } }, required: ['categoria'] },
      },
      {
        name: 'consultar_notas_por_fecha',
        description: "Lista notas de un rango de fechas. rango: 'hoy', 'semana', 'mes'.",
        parameters: { type: 'OBJECT', properties: { rango: { type: 'STRING' } } },
      },
      {
        name: 'marcar_nota_completada',
        description: 'Marca una nota como hecha/completada (no la borra).',
        parameters: { type: 'OBJECT', properties: { busqueda: { type: 'STRING' } }, required: ['busqueda'] },
      },
      {
        name: 'marcar_nota_fijada',
        description: 'Fija o desfija una nota para que aparezca destacada primero.',
        parameters: { type: 'OBJECT', properties: { busqueda: { type: 'STRING' }, fijar: { type: 'BOOLEAN' } }, required: ['busqueda', 'fijar'] },
      },
      {
        name: 'guardar_foto_nota',
        description: 'Adjunta la última foto enviada a una nota.',
        parameters: { type: 'OBJECT', properties: { busqueda: { type: 'STRING' } }, required: ['busqueda'] },
      },
      {
        name: 'combinar_notas',
        description: 'Une dos notas relacionadas en una sola.',
        parameters: { type: 'OBJECT', properties: { busqueda_principal: { type: 'STRING' }, busqueda_a_sumar: { type: 'STRING' } }, required: ['busqueda_principal', 'busqueda_a_sumar'] },
      },
      {
        name: 'exportar_nota_pdf',
        description: 'Genera un PDF de una nota para compartir fuera del chat.',
        parameters: { type: 'OBJECT', properties: { busqueda: { type: 'STRING' } }, required: ['busqueda'] },
      },
      {
        name: 'eliminar_nota',
        description: 'Borra una nota, buscándola por su contenido o título. SOLO tras confirmación.',
        parameters: { type: 'OBJECT', properties: { busqueda: { type: 'STRING' } }, required: ['busqueda'] },
      },
      {
        name: 'eliminar_notas_completadas',
        description: 'Borra todas las notas ya marcadas como completadas de una vez. SOLO tras confirmación.',
        parameters: { type: 'OBJECT', properties: {} },
      },

      // ---- DOCUMENTOS Y REPORTES ----
      {
        name: 'generar_documento',
        description: 'Genera un PDF con tu marca a partir de título y contenido libre (no presupuesto ni recibo).',
        parameters: { type: 'OBJECT', properties: { titulo: { type: 'STRING' }, contenido: { type: 'STRING' } }, required: ['titulo', 'contenido'] },
      },
      {
        name: 'generar_extracto_cliente',
        description: 'Genera un PDF con el historial completo de plata de un cliente (presupuestos y recibos).',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      {
        name: 'generar_bitacora',
        description: "Genera un PDF con todos los trabajos de un mes. mes_iso en formato 'YYYY-MM'; si no se especifica, usa el mes actual.",
        parameters: { type: 'OBJECT', properties: { mes_iso: { type: 'STRING' } } },
      },
      {
        name: 'consultar_reporte_mensual',
        description: 'Muestra un resumen de facturación del mes (facturado, cobrado, pendiente). Por defecto respuesta corta en texto, no PDF.',
        parameters: { type: 'OBJECT', properties: { mes_iso: { type: 'STRING' } } },
      },
      {
        name: 'comparar_meses',
        description: "Compara la facturación de un mes contra el anterior. Reconocé 'este mes', 'el mes pasado', etc.",
        parameters: { type: 'OBJECT', properties: { mes_iso: { type: 'STRING' } } },
      },
      {
        name: 'consultar_reporte_anual',
        description: 'Reporte completo de un año (facturado, cobrado, pendiente).',
        parameters: { type: 'OBJECT', properties: { anio: { type: 'STRING' } } },
      },
      {
        name: 'exportar_reporte_anual',
        description: 'Genera un PDF con el reporte anual completo, listo para el contador.',
        parameters: { type: 'OBJECT', properties: { anio: { type: 'STRING' } } },
      },
      {
        name: 'consultar_ranking_clientes',
        description: 'Lista los clientes que más te facturaron en un período.',
        parameters: { type: 'OBJECT', properties: { mes_iso: { type: 'STRING' } } },
      },
      {
        name: 'consultar_rentabilidad_general',
        description: 'Ganancia neta del negocio en un período (facturado menos gastos en materiales), no de un solo trabajo.',
        parameters: { type: 'OBJECT', properties: { mes_iso: { type: 'STRING' } } },
      },
      {
        name: 'consultar_proyeccion_cierre',
        description: 'Proyecta cómo vas a terminar el mes según el ritmo actual de facturación.',
        parameters: { type: 'OBJECT', properties: { mes_iso: { type: 'STRING' } } },
      },
      {
        name: 'consultar_grafico_facturacion',
        description: 'Muestra un gráfico simple (de texto) de la facturación de los últimos meses.',
        parameters: { type: 'OBJECT', properties: { cantidad_meses: { type: 'NUMBER' } } },
      },
      {
        name: 'consultar_facturacion_por_categoria',
        description: 'Reporte de facturación separado por categoría de cliente (si el usuario las usa).',
        parameters: { type: 'OBJECT', properties: { mes_iso: { type: 'STRING' } } },
      },
      {
        name: 'consultar_facturacion_por_rubro',
        description: 'Reporte de facturación separado por rubro de trabajo (plomería, gas, electricidad, etc), si los trabajos tienen rubro cargado.',
        parameters: { type: 'OBJECT', properties: { mes_iso: { type: 'STRING' } } },
      },
      {
        name: 'consultar_clientes_nuevos_vs_recurrentes',
        description: 'Cuántos clientes nuevos versus ya existentes facturaste en un período.',
        parameters: { type: 'OBJECT', properties: { mes_iso: { type: 'STRING' } } },
      },
      {
        name: 'consultar_tiempo_cierre_venta',
        description: 'Tiempo promedio entre que se manda un presupuesto y el cliente lo acepta.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'consultar_negocio_completo',
        description: 'Resumen ejecutivo de todo el negocio en una sola vista: facturación, pendientes, mejores clientes, y alertas relevantes. Usar cuando el usuario pregunta algo amplio como "cómo va mi negocio" o "cómo ando".',
        parameters: { type: 'OBJECT', properties: {} },
      },
    ],
  },
];

async function llamarGemini(contents) {
  const body = { system_instruction: { parts: [{ text: INSTRUCCION_SISTEMA }] }, contents, tools: HERRAMIENTAS, generationConfig: { temperature: 0.3 } };
  const resp = await fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`Error de Gemini (${resp.status}): ${await resp.text()}`);
  const data = await resp.json();
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error('Gemini no devolvió respuesta.');
  return candidate.content;
}

async function conversar(historialCompartido, mensajeUsuario, ejecutor, adjuntos = []) {
  const partesUsuario = [{ text: mensajeUsuario }, ...adjuntos.map((a) => ({ inline_data: { mime_type: a.mimeType, data: a.data } }))];
  const borrador = [...historialCompartido, { role: 'user', parts: partesUsuario }];

  for (let i = 0; i < 5; i++) {
    const contenidoModelo = await llamarGemini(borrador);
    const llamadasFuncion = (contenidoModelo.parts || []).filter((p) => p.functionCall);

    if (!llamadasFuncion.length) {
      const texto = (contenidoModelo.parts || []).map((p) => p.text).filter(Boolean).join('\n');
      borrador.push({ role: 'model', parts: contenidoModelo.parts });
      historialCompartido.length = 0;
      historialCompartido.push(...borrador);
      return texto || 'Listo. ✅';
    }

    borrador.push({ role: 'model', parts: contenidoModelo.parts });
    const respuestasFuncion = [];
    for (const llamada of llamadasFuncion) {
      let resultado;
      try {
        resultado = await ejecutor(llamada.functionCall.name, llamada.functionCall.args || {});
      } catch (err) {
        console.error(`Error ejecutando ${llamada.functionCall.name}:`, err);
        resultado = { error: err.message || 'Error ejecutando la acción.' };
      }
      respuestasFuncion.push({ functionResponse: { name: llamada.functionCall.name, response: resultado } });
    }
    borrador.push({ role: 'user', parts: respuestasFuncion });
  }
  return 'Se complicó un poco encadenar todo eso, ¿podés pedírmelo de nuevo más simple? 🙏';
}

async function transcribirAudio(bufferAudio, mimeType) {
  const body = {
    contents: [
      {
        parts: [
          { text: 'Transcribí exactamente lo que se dice en este audio, en español. Respondé ÚNICAMENTE con el texto transcripto, sin comillas ni explicaciones.' },
          { inline_data: { mime_type: mimeType, data: bufferAudio.toString('base64') } },
        ],
      },
    ],
    generationConfig: { temperature: 0 },
  };
  const resp = await fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`Error de Gemini (${resp.status}): ${await resp.text()}`);
  const data = await resp.json();
  const texto = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) throw new Error('Gemini no devolvió transcripción.');
  return texto.trim();
}

module.exports = { conversar, transcribirAudio };
