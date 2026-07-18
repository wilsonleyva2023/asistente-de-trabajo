// "Cerebro" del asistente: conversa con Gemini usando herramientas (function calling).

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODELO = 'gemini-3.1-flash-lite';
const URL_API = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${GEMINI_API_KEY}`;

const INSTRUCCION_SISTEMA = `Sos el asistente personal de un técnico argentino que trabaja en plomería, gas, electricidad, aire acondicionado y cámaras de seguridad. Le hablás de tú/vos, en español rioplatense, tono cercano y directo, sin formalismos innecesarios.

Tu propósito principal es ayudarlo con la gestión de su trabajo día a día: clientes, presupuestos, recibos, trabajos realizados, equipos instalados, recordatorios, cobros y notas sueltas (como listas de materiales).

Reglas de comportamiento:
- Priorizá usar una herramienta cuando el pedido encaje con alguna. No te quedes solo conversando si podés resolverlo con una acción concreta.
- Si te falta un dato obligatorio para usar una herramienta, preguntáselo primero en vez de inventarlo.
- Si el pedido no encaja con ninguna herramienta, respondé vos directamente, de forma útil y breve, sin decir "no entendí" — solo decí eso si genuinamente no tenés idea de qué te están pidiendo.
- Para guardar listas de materiales, apuntes o ideas sueltas que no son de un cliente puntual, usá guardar_nota.
- Para pedidos de un documento en PDF con contenido libre (que no sea presupuesto ni recibo), usá generar_documento.

CLIENTES CON EL MISMO NOMBRE (muy importante):
- Cuando busques un cliente y haya varios con el mismo nombre, vas a recibir de vuelta una lista con datos de cada uno (id, dirección, teléfono, deuda pendiente, último presupuesto). Usá esos datos para preguntarle al usuario de forma ESPECÍFICA cuál es, mencionando lo que los distingue (ej: "Tengo dos Jennifer: una en Calle 12 con una deuda de $20.000, y otra sin dirección registrada. ¿Cuál de las dos?"). Cuando el usuario te aclare (ej: "la que no tiene dirección"), identificá cuál de los ID de la lista corresponde, y usá ese cliente_id en la siguiente herramienta que llames sobre ese cliente (en vez de cliente_nombre), así no hay riesgo de confundirte con el otro.
- Si al cargar un cliente nuevo el usuario te da una referencia para distinguirlo (ej: "Gonzalo, el del termotanque"), guardá esa referencia como apodo usando el campo correspondiente.

PRESUPUESTOS CON VARIOS ÍTEMS:
- Un presupuesto puede tener varios ítems (cada uno con su descripción y monto), no uno solo. Si el usuario te da varias cosas para presupuestar en un mismo pedido, cargalas como ítems separados.
- Si el usuario pide "sacar" o "borrar" uno o varios ítems puntuales de un presupuesto (no todo el presupuesto), usá quitar_items_presupuesto, no elimines el presupuesto entero.

BORRAR: TEMPORAL VS. DEFINITIVO (muy importante):
- Por defecto, cuando el usuario pida borrar un presupuesto o un cobro, hacelo de forma TEMPORAL (archivar): desaparece de las listas pero se puede restaurar después. Para esto, llamá a la herramienta con permanente=false.
- Solo usá permanente=true cuando el usuario lo pida explícitamente con palabras como "para siempre", "definitivamente", "que no se pueda recuperar", "borralo de una", etc.
- SIEMPRE preguntá "¿confirmás?" antes de borrar algo (temporal o definitivo), y esperá la respuesta del usuario en un mensaje siguiente antes de ejecutar la herramienta. Si es un borrado DEFINITIVO, remarcá explícitamente que no tiene vuelta atrás antes de pedir la confirmación.
- Si el usuario pide "recuperar" o "restaurar" algo que borró, usá restaurar_presupuesto o restaurar_cobro (esto solo funciona si el borrado fue temporal).
- Los presupuestos y cobros borrados (temporal o definitivamente) NUNCA aparecen en búsquedas ni consultas normales. Si el usuario quiere ver específicamente los borrados temporalmente, usá listar_presupuestos_archivados.
- Cuando el usuario pida una acción sobre un presupuesto YA EXISTENTE (reenviarlo, editarlo, borrarlo, agregarle o sacarle ítems) y haya varios clientes con ese nombre, el sistema ya filtra automáticamente y solo te va a mostrar como opciones a los que tienen un presupuesto activo en este momento — no le preguntes al usuario sobre clientes que no tengan presupuesto activo, ni le muestres esa lista completa de personas.

Si te preguntan qué podés hacer, o para qué servís, respondé de forma natural y cálida (no como un menú de comandos): agrupá tus capacidades en unas pocas categorías con tus palabras y dales 1-2 ejemplos concretos de cómo pedírtelo hablando normal. Si te preguntan por una función en particular con más profundidad, explicásela con más detalle y ejemplos de uso real. Mencioná que también entendés audios, fotos y documentos adjuntos.
Si el usuario te dice algo como "hagamos un ejemplo", "dame un ejemplo", respondé con un ejemplo concreto e inventado (aclarando que es de ejemplo).
Si el usuario te manda una foto o un documento, mirala/leela con atención y respondé según lo que pida.
Nunca inventes datos de clientes, montos o fechas que el usuario no te dio.
Fecha y hora actuales: ${new Date().toISOString()}`;

const ITEM_SCHEMA = {
  type: 'OBJECT',
  properties: { descripcion: { type: 'STRING' }, monto: { type: 'NUMBER' } },
  required: ['descripcion', 'monto'],
};

const HERRAMIENTAS = [
  {
    functionDeclarations: [
      {
        name: 'buscar_cliente',
        description: 'Busca un cliente guardado (por nombre o apodo) y muestra su ficha completa.',
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
            apodo: { type: 'STRING', description: 'Referencia para distinguirlo si hay otro cliente con el mismo nombre (ej: "el del termotanque").' },
          },
          required: ['nombre'],
        },
      },
      {
        name: 'crear_presupuesto',
        description: 'Crea un presupuesto nuevo (con uno o varios ítems) para un cliente y genera el PDF automáticamente.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: { type: 'STRING', description: 'Si ya sabés el ID exacto del cliente por una búsqueda anterior en esta charla, usalo en vez de cliente_nombre para evitar ambigüedad.' },
            cliente_nombre: { type: 'STRING' },
            items: { type: 'ARRAY', items: ITEM_SCHEMA, description: 'Lista de ítems del presupuesto, cada uno con su descripción y monto.' },
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
        description: 'Agrega uno o más ítems nuevos al presupuesto más reciente de un cliente (sin crear un presupuesto nuevo).',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_id: { type: 'STRING' }, cliente_nombre: { type: 'STRING' }, items: { type: 'ARRAY', items: ITEM_SCHEMA } },
          required: ['cliente_nombre', 'items'],
        },
      },
      {
        name: 'quitar_items_presupuesto',
        description: 'Saca uno o varios ítems puntuales del presupuesto más reciente de un cliente (no borra el presupuesto completo).',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: { type: 'STRING', description: 'Si ya sabés el ID exacto del cliente por una búsqueda anterior en esta charla, usalo en vez de cliente_nombre para evitar ambigüedad.' },
            cliente_nombre: { type: 'STRING' },
            descripciones_items: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Texto que identifica cada ítem a quitar (puede ser parcial).' },
            permanente: { type: 'BOOLEAN', description: 'true = no se puede recuperar. false (defecto) = se puede restaurar.' },
          },
          required: ['cliente_nombre', 'descripciones_items'],
        },
      },
      {
        name: 'editar_presupuesto',
        description: 'Corrige el monto total y/o la descripción general del presupuesto más reciente de un cliente (para cambios simples, no por ítems).',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_id: { type: 'STRING' }, cliente_nombre: { type: 'STRING' }, nuevo_monto: { type: 'NUMBER' }, nueva_descripcion: { type: 'STRING' } },
          required: ['cliente_nombre'],
        },
      },
      {
        name: 'reenviar_presupuesto',
        description: 'Vuelve a generar y enviar el PDF del presupuesto más reciente de un cliente.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: { type: 'STRING', description: 'Si ya sabés el ID exacto del cliente por una búsqueda anterior en esta charla, usalo en vez de cliente_nombre para evitar ambigüedad.' },
            cliente_nombre: { type: 'STRING' },
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
        description: 'Borra el presupuesto más reciente de un cliente. SOLO después de confirmación explícita del usuario.',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_id: { type: 'STRING' }, cliente_nombre: { type: 'STRING' }, permanente: { type: 'BOOLEAN' } },
          required: ['cliente_nombre'],
        },
      },
      {
        name: 'listar_presupuestos_archivados',
        description: 'Muestra la lista de presupuestos borrados temporalmente (que se pueden restaurar). Usar SOLO si el usuario lo pide explícitamente, no aparecen en ninguna otra consulta.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'restaurar_presupuesto',
        description: 'Recupera el último presupuesto borrado (temporalmente) de un cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_id: { type: 'STRING' }, cliente_nombre: { type: 'STRING' } }, required: ['cliente_nombre'] },
      },
      {
        name: 'crear_recibo',
        description: 'Genera un recibo de pago en PDF para un cliente.',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_id: { type: 'STRING' }, cliente_nombre: { type: 'STRING' }, concepto: { type: 'STRING' }, monto: { type: 'NUMBER' } },
          required: ['cliente_nombre', 'concepto', 'monto'],
        },
      },
      {
        name: 'registrar_trabajo',
        description: 'Registra un trabajo realizado para un cliente (queda en su historial).',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_id: { type: 'STRING' }, cliente_nombre: { type: 'STRING' }, descripcion: { type: 'STRING' } },
          required: ['cliente_nombre', 'descripcion'],
        },
      },
      {
        name: 'registrar_equipo',
        description: 'Registra un equipo instalado en la casa de un cliente y programa un aviso de mantenimiento futuro.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: { type: 'STRING', description: 'Si ya sabés el ID exacto del cliente por una búsqueda anterior en esta charla, usalo en vez de cliente_nombre para evitar ambigüedad.' },
            cliente_nombre: { type: 'STRING' },
            tipo: { type: 'STRING' },
            meses_mantenimiento: { type: 'NUMBER' },
            aviso_automatico: { type: 'BOOLEAN' },
          },
          required: ['cliente_nombre', 'tipo'],
        },
      },
      {
        name: 'crear_recordatorio',
        description: 'Crea un recordatorio general con fecha y hora.',
        parameters: {
          type: 'OBJECT',
          properties: { texto: { type: 'STRING' }, fecha_hora_iso: { type: 'STRING' } },
          required: ['texto', 'fecha_hora_iso'],
        },
      },
      {
        name: 'consultar_pendientes',
        description: 'Muestra los cobros pendientes.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'registrar_pago_parcial',
        description: 'Registra un pago parcial sobre un cobro pendiente de un cliente.',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_id: { type: 'STRING' }, cliente_nombre: { type: 'STRING' }, monto: { type: 'NUMBER' } },
          required: ['cliente_nombre', 'monto'],
        },
      },
      {
        name: 'eliminar_cobro',
        description: 'Borra un cobro/deuda de un cliente. SOLO después de confirmación explícita del usuario.',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_id: { type: 'STRING' }, cliente_nombre: { type: 'STRING' }, permanente: { type: 'BOOLEAN' } },
          required: ['cliente_nombre'],
        },
      },
      {
        name: 'restaurar_cobro',
        description: 'Recupera el último cobro borrado (temporalmente) de un cliente.',
        parameters: { type: 'OBJECT', properties: { cliente_id: { type: 'STRING' }, cliente_nombre: { type: 'STRING' } }, required: ['cliente_nombre'] },
      },
      {
        name: 'consultar_recontactar',
        description: 'Muestra presupuestos que no se cerraron y conviene recontactar al cliente.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'consultar_agenda',
        description: 'Muestra la agenda de hoy: recordatorios y mantenimientos.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'guardar_nota',
        description: 'Guarda una nota o lista libre (ej: lista de materiales) que no pertenece a un cliente puntual.',
        parameters: { type: 'OBJECT', properties: { titulo: { type: 'STRING' }, contenido: { type: 'STRING' } }, required: ['contenido'] },
      },
      {
        name: 'buscar_nota',
        description: 'Busca una nota o lista guardada anteriormente.',
        parameters: { type: 'OBJECT', properties: { busqueda: { type: 'STRING' } }, required: ['busqueda'] },
      },
      {
        name: 'generar_documento',
        description: 'Genera un PDF con tu marca a partir de un título y contenido libre (para documentos que no son presupuesto ni recibo).',
        parameters: { type: 'OBJECT', properties: { titulo: { type: 'STRING' }, contenido: { type: 'STRING' } }, required: ['titulo', 'contenido'] },
      },
    ],
  },
];

async function llamarGemini(contents) {
  const body = {
    system_instruction: { parts: [{ text: INSTRUCCION_SISTEMA }] },
    contents,
    tools: HERRAMIENTAS,
    generationConfig: { temperature: 0.3 },
  };

  const resp = await fetch(URL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Error de Gemini (${resp.status}): ${errText}`);
  }

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
      return texto || 'Listo.';
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

  return 'Se complicó un poco encadenar todo eso, ¿podés pedírmelo de nuevo más simple?';
}

async function transcribirAudio(bufferAudio, mimeType) {
  const body = {
    contents: [
      {
        parts: [
          { text: 'Transcribí exactamente lo que se dice en este audio, en español. Respondé ÚNICAMENTE con el texto transcripto, sin comillas, sin explicaciones, sin agregar nada más.' },
          { inline_data: { mime_type: mimeType, data: bufferAudio.toString('base64') } },
        ],
      },
    ],
    generationConfig: { temperature: 0 },
  };

  const resp = await fetch(URL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Error de Gemini (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  const texto = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) throw new Error('Gemini no devolvió transcripción.');
  return texto.trim();
}

module.exports = { conversar, transcribirAudio };
