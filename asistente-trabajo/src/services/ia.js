// "Cerebro" del asistente: conversa con Gemini usando herramientas (function calling).
// En vez de forzar cada mensaje a encajar en una sola acción fija, le damos a Gemini
// una caja de herramientas y él decide cuál usar (o ninguna, y simplemente responde).

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODELO = 'gemini-3.1-flash-lite';
const URL_API = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${GEMINI_API_KEY}`;

const INSTRUCCION_SISTEMA = `Sos el asistente personal de un técnico argentino que trabaja en plomería, gas, electricidad, aire acondicionado y cámaras de seguridad. Le hablás de tú/vos, en español rioplatense, tono cercano y directo, sin formalismos innecesarios.

Tu propósito principal es ayudarlo con la gestión de su trabajo día a día: clientes, presupuestos, recibos, trabajos realizados, equipos instalados, recordatorios, cobros y notas sueltas (como listas de materiales).

Reglas de comportamiento:
- Priorizá usar una herramienta cuando el pedido encaje con alguna. No te quedes solo conversando si podés resolverlo con una acción concreta.
- Si te falta un dato obligatorio para usar una herramienta (ej: no sabés el monto de un presupuesto), preguntáselo primero en vez de inventarlo.
- Si el pedido no encaja con ninguna herramienta (ej: una pregunta técnica, un cálculo, un consejo), respondé vos directamente, de forma útil y breve, sin decir "no entendí" — solo decí eso si genuinamente no tenés idea de qué te están pidiendo.
- Para guardar listas de materiales, apuntes o ideas sueltas que no son de un cliente puntual, usá guardar_nota.
- Para pedidos de un documento en PDF con contenido libre (que no sea presupuesto ni recibo), usá generar_documento.
- IMPORTANTE: antes de usar eliminar_presupuesto o eliminar_cobro, primero preguntale al usuario "¿Confirmás que querés borrar [lo que sea]? No se puede deshacer." y esperá a que te diga que sí en un mensaje siguiente. Nunca borres sin esa confirmación explícita del usuario en la conversación.
- Nunca inventes datos de clientes, montos o fechas que el usuario no te dio.
- Si te preguntan qué podés hacer, o para qué servís, respondé de forma natural y cálida (no como un menú de comandos): agrupá tus capacidades en unas pocas categorías con tus palabras (ej: gestión de clientes y presupuestos, recordatorios y agenda, notas y listas, documentos en PDF) y dales 1-2 ejemplos concretos de cómo pedírtelo hablando normal. Si te preguntan por una función en particular con más profundidad, explicásela con más detalle y ejemplos de uso real.
- Si el usuario te dice algo como "hagamos un ejemplo", "dame un ejemplo", "mostrame cómo sería", respondé con un ejemplo concreto e inventado (aclarando que es de ejemplo) mostrando cómo quedaría, en vez de solo explicar en abstracto.
- Fecha y hora actuales: ${new Date().toISOString()}`;

const HERRAMIENTAS = [
  {
    functionDeclarations: [
      {
        name: 'buscar_cliente',
        description: 'Busca un cliente guardado y muestra su ficha completa (datos, presupuestos, trabajos, cobros).',
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
          },
          required: ['nombre'],
        },
      },
      {
        name: 'crear_presupuesto',
        description: 'Crea un presupuesto nuevo para un cliente y genera el PDF automáticamente.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_nombre: { type: 'STRING' },
            descripcion: { type: 'STRING' },
            monto: { type: 'NUMBER' },
          },
          required: ['cliente_nombre', 'descripcion', 'monto'],
        },
      },
      {
        name: 'editar_presupuesto',
        description: 'Corrige el monto y/o la descripción del presupuesto más reciente de un cliente.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_nombre: { type: 'STRING' },
            nuevo_monto: { type: 'NUMBER' },
            nueva_descripcion: { type: 'STRING' },
          },
          required: ['cliente_nombre'],
        },
      },
      {
        name: 'reenviar_presupuesto',
        description: 'Vuelve a generar y enviar el PDF del presupuesto más reciente de un cliente, sin crear uno nuevo.',
        parameters: { type: 'OBJECT', properties: { cliente_nombre: { type: 'STRING' } }, required: ['cliente_nombre'] },
      },
      {
        name: 'crear_recibo',
        description: 'Genera un recibo de pago en PDF para un cliente.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_nombre: { type: 'STRING' },
            concepto: { type: 'STRING' },
            monto: { type: 'NUMBER' },
          },
          required: ['cliente_nombre', 'concepto', 'monto'],
        },
      },
      {
        name: 'registrar_trabajo',
        description: 'Registra un trabajo realizado para un cliente (queda en su historial).',
        parameters: {
          type: 'OBJECT',
          properties: { cliente_nombre: { type: 'STRING' }, descripcion: { type: 'STRING' } },
          required: ['cliente_nombre', 'descripcion'],
        },
      },
      {
        name: 'registrar_equipo',
        description: 'Registra un equipo instalado en la casa de un cliente y programa un aviso de mantenimiento futuro.',
        parameters: {
          type: 'OBJECT',
          properties: {
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
          properties: { texto: { type: 'STRING' }, fecha_hora_iso: { type: 'STRING', description: 'Formato YYYY-MM-DDTHH:MM:00' } },
          required: ['texto', 'fecha_hora_iso'],
        },
      },
      {
        name: 'consultar_pendientes',
        description: 'Muestra los cobros pendientes.',
        parameters: { type: 'OBJECT', properties: {} },
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
        description: 'Guarda una nota o lista libre (ej: lista de materiales para comprar, un apunte, una idea) que no pertenece a un cliente puntual.',
        parameters: {
          type: 'OBJECT',
          properties: { titulo: { type: 'STRING' }, contenido: { type: 'STRING' } },
          required: ['contenido'],
        },
      },
      {
        name: 'buscar_nota',
        description: 'Busca una nota o lista guardada anteriormente por título o contenido.',
        parameters: { type: 'OBJECT', properties: { busqueda: { type: 'STRING' } }, required: ['busqueda'] },
      },
      {
        name: 'generar_documento',
        description: 'Genera un PDF con tu marca a partir de un título y un contenido libre dictado por el usuario (para documentos que no son presupuesto ni recibo).',
        parameters: {
          type: 'OBJECT',
          properties: { titulo: { type: 'STRING' }, contenido: { type: 'STRING' } },
          required: ['titulo', 'contenido'],
        },
      },
      {
        name: 'eliminar_presupuesto',
        description: 'Borra el presupuesto más reciente de un cliente. SOLO usar después de que el usuario confirmó explícitamente que quiere borrarlo.',
        parameters: { type: 'OBJECT', properties: { cliente_nombre: { type: 'STRING' } }, required: ['cliente_nombre'] },
      },
      {
        name: 'eliminar_cobro',
        description: 'Borra un cobro/deuda pendiente de un cliente. SOLO usar después de que el usuario confirmó explícitamente que quiere borrarlo.',
        parameters: { type: 'OBJECT', properties: { cliente_nombre: { type: 'STRING' } }, required: ['cliente_nombre'] },
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

// Conversa con Gemini, ejecutando herramientas hasta llegar a una respuesta final en texto.
// `historial` es un array de turnos {role, parts} que se va actualizando.
// `ejecutor` es una función async (nombre, args) => objeto de resultado.
async function conversar(historialCompartido, mensajeUsuario, ejecutor) {
  // Trabajamos sobre una copia temporal: si algo falla a mitad de camino,
  // el historial real de la charla no queda corrupto.
  const borrador = [...historialCompartido, { role: 'user', parts: [{ text: mensajeUsuario }] }];

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
        resultado = { error: err.message || 'Error ejecutando la acción.' };
      }
      respuestasFuncion.push({
        functionResponse: { name: llamada.functionCall.name, response: resultado },
      });
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
