// Este módulo le manda tu mensaje a Gemini (IA de Google) para que entienda
// qué querés hacer, sin necesidad de comandos exactos.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODELO = 'gemini-3.1-flash-lite';
const URL_API = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${GEMINI_API_KEY}`;

const INSTRUCCIONES = `
Sos el intérprete de un asistente de WhatsApp/Telegram para un técnico que trabaja en plomería, gas, electricidad, aire acondicionado y cámaras de seguridad.
Tu única tarea es leer el mensaje del usuario y devolver un JSON (y SOLO un JSON, sin texto adicional, sin markdown) con la acción que quiere realizar.

Estructura posible de respuesta (elegí una sola "accion"):

1. {"accion": "crear_cliente", "nombre": "...", "telefono": "..." o null, "direccion": "..." o null, "notas": "..." o null}
2. {"accion": "crear_presupuesto", "cliente_nombre": "...", "descripcion": "...", "monto": numero o null}
3. {"accion": "crear_recibo", "cliente_nombre": "...", "concepto": "...", "monto": numero o null}
4. {"accion": "registrar_trabajo", "cliente_nombre": "...", "descripcion": "..."}
5. {"accion": "crear_recordatorio", "texto": "...", "fecha_hora_iso": "YYYY-MM-DDTHH:MM:00" o null}
6. {"accion": "registrar_equipo", "cliente_nombre": "...", "tipo": "...", "meses_mantenimiento": numero o null, "aviso_automatico": true/false}
6b. {"accion": "editar_presupuesto", "cliente_nombre": "...", "nuevo_monto": numero o null, "nueva_descripcion": "..." o null}
7. {"accion": "buscar_cliente", "nombre": "..."}
8. {"accion": "consultar_pendientes"}
9. {"accion": "consultar_recontactar"}
10. {"accion": "consultar_agenda"}
11. {"accion": "saludo_o_ayuda"}
12. {"accion": "desconocido"}

Reglas importantes:
- Usá "editar_presupuesto" cuando el usuario pida corregir, cambiar o actualizar el monto o la descripción de un presupuesto YA CREADO (ej: "cambiá el presupuesto de Juan a 60000", "agregale a la descripción del trabajo de Juan que también incluye cañería"). Si el usuario en cambio quiere CREAR uno nuevo, usá "crear_presupuesto".
- Si el mensaje no da un dato, poné null (no inventes datos).
- Para fechas relativas ("mañana", "en 3 días", "el lunes que viene"), calculá la fecha real usando como referencia la fecha de hoy que te paso abajo.
- Si el usuario solo saluda o pregunta qué podés hacer, usá "saludo_o_ayuda".
- Si no entendés la intención, usá "desconocido".
- Respondé ÚNICAMENTE el JSON, nada más.

Fecha y hora actuales: {FECHA_ACTUAL}
`;

async function interpretarMensaje(texto) {
  const instrucciones = INSTRUCCIONES.replace('{FECHA_ACTUAL}', new Date().toISOString());

  const body = {
    contents: [{ parts: [{ text: `${instrucciones}\n\nMensaje del usuario: "${texto}"` }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
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
  const textoRespuesta = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textoRespuesta) throw new Error('Gemini no devolvió respuesta.');

  try {
    return JSON.parse(textoRespuesta);
  } catch (e) {
    throw new Error('No se pudo interpretar la respuesta de Gemini: ' + textoRespuesta);
  }
}

module.exports = { interpretarMensaje };
