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

PRESUPUESTOS:
- Pueden tener varios ítems. Si te dan varias cosas en un pedido, cargalas como ítems separados.
- Por defecto NO generes el PDF al crear/modificar — confirmá en texto con el detalle. Generá el PDF (generar_pdf=true) solo si el usuario lo pide explícitamente ("pdf", "documento", "mandámelo").
- Cuando el usuario cuente que un cliente aceptó, rechazó, o no decidió, usá cambiar_estado_presupuesto — si no, el sistema va a seguir sugiriendo recontactarlo aunque ya esté cerrado.
- crear_presupuesto ya genera automáticamente la deuda pendiente asociada, no hace falta un paso aparte.

RECIBOS: si falta concepto o monto, y el cliente tiene un presupuesto activo, usá sus datos automáticamente. Al generar un recibo, la deuda pendiente correspondiente se salda sola.

TRABAJOS: registrar_trabajo puede incluir el gasto real en materiales (para saber la ganancia neta) y queda con garantía de 90 días por defecto (se puede cambiar).

AGENDA Y VISITAS (agendar_trabajo, no crear_recordatorio, cuando sea una visita a un cliente en fecha/hora concretas):
- Al agendar, preguntá o asumí un aviso previo razonable (ej: 2 horas antes) si el usuario no lo aclara, pero dejá que él lo elija si quiere ("avisame el día anterior", "avisame 3 horas antes").
- Cuando el usuario diga que terminó un trabajo agendado, usá completar_visita — y ofrecele registrar el trabajo realizado y/o generar el recibo en el mismo intercambio.
- Cuando diga que tiene que volver otro día, usá reagendar_visita con la nueva fecha.
- consultar_agenda acepta un rango: "hoy", "manana", o "semana". Si no aclara, asumí "hoy".
- Antes de agendar, si hay otra visita muy cerca en el horario, el sistema te va a avisar del choque — contáselo al usuario y preguntale si sigue igual o cambia el horario.

RECORDATORIOS: para avisos generales que NO son una visita a un cliente (ej: "recordame pagar el monotributo"). Se pueden editar y eliminar buscando por el texto.

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
        description: 'Da de alta un cliente nuevo.',
        parameters: {
          type: 'OBJECT',
          properties: {
            nombre: { type: 'STRING' },
            telefono: { type: 'STRING' },
            direccion: { type: 'STRING' },
            notas: { type: 'STRING' },
            apodo: { type: 'STRING', description: 'Referencia para distinguirlo si hay otro con el mismo nombre.' },
            referido_por: { type: 'STRING', description: 'Quién lo recomendó, si el usuario lo menciona.' },
          },
          required: ['nombre'],
        },
      },
      {
        name: 'editar_cliente',
        description: 'Corrige datos de un cliente ya cargado.',
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
        name: 'listar_presupuestos_archivados',
        description: 'Lista los presupuestos borrados temporalmente. Solo si el usuario lo pide explícitamente.',
        parameters: { type: 'OBJECT', properties: {} },
      },

      // ---- RECIBOS ----
      {
        name: 'crear_recibo',
        description: 'Genera un recibo de pago en PDF. Si falta concepto/monto, usa el presupuesto activo del cliente. Salda la deuda asociada.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM, concepto: { type: 'STRING' }, monto: { type: 'NUMBER' } }, required: ['cliente_nombre'] },
      },

      // ---- COBROS / DEUDAS ----
      { name: 'consultar_pendientes', description: 'Muestra los cobros pendientes.', parameters: { type: 'OBJECT', properties: {} } },
      {
        name: 'registrar_pago_parcial',
        description: 'Registra un pago parcial sobre la deuda pendiente de un cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM, monto: { type: 'NUMBER' } }, required: ['cliente_nombre', 'monto'] },
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
        description: 'Registra un equipo instalado y programa mantenimiento futuro recurrente.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: CID,
            cliente_nombre: CNOM,
            tipo: { type: 'STRING' },
            meses_mantenimiento: { type: 'NUMBER' },
            aviso_automatico: { type: 'BOOLEAN' },
          },
          required: ['cliente_nombre', 'tipo'],
        },
      },
      {
        name: 'eliminar_equipo',
        description: 'Da de baja un equipo (deja de generar avisos de mantenimiento). SOLO tras confirmación.',
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM, tipo: { type: 'STRING' } }, required: ['cliente_nombre', 'tipo'] },
      },

      // ---- AGENDA / VISITAS ----
      {
        name: 'agendar_trabajo',
        description: 'Agenda una visita a un cliente en fecha y hora concretas, con aviso previo.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: CID,
            cliente_nombre: CNOM,
            descripcion: { type: 'STRING' },
            fecha_hora_iso: { type: 'STRING' },
            aviso_horas_antes: { type: 'NUMBER', description: 'Cuántas horas antes avisar (24 = un día antes).' },
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
        parameters: { type: 'OBJECT', properties: { cliente_id: CID, cliente_nombre: CNOM }, required: ['cliente_nombre'] },
      },
      {
        name: 'consultar_agenda',
        description: "Muestra la agenda de visitas. rango puede ser 'hoy', 'manana' o 'semana'.",
        parameters: { type: 'OBJECT', properties: { rango: { type: 'STRING' } } },
      },

      // ---- RECORDATORIOS ----
      {
        name: 'crear_recordatorio',
        description: 'Crea un recordatorio general (no una visita a cliente) con fecha y hora.',
        parameters: { type: 'OBJECT', properties: { texto: { type: 'STRING' }, fecha_hora_iso: { type: 'STRING' } }, required: ['texto', 'fecha_hora_iso'] },
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
        description: 'Guarda una nota o lista libre (ej: lista de materiales) sin ligar a un cliente.',
        parameters: { type: 'OBJECT', properties: { titulo: { type: 'STRING' }, contenido: { type: 'STRING' } }, required: ['contenido'] },
      },
      { name: 'buscar_nota', description: 'Busca una nota guardada.', parameters: { type: 'OBJECT', properties: { busqueda: { type: 'STRING' } }, required: ['busqueda'] } },
      { name: 'listar_notas', description: 'Lista las notas más recientes guardadas.', parameters: { type: 'OBJECT', properties: {} } },
      {
        name: 'eliminar_nota',
        description: 'Borra una nota, buscándola por su contenido o título. SOLO tras confirmación.',
        parameters: { type: 'OBJECT', properties: { busqueda: { type: 'STRING' } }, required: ['busqueda'] },
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
        description: 'Muestra un resumen de facturación del mes (facturado, cobrado, pendiente).',
        parameters: { type: 'OBJECT', properties: { mes_iso: { type: 'STRING' } } },
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
