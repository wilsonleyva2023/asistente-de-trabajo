const { Telegraf, Markup } = require('telegraf');
const https = require('https');
const session = require('./session');
const { registrarAyuda } = require('./ayuda');
const clientes = require('../services/clientes');
const presupuestos = require('../services/presupuestos');
const cobros = require('../services/cobros');
const recibos = require('../services/recibos');
const trabajos = require('../services/trabajos');
const equipos = require('../services/equipos');
const visitas = require('../services/visitas');
const recordatorios = require('../services/recordatorios');
const notas = require('../services/notas');
const reportes = require('../services/reportes');
const documentos = require('../services/documentos');
const audios = require('../services/audios');
const pdf = require('../services/pdf');
const ia = require('../services/ia');
const storage = require('../services/storage');
const fotos = require('../services/fotos');
const plantillas = require('../services/plantillas');

const agenteSinKeepAlive = new https.Agent({ keepAlive: false });
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, { telegram: { agent: agenteSinKeepAlive } });

bot.use((ctx, next) => {
  const permitido = process.env.TELEGRAM_CHAT_ID_PERMITIDO;
  if (permitido && String(ctx.chat?.id) !== String(permitido)) {
    return ctx.reply('No tenés autorización para usar este asistente.');
  }
  return next();
});

const TEXTO_AYUDA =
  '¡Hola! 👋 Soy tu asistente de trabajo. Hablame normal, de lo que necesites: cargar un cliente, hacer un presupuesto, agendar una visita, anotar una lista, mandarme una foto o un audio, lo que sea.\n\n' +
  'Escribí /ayuda para ver todo lo que puedo hacer, organizado por categorías. 📋\n\n' +
  'Comandos rápidos de agenda: /hoy /manana /semana\n\n' +
  '/cancelar - Cancelar lo que estés cargando';

bot.start((ctx) => ctx.reply(TEXTO_AYUDA));
registrarAyuda(bot);

bot.command('cancelar', (ctx) => {
  session.limpiar(ctx.chat.id);
  ctx.reply('Listo, cancelado. 👍');
});

bot.command('nuevocliente', (ctx) => {
  session.set(ctx.chat.id, { flujo: 'nuevocliente', paso: 'nombre', datos: {} });
  ctx.reply('¿Nombre del cliente?');
});
bot.command('clientes', (ctx) => {
  session.set(ctx.chat.id, { flujo: 'buscarcliente', paso: 'texto', datos: {} });
  ctx.reply('¿Nombre (o parte del nombre) del cliente que buscás?');
});
bot.command('presupuesto', (ctx) => {
  session.set(ctx.chat.id, { flujo: 'presupuesto', paso: 'buscar_cliente', datos: {} });
  ctx.reply('¿Para qué cliente es el presupuesto? Escribí el nombre.');
});
bot.command('recibo', (ctx) => {
  session.set(ctx.chat.id, { flujo: 'recibo', paso: 'buscar_cliente', datos: {} });
  ctx.reply('¿A qué cliente le generás el recibo? Escribí el nombre.');
});
bot.command('trabajo', (ctx) => {
  session.set(ctx.chat.id, { flujo: 'trabajo', paso: 'buscar_cliente', datos: {} });
  ctx.reply('¿Para qué cliente fue el trabajo? Escribí el nombre.');
});
bot.command('equipo', (ctx) => {
  session.set(ctx.chat.id, { flujo: 'equipo', paso: 'buscar_cliente', datos: {} });
  ctx.reply('¿A qué cliente le instalaste el equipo? Escribí el nombre.');
});
bot.command('recordatorio', (ctx) => {
  session.set(ctx.chat.id, { flujo: 'recordatorio', paso: 'texto', datos: {} });
  ctx.reply('¿Qué querés que te recuerde?');
});
bot.command('pendientes', (ctx) => ejecutarHerramienta(ctx, 'consultar_pendientes', {}));
bot.command('recontactar', (ctx) => ejecutarHerramienta(ctx, 'consultar_recontactar', {}));

async function agendaRapida(ctx, rango, etiqueta) {
  const rVisitas = await ejecutarHerramienta(ctx, 'consultar_agenda', { rango });
  const rRecs = await ejecutarHerramienta(ctx, 'consultar_recordatorios', { rango });
  if (!rVisitas.visitas.length && !rRecs.recordatorios.length) return ctx.reply(`No tenés nada agendado para ${etiqueta}. 👍`);
  let msg = `📅 ${etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1)}:\n\n`;
  rVisitas.visitas.forEach((v) => { msg += `🔧 ${v.hora} - ${v.cliente}: ${v.descripcion}${v.direccion ? ' (' + v.direccion + ')' : ''}\n`; });
  rRecs.recordatorios.forEach((r) => { msg += `⏰ ${r.hora} - ${r.texto}\n`; });
  await ctx.reply(msg);
}

bot.command('agenda', (ctx) => agendaRapida(ctx, 'hoy', 'hoy'));
bot.command('hoy', (ctx) => agendaRapida(ctx, 'hoy', 'hoy'));
bot.command('manana', (ctx) => agendaRapida(ctx, 'manana', 'mañana'));
bot.command('semana', (ctx) => agendaRapida(ctx, 'semana', 'esta semana'));
bot.command('cobrado', (ctx) => ejecutarHerramienta(ctx, 'consultar_estado_caja', {}).then((r) => {
  const partes = Object.entries(r.cobrado_hoy_por_metodo || {}).map(([m, v]) => `${m}: $${v}`).join(', ') || 'nada todavía';
  return ctx.reply(`💰 Cobrado hoy: ${partes}`);
}));
bot.command('pendiente', (ctx) => ejecutarHerramienta(ctx, 'consultar_pendientes', {}));
bot.command('equipos', async (ctx) => {
  const lista = await equipos.mantenimientosVencidosSinHacer(0);
  if (!lista.length) return ctx.reply('No tenés mantenimientos próximos a vencer. 👍');
  let msg = '🔧 Mantenimientos próximos/vencidos:\n\n';
  lista.forEach((e) => { msg += `• ${e.tipo} de ${e.clientes?.nombre} (${e.proximo_mantenimiento})\n`; });
  await ctx.reply(msg);
});
bot.command('notas', (ctx) => ejecutarHerramienta(ctx, 'listar_notas', {}));
bot.command('reporte', async (ctx) => {
  const r = await ejecutarHerramienta(ctx, 'consultar_reporte_mensual', {});
  await ctx.reply(`📊 Reporte de ${r.mes}:\n\n💰 Facturado: $${r.facturado}\n✅ Cobrado: $${r.cobrado}\n⏳ Pendiente: $${r.pendiente}`);
});
bot.command('fotos', (ctx) => ejecutarHerramienta(ctx, 'listar_archivos_recientes', {}));

// ================= ROUTER PRINCIPAL =================

async function procesarTexto(ctx, texto) {
  const estado = session.get(ctx.chat.id);
  if (estado) {
    try {
      switch (estado.flujo) {
        case 'nuevocliente': await pasoNuevoCliente(ctx, estado, texto); break;
        case 'buscarcliente': await pasoBuscarCliente(ctx, estado, texto); break;
        case 'presupuesto': await pasoPresupuesto(ctx, estado, texto); break;
        case 'recibo': await pasoRecibo(ctx, estado, texto); break;
        case 'trabajo': await pasoTrabajo(ctx, estado, texto); break;
        case 'equipo': await pasoEquipo(ctx, estado, texto); break;
        case 'recordatorio': await pasoRecordatorio(ctx, estado, texto); break;
      }
    } catch (err) {
      console.error(err);
      ctx.reply('Uy, pasó un error guardando eso. Probá de nuevo con /cancelar y empezar otra vez.');
      session.limpiar(ctx.chat.id);
    }
    return;
  }
  try {
    await ctx.sendChatAction('typing');
    const historial = session.obtenerHistorial(ctx.chat.id);
    const respuesta = await ia.conversar(historial, texto, (nombre, args) => ejecutarHerramienta(ctx, nombre, args));
    session.podarHistorial(ctx.chat.id);
    await ctx.reply(respuesta);
  } catch (err) {
    console.error('Error conversando con IA:', err);
    session.limpiarHistorial(ctx.chat.id);
    ctx.reply('Uy, tuve un problema procesando eso. Ya reinicié la memoria de esta charla, probá de nuevo. 🔄');
  }
}

bot.on('text', async (ctx) => { await procesarTexto(ctx, ctx.message.text.trim()); });

bot.on('voice', async (ctx) => {
  try {
    await ctx.sendChatAction('typing');
    const url = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    const buffer = Buffer.from(await (await fetch(url)).arrayBuffer());
    const texto = await ia.transcribirAudio(buffer, 'audio/ogg');
    const urlSubida = await storage.subirArchivo(buffer, `audio-${Date.now()}.ogg`, 'audio/ogg');
    session.setUltimoAudio(ctx.chat.id, { url: urlSubida, transcripcion: texto });
    await ctx.reply(`🎙️ Entendí: "${texto}"`);
    await procesarTexto(ctx, texto);
  } catch (err) {
    console.error('Error interpretando audio:', err);
    ctx.reply('No pude entender ese audio. Probá de nuevo o escribilo por texto.');
  }
});

async function procesarConArchivo(ctx, texto, buffer, mimeType) {
  if (session.get(ctx.chat.id)) return ctx.reply('Recibí el archivo, pero estás en medio de completar otra cosa. Escribí /cancelar primero.');
  try {
    await ctx.sendChatAction('typing');
    const historial = session.obtenerHistorial(ctx.chat.id);
    const respuesta = await ia.conversar(historial, texto, (n, a) => ejecutarHerramienta(ctx, n, a), [{ mimeType, data: buffer.toString('base64') }]);
    session.podarHistorial(ctx.chat.id);
    await ctx.reply(respuesta);
  } catch (err) {
    console.error('Error procesando archivo:', err);
    session.limpiarHistorial(ctx.chat.id);
    ctx.reply('No pude procesar ese archivo. Probá de nuevo.');
  }
}

bot.on('photo', async (ctx) => {
  try {
    const tamanos = ctx.message.photo;
    const url = await ctx.telegram.getFileLink(tamanos[tamanos.length - 1].file_id);
    const buffer = Buffer.from(await (await fetch(url)).arrayBuffer());
    const urlSubida = await storage.subirFoto(buffer, `foto-${Date.now()}.jpg`);
    session.setUltimaFotoUrl(ctx.chat.id, urlSubida);
    const texto = ctx.message.caption || 'Te mando una foto, fijate qué es y decime qué te parece o ayudame con lo que corresponda.';
    await procesarConArchivo(ctx, texto, buffer, 'image/jpeg');
  } catch (err) {
    console.error('Error procesando foto:', err);
    ctx.reply('No pude procesar esa foto. Probá de nuevo.');
  }
});

bot.on('document', async (ctx) => {
  try {
    const doc = ctx.message.document;
    const url = await ctx.telegram.getFileLink(doc.file_id);
    const buffer = Buffer.from(await (await fetch(url)).arrayBuffer());
    const urlSubida = await storage.subirArchivo(buffer, doc.file_name || `documento-${Date.now()}`, doc.mime_type);
    session.setUltimoDocumentoUrl(ctx.chat.id, { url: urlSubida, nombre: doc.file_name || 'documento' });
    const texto = ctx.message.caption || `Te mando un documento (${doc.file_name || 'sin nombre'}). Dame un resumen corto de lo importante y ayudame con lo que corresponda.`;
    await procesarConArchivo(ctx, texto, buffer, doc.mime_type || 'application/octet-stream');
  } catch (err) {
    console.error('Error procesando documento:', err);
    ctx.reply('No pude procesar ese documento. Probá con una foto o un PDF.');
  }
});

// ================= HELPERS =================

async function enviarDocumentoConReintento(ctx, opciones, intentos = 2) {
  for (let i = 1; i <= intentos; i++) {
    try {
      return await ctx.replyWithDocument(opciones);
    } catch (err) {
      console.error(`Intento ${i} de enviar documento falló:`, err.message);
      if (i === intentos) throw err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

function numFmt(n) {
  return String(n).padStart(4, '0');
}

async function resolverCliente(ctx, args) {
  if (args.cliente_id) {
    try {
      const c = await clientes.obtenerCliente(args.cliente_id);
      session.setClienteActivo(ctx.chat.id, c.id);
      return c;
    } catch (e) {}
  }
  const nombre = args.cliente_nombre;
  if (!nombre) {
    // Sin nombre: usamos el cliente activo de la charla, si hay uno.
    const activoId = session.obtenerClienteActivo(ctx.chat.id);
    if (activoId) {
      try { return await clientes.obtenerCliente(activoId); } catch (e) {}
    }
    return null;
  }
  const encontrados = await clientes.buscarClientesPorNombre(nombre);
  if (!encontrados.length) return null;
  if (encontrados.length === 1) {
    session.setClienteActivo(ctx.chat.id, encontrados[0].id);
    return encontrados[0];
  }
  const opciones = await Promise.all(encontrados.map((c) => clientes.infoParaDistinguir(c.id)));
  return { multiple: true, opciones };
}

function errorClienteNoEncontrado(nombre) {
  return { error: `No encontré ningún cliente llamado "${nombre}". Sugerile cargarlo primero con crear_cliente.` };
}
function errorClienteAmbiguo(opciones) {
  return { error: 'Hay varios clientes que coinciden. Preguntale al usuario cuál es, usando estos datos para distinguirlos.', opciones };
}

async function resolverClienteConPresupuesto(args) {
  if (args.cliente_id) {
    const cliente = await clientes.obtenerCliente(args.cliente_id).catch(() => null);
    if (cliente) {
      const presupuesto = await presupuestos.obtenerUltimoPresupuesto(cliente.id);
      if (!presupuesto) return { error: `${cliente.nombre} no tiene un presupuesto activo.` };
      return { cliente, presupuesto };
    }
  }
  const nombre = args.cliente_nombre;
  if (!nombre) return { error: 'Falta el nombre del cliente.' };
  const encontrados = await clientes.buscarClientesPorNombre(nombre);
  if (!encontrados.length) return errorClienteNoEncontrado(nombre);
  const conPresupuesto = [];
  for (const c of encontrados) {
    const p = await presupuestos.obtenerUltimoPresupuesto(c.id);
    if (p) conPresupuesto.push({ cliente: c, presupuesto: p });
  }
  if (!conPresupuesto.length) return { error: `Ningún cliente llamado "${nombre}" tiene un presupuesto activo en este momento.` };
  if (conPresupuesto.length === 1) return conPresupuesto[0];
  const opciones = conPresupuesto.map(({ cliente, presupuesto }) => ({
    cliente_id: cliente.id, nombre: cliente.nombre, direccion: cliente.direccion || 'sin dirección', presupuesto: presupuesto.descripcion, monto: presupuesto.monto,
  }));
  return { error: `Hay varios clientes llamados "${nombre}" con presupuesto activo. Preguntale al usuario cuál es usando estos datos.`, opciones };
}

// Resuelve un cliente y su próxima visita pendiente (para completar/reagendar/cancelar)
async function resolverClienteConVisita(ctx, args) {
  const cliente = await resolverCliente(ctx, args);
  if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
  if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
  const visita = await visitas.proximaVisitaPendiente(cliente.id);
  if (!visita) return { error: `${cliente.nombre} no tiene ninguna visita agendada pendiente.` };
  session.setVisitaActiva(ctx.chat.id, visita.id);
  return { cliente, visita };
}

function rangoFechas(rango, fechaEspecifica) {
  if (fechaEspecifica) {
    const dia = new Date(fechaEspecifica);
    const inicio = new Date(dia); inicio.setHours(0, 0, 0, 0);
    const fin = new Date(dia); fin.setHours(23, 59, 59, 999);
    return { desde: inicio.toISOString(), hasta: fin.toISOString() };
  }
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date();
  if (rango === 'manana') {
    inicio.setDate(inicio.getDate() + 1);
    fin.setDate(fin.getDate() + 1);
    fin.setHours(23, 59, 59, 999);
  } else if (rango === 'semana') {
    fin.setDate(fin.getDate() + 7);
    fin.setHours(23, 59, 59, 999);
  } else if (rango === 'mes') {
    fin.setDate(fin.getDate() + 30);
    fin.setHours(23, 59, 59, 999);
  } else {
    fin.setHours(23, 59, 59, 999);
  }
  return { desde: inicio.toISOString(), hasta: fin.toISOString() };
}

// ================= HERRAMIENTAS QUE LA IA PUEDE USAR =================

async function ejecutarHerramienta(ctx, nombre, args) {
  switch (nombre) {
    // ---- CLIENTES ----
    case 'buscar_cliente': {
      const encontrados = await clientes.buscarClientesPorNombre(args.nombre || '');
      if (!encontrados.length) return { encontrado: false };
      for (const c of encontrados.slice(0, 5)) await ctx.reply(formatearFicha(await clientes.fichaCompleta(c.id)));
      if (encontrados.length > 1) return { encontrado: true, cantidad: encontrados.length, opciones: await Promise.all(encontrados.map((c) => clientes.infoParaDistinguir(c.id))) };
      return { encontrado: true, cantidad: 1, cliente_id: encontrados[0].id };
    }
    case 'crear_cliente': {
      const cliente = await clientes.crearCliente({
        nombre: args.nombre, telefono: args.telefono || null, direccion: args.direccion || null,
        notas: args.notas || null, apodo: args.apodo || null, referido_por: args.referido_por || null,
        categoria: args.categoria || null, cumpleanos: args.cumpleanos_iso || null, horario_preferido: args.horario_preferido || null,
        relacion: args.relacion || null, descuento_habitual: args.descuento_habitual || 0, contacto_secundario: args.contacto_secundario || null,
      });
      session.setClienteActivo(ctx.chat.id, cliente.id);
      return { ok: true, nombre: cliente.nombre, cliente_id: cliente.id };
    }
    case 'editar_cliente': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const cambios = {};
      if (args.nuevo_nombre) cambios.nombre = args.nuevo_nombre;
      if (args.nuevo_telefono) cambios.telefono = args.nuevo_telefono;
      if (args.nueva_direccion) cambios.direccion = args.nueva_direccion;
      if (args.nuevo_apodo) cambios.apodo = args.nuevo_apodo;
      if (args.nuevas_notas) cambios.notas = args.nuevas_notas;
      if (args.nueva_categoria) cambios.categoria = args.nueva_categoria;
      if (args.prioritario !== undefined) cambios.prioritario = args.prioritario;
      if (args.bloqueado !== undefined) cambios.bloqueado = args.bloqueado;
      if (args.cumpleanos_iso) cambios.cumpleanos = args.cumpleanos_iso;
      if (args.nuevo_horario_preferido) cambios.horario_preferido = args.nuevo_horario_preferido;
      if (args.nueva_relacion) cambios.relacion = args.nueva_relacion;
      if (args.nuevo_descuento_habitual !== undefined) cambios.descuento_habitual = args.nuevo_descuento_habitual;
      if (args.nuevo_contacto_secundario) cambios.contacto_secundario = args.nuevo_contacto_secundario;
      if (!Object.keys(cambios).length) return { error: 'No se especificó qué corregir.' };
      const actualizado = await clientes.actualizarCliente(cliente.id, cambios);
      return { ok: true, cliente_id: actualizado.id, nombre: actualizado.nombre };
    }
    case 'eliminar_cliente': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      if (args.permanente) {
        await clientes.eliminarClientePermanente(cliente.id);
        return { ok: true, mensaje: `Cliente ${cliente.nombre} borrado definitivamente.` };
      }
      await clientes.archivarCliente(cliente.id);
      return { ok: true, mensaje: `Cliente ${cliente.nombre} borrado (se puede restaurar).` };
    }
    case 'restaurar_cliente': {
      const archivado = await clientes.buscarClienteArchivado(args.cliente_nombre || '');
      if (!archivado) return { error: `No encontré ningún cliente borrado que coincida con "${args.cliente_nombre}".` };
      await clientes.restaurarCliente(archivado.id);
      return { ok: true, nombre: archivado.nombre };
    }

    // ---- PRESUPUESTOS ----
    case 'buscar_clientes_por_categoria': {
      const lista = await clientes.buscarClientesPorCategoria(args.categoria || '');
      if (!lista.length) { await ctx.reply(`No tenés clientes en la categoría "${args.categoria}".`); return { cantidad: 0 }; }
      let msg = `📋 Categoría "${args.categoria}":\n\n`;
      lista.forEach((c) => { msg += `• ${c.nombre}${c.telefono ? ' - ' + c.telefono : ''}\n`; });
      await ctx.reply(msg);
      return { cantidad: lista.length };
    }
    case 'buscar_cliente_por_telefono': {
      const lista = await clientes.buscarPorTelefono(args.telefono || '');
      if (!lista.length) return { encontrado: false };
      return { encontrado: true, clientes: lista.map((c) => ({ nombre: c.nombre, id: c.id })) };
    }
    case 'listar_clientes_recientes': {
      const lista = await clientes.clientesRecientes(10);
      if (!lista.length) { await ctx.reply('No tenés clientes cargados todavía.'); return { cantidad: 0 }; }
      let msg = '👥 Clientes recientes:\n\n';
      lista.forEach((c) => { msg += `• ${c.nombre}${c.apodo ? ' (' + c.apodo + ')' : ''}\n`; });
      await ctx.reply(msg);
      return { cantidad: lista.length };
    }
    case 'combinar_clientes': {
      const aConservar = await clientes.buscarClientesPorNombre(args.nombre_a_conservar || '');
      const aFusionar = await clientes.buscarClientesPorNombre(args.nombre_a_fusionar || '');
      if (!aConservar.length || !aFusionar.length) return { error: 'No encontré alguno de los dos clientes mencionados.' };
      if (aConservar.length > 1 || aFusionar.length > 1) return { error: 'Hay más de un cliente con alguno de esos nombres, sé más específico.' };
      await clientes.combinarClientes(aFusionar[0].id, aConservar[0].id);
      return { ok: true, mensaje: `Se unió todo el historial de "${aFusionar[0].nombre}" dentro de "${aConservar[0].nombre}".` };
    }
    case 'agregar_direccion_cliente': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      await clientes.agregarDireccion(cliente.id, args.etiqueta, args.direccion);
      return { ok: true };
    }
    case 'registrar_satisfaccion': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const ultimo = await trabajos.obtenerUltimoTrabajo(cliente.id);
      if (!ultimo) return { error: `${cliente.nombre} no tiene trabajos registrados.` };
      await trabajos.registrarSatisfaccion(ultimo.id, args.satisfaccion);
      return { ok: true };
    }
    case 'consultar_clientes_en_silencio': {
      const lista = await clientes.clientesEnSilencio(args.meses || 6);
      if (!lista.length) { await ctx.reply('No hay clientes en silencio por ahora. 👍'); return { cantidad: 0 }; }
      let msg = '🔇 Clientes sin contacto hace tiempo:\n\n';
      lista.forEach((c) => { msg += `• ${c.nombre} (último contacto: ${c.ultimo_contacto})\n`; });
      await ctx.reply(msg);
      return { cantidad: lista.length };
    }
    case 'consultar_rechazados_para_reintentar': {
      const lista = await presupuestos.rechazadosParaReintentar(3);
      if (!lista.length) { await ctx.reply('No hay presupuestos rechazados para reintentar por ahora.'); return { cantidad: 0 }; }
      let msg = '🔁 Presupuestos rechazados que podrías reintentar:\n\n';
      lista.forEach((p) => { msg += `• ${p.clientes?.nombre} - ${p.descripcion} ($${p.monto})\n`; });
      await ctx.reply(msg);
      return { cantidad: lista.length };
    }
    case 'consultar_trabajos_repetidos': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const lista = await trabajos.trabajosRepetidos(cliente.id, 6);
      return { cantidad: lista.length, trabajos: lista.map((t) => t.descripcion) };
    }

    case 'guardar_plantilla_presupuesto': {
      await plantillas.guardarPlantilla(args.nombre, args.items || []);
      return { ok: true };
    }
    case 'crear_presupuesto_desde_plantilla': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const plantilla = await plantillas.buscarPlantilla(args.nombre_plantilla || '');
      if (!plantilla) return { error: `No encontré ninguna plantilla llamada "${args.nombre_plantilla}".` };
      const creado = await presupuestos.crearPresupuesto({ cliente_id: cliente.id, items: plantilla.items });
      const vencimiento = new Date(); vencimiento.setDate(vencimiento.getDate() + 15);
      await cobros.crearCobro({ cliente_id: cliente.id, presupuesto_id: creado.id, monto: creado.monto, fecha_vencimiento: vencimiento.toISOString().slice(0, 10) });
      session.setPresupuestoActivo(ctx.chat.id, creado.id);
      return { ok: true, items: creado.items.map((i) => ({ descripcion: i.descripcion, monto: i.monto })), total: creado.monto, cliente_id: cliente.id };
    }
    case 'repetir_presupuesto': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const nuevo = await presupuestos.repetirPresupuesto(cliente.id, { monto: args.nuevo_monto });
      if (!nuevo) return { error: `${cliente.nombre} no tiene un presupuesto anterior para repetir.` };
      const vencimiento = new Date(); vencimiento.setDate(vencimiento.getDate() + 15);
      await cobros.crearCobro({ cliente_id: cliente.id, presupuesto_id: nuevo.id, monto: nuevo.monto, fecha_vencimiento: vencimiento.toISOString().slice(0, 10) });
      session.setPresupuestoActivo(ctx.chat.id, nuevo.id);
      return { ok: true, items: nuevo.items.map((i) => ({ descripcion: i.descripcion, monto: i.monto })), total: nuevo.monto, cliente_id: cliente.id };
    }
    case 'crear_presupuestos_lote': {
      const resultados = [];
      for (const item of args.lista || []) {
        const cliente = await resolverCliente(ctx, { cliente_nombre: item.cliente_nombre });
        if (!cliente || cliente.multiple) { resultados.push({ cliente_nombre: item.cliente_nombre, error: true }); continue; }
        const creado = await presupuestos.crearPresupuesto({ cliente_id: cliente.id, items: item.items });
        const vencimiento = new Date(); vencimiento.setDate(vencimiento.getDate() + 15);
        await cobros.crearCobro({ cliente_id: cliente.id, presupuesto_id: creado.id, monto: creado.monto, fecha_vencimiento: vencimiento.toISOString().slice(0, 10) });
        resultados.push({ cliente_nombre: cliente.nombre, total: creado.monto, ok: true });
      }
      return { resultados };
    }
    case 'deshacer_ultima_accion': {
      const ultima = session.obtenerUltimaAccion(ctx.chat.id);
      if (!ultima) return { error: 'No tengo registrada ninguna acción reciente para deshacer.' };
      return { error: 'Por ahora puedo avisarte cuál fue la última acción, pero deshacerla automáticamente todavía no está soportado para este tipo de cambio. Decime qué corregir y lo hago manualmente.', ultima_accion: ultima };
    }
    case 'consultar_historial_presupuesto': {
      const r = await resolverClienteConPresupuesto(args);
      if (r.error) return r;
      const historial = await presupuestos.obtenerHistorial(r.presupuesto.id);
      return { cambios: historial.map((h) => ({ cambio: h.cambio, fecha: h.creado_en })) };
    }
    case 'consultar_tasa_conversion': {
      const mes = args.mes_iso || new Date().toISOString().slice(0, 7);
      const desde = `${mes}-01T00:00:00.000Z`;
      const finMes = new Date(`${mes}-01`); finMes.setMonth(finMes.getMonth() + 1);
      const resultado = await presupuestos.tasaConversion(desde, finMes.toISOString());
      return resultado;
    }
    case 'contar_presupuestos_hoy': {
      const cantidadPresupuestos = await presupuestos.contarHoy();
      const cantidadRecibos = await recibos.contarHoy();
      return { presupuestos_hoy: cantidadPresupuestos, recibos_hoy: cantidadRecibos };
    }
    case 'activar_modo_rapido': {
      session.setModoRapido(ctx.chat.id, args.activar !== false);
      return { ok: true, activo: args.activar !== false };
    }
    case 'exportar_mes_presupuestos': {
      const mes = args.mes_iso || new Date().toISOString().slice(0, 7);
      const desde = `${mes}-01T00:00:00.000Z`;
      const finMes = new Date(`${mes}-01`); finMes.setMonth(finMes.getMonth() + 1);
      const lista = await presupuestos.presupuestosEnRango(desde, finMes.toISOString());
      if (!lista.length) { await ctx.reply(`No hay presupuestos en ${mes}.`); return { cantidad: 0 }; }
      const dias = [{ etiqueta: `Presupuestos de ${mes}`, items: lista.map((p) => ({ hora: '', texto: `${p.clientes?.nombre}: ${p.descripcion} - $${p.monto} [${p.estado}]` })) }];
      const buffer = await pdf.generarAgendaPdf({ titulo: `Presupuestos - ${mes}`, dias });
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `presupuestos-${mes}.pdf` });
      return { ok: true, cantidad: lista.length };
    }
    case 'guardar_foto': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const url = session.obtenerUltimaFotoUrl(ctx.chat.id);
      if (!url) return { error: 'No tengo ninguna foto reciente para guardar. Mandala primero.' };
      const activo = await presupuestos.obtenerUltimoPresupuesto(cliente.id);
      await fotos.guardarFoto({ cliente_id: cliente.id, presupuesto_id: activo?.id || null, url, descripcion: args.descripcion || null, etiqueta: args.etiqueta || null });
      return { ok: true };
    }
    case 'ver_fotos_cliente': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const lista = await fotos.fotosDeCliente(cliente.id);
      if (!lista.length) { await ctx.reply(`${cliente.nombre} no tiene fotos guardadas.`); return { cantidad: 0 }; }
      for (const f of lista.slice(0, 6)) {
        await ctx.replyWithPhoto(f.url, { caption: f.etiqueta ? `${f.etiqueta}${f.descripcion ? ' - ' + f.descripcion : ''}` : f.descripcion || undefined });
      }
      return { cantidad: lista.length };
    }
    case 'guardar_documento_cliente': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const doc = session.obtenerUltimoDocumentoUrl(ctx.chat.id);
      if (!doc) return { error: 'No tengo ningún documento reciente para guardar. Mandalo primero.' };
      const activo = await presupuestos.obtenerUltimoPresupuesto(cliente.id);
      await documentos.guardarDocumento({ cliente_id: cliente.id, presupuesto_id: activo?.id || null, url: doc.url, nombre_archivo: doc.nombre, resumen: args.resumen || null });
      return { ok: true };
    }
    case 'guardar_audio_nota': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const audio = session.obtenerUltimoAudio(ctx.chat.id);
      if (!audio) return { error: 'No tengo ningún audio reciente para guardar. Mandalo primero.' };
      await audios.guardarAudio({ cliente_id: cliente.id, url: audio.url, transcripcion: audio.transcripcion });
      return { ok: true };
    }
    case 'registrar_gasto_desde_ticket': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const ultimo = await trabajos.obtenerUltimoTrabajo(cliente.id);
      if (!ultimo) return { error: `${cliente.nombre} no tiene trabajos registrados para asociarle este gasto.` };
      const nuevoGasto = Number(ultimo.gasto_materiales || 0) + Number(args.monto);
      await trabajos.editarTrabajo(ultimo.id, { gasto_materiales: nuevoGasto });
      return { ok: true, gasto_total: nuevoGasto };
    }
    case 'listar_archivos_recientes': {
      const lista = await fotos.fotosRecientes(10);
      if (!lista.length) { await ctx.reply('No tenés archivos guardados todavía.'); return { cantidad: 0 }; }
      let msg = '📎 Archivos recientes:\n\n';
      lista.forEach((f) => { msg += `• ${f.clientes?.nombre || 'Sin cliente'}${f.etiqueta ? ' (' + f.etiqueta + ')' : ''}\n`; });
      await ctx.reply(msg);
      return { cantidad: lista.length };
    }
    case 'consultar_rentabilidad': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const ultimo = await trabajos.obtenerUltimoTrabajo(cliente.id);
      if (!ultimo) return { error: `${cliente.nombre} no tiene trabajos registrados.` };
      return await trabajos.rentabilidad(ultimo.id);
    }

    case 'crear_presupuesto': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const items = args.items && args.items.length ? args.items : [];
      if (!items.length) return { error: 'No se especificaron ítems para el presupuesto.' };
      const creado = await presupuestos.crearPresupuesto({ cliente_id: cliente.id, items, dias_validez: args.dias_validez || 15 });
      const vencimiento = new Date();
      vencimiento.setDate(vencimiento.getDate() + (args.dias_validez || 15));
      const cobro = await cobros.crearCobro({ cliente_id: cliente.id, presupuesto_id: creado.id, monto: creado.monto, fecha_vencimiento: vencimiento.toISOString().slice(0, 10) });
      session.setPresupuestoActivo(ctx.chat.id, creado.id);
      session.guardarUltimaAccion(ctx.chat.id, { tipo: 'crear_presupuesto', presupuesto_id: creado.id, cobro_id: cobro.id, descripcion: `presupuesto de ${cliente.nombre}` });
      if (!args.generar_pdf) {
        return { ok: true, mensaje: 'Presupuesto guardado (sin PDF). Deuda registrada.', numero: numFmt(creado.numero), items: creado.items.map((i) => ({ descripcion: i.descripcion, monto: i.monto })), total: creado.monto, cliente_id: cliente.id };
      }
      const buffer = await pdf.generarPresupuesto({
        cliente, items, numero: numFmt(creado.numero), diasValidez: args.dias_validez || 15, direccionTrabajo: args.direccion_trabajo, alcance: args.alcance_texto,
        incluirAlcance: args.incluir_alcance !== false, garantia: args.garantia_texto, incluirGarantia: args.incluir_garantia !== false,
        formaPago: args.forma_pago_texto, incluirFormaPago: args.incluir_forma_pago !== false,
      });
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `presupuesto-${cliente.nombre}.pdf` });
      return { ok: true, mensaje: 'Presupuesto creado y PDF enviado. Deuda registrada.', cliente_id: cliente.id };
    }
    case 'agregar_items_presupuesto': {
      const r = await resolverClienteConPresupuesto(args);
      if (r.error) return r;
      const { cliente, presupuesto: ultimo } = r;
      const { items } = await presupuestos.agregarItems(ultimo.id, args.items || []);
      if (!args.generar_pdf) return { ok: true, mensaje: 'Ítems agregados. Deuda actualizada.', items: items.map((i) => ({ descripcion: i.descripcion, monto: i.monto })), cliente_id: cliente.id };
      const buffer = await pdf.generarPresupuesto({ cliente, items, numero: numFmt(ultimo.numero) });
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `presupuesto-${cliente.nombre}.pdf` });
      return { ok: true, cliente_id: cliente.id };
    }
    case 'quitar_items_presupuesto': {
      const r = await resolverClienteConPresupuesto(args);
      if (r.error) return r;
      const { cliente, presupuesto: ultimo } = r;
      const itemsActuales = await presupuestos.obtenerItems(ultimo.id);
      const busquedas = (args.descripciones_items || []).map((s) => s.toLowerCase());
      const idsAQuitar = itemsActuales.filter((it) => busquedas.some((b) => it.descripcion.toLowerCase().includes(b))).map((it) => it.id);
      if (!idsAQuitar.length) return { error: 'No encontré ítems que coincidan con esa descripción.' };
      const { items } = await presupuestos.quitarItems(ultimo.id, idsAQuitar, !!args.permanente);
      if (!args.generar_pdf) return { ok: true, items_quitados: idsAQuitar.length, items_restantes: items.map((i) => ({ descripcion: i.descripcion, monto: i.monto })), cliente_id: cliente.id };
      if (items.length) {
        const buffer = await pdf.generarPresupuesto({ cliente, items, numero: numFmt(ultimo.numero) });
        await enviarDocumentoConReintento(ctx, { source: buffer, filename: `presupuesto-${cliente.nombre}.pdf` });
      }
      return { ok: true, items_quitados: idsAQuitar.length, cliente_id: cliente.id };
    }
    case 'editar_presupuesto': {
      const r = await resolverClienteConPresupuesto(args);
      if (r.error) return r;
      const { cliente, presupuesto: ultimo } = r;
      const cambios = {};
      if (args.nuevo_monto) cambios.monto = args.nuevo_monto;
      if (args.nueva_descripcion) cambios.descripcion = args.nueva_descripcion;
      if (!Object.keys(cambios).length) return { error: 'No se especificó qué cambiar.' };
      const actualizado = await presupuestos.actualizarPresupuesto(ultimo.id, cambios);
      return { ok: true, descripcion: actualizado.descripcion, monto: actualizado.monto, cliente_id: cliente.id };
    }
    case 'cambiar_estado_presupuesto': {
      const r = await resolverClienteConPresupuesto(args);
      if (r.error) return r;
      const { cliente, presupuesto: ultimo } = r;
      const validos = ['aceptado', 'rechazado', 'no_concretado', 'pendiente'];
      if (!validos.includes(args.estado)) return { error: `Estado inválido: ${args.estado}` };
      await presupuestos.cambiarEstado(ultimo.id, args.estado);
      return { ok: true, mensaje: `Presupuesto de ${cliente.nombre} marcado como ${args.estado}.` };
    }
    case 'reenviar_presupuesto': {
      const r = await resolverClienteConPresupuesto(args);
      if (r.error) return r;
      const { cliente, presupuesto: ultimo } = r;
      const items = ultimo.presupuesto_items?.filter((i) => !i.archivado) || [{ descripcion: ultimo.descripcion, monto: ultimo.monto }];
      const buffer = await pdf.generarPresupuesto({
        cliente, items, numero: numFmt(ultimo.numero), direccionTrabajo: args.direccion_trabajo, alcance: args.alcance_texto,
        incluirAlcance: args.incluir_alcance !== false, garantia: args.garantia_texto, incluirGarantia: args.incluir_garantia !== false,
        formaPago: args.forma_pago_texto, incluirFormaPago: args.incluir_forma_pago !== false,
      });
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `presupuesto-${cliente.nombre}.pdf` });
      return { ok: true, cliente_id: cliente.id };
    }
    case 'eliminar_presupuesto': {
      const r = await resolverClienteConPresupuesto(args);
      if (r.error) return r;
      const { presupuesto: ultimo } = r;
      if (args.permanente) {
        await presupuestos.eliminarPresupuestoPermanente(ultimo.id);
        return { ok: true, mensaje: 'Presupuesto borrado definitivamente.' };
      }
      await presupuestos.archivarPresupuesto(ultimo.id);
      return { ok: true, mensaje: 'Presupuesto borrado (se puede restaurar). La deuda asociada también se canceló.' };
    }
    case 'restaurar_presupuesto': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const archivado = await presupuestos.ultimoArchivado(cliente.id);
      if (!archivado) return { error: `${cliente.nombre} no tiene presupuestos borrados para restaurar.` };
      await presupuestos.restaurarPresupuesto(archivado.id);
      return { ok: true };
    }
    case 'listar_presupuestos': {
      const lista = await presupuestos.listarTodos();
      if (!lista.length) { await ctx.reply('No tenés presupuestos guardados todavía.'); return { cantidad: 0 }; }
      let msg = '📋 Presupuestos guardados:\n\n';
      lista.forEach((p) => { msg += `• ${p.clientes?.nombre || 'Cliente'} - ${p.descripcion} - $${p.monto} [${p.estado}]\n`; });
      await ctx.reply(msg);
      return { cantidad: lista.length };
    }

    case 'listar_presupuestos_archivados': {
      const lista = await presupuestos.presupuestosArchivados();
      if (!lista.length) { await ctx.reply('No tenés presupuestos borrados temporalmente. 👍'); return { cantidad: 0 }; }
      let msg = '🗑️ Presupuestos borrados temporalmente:\n\n';
      lista.forEach((p) => { msg += `• ${p.clientes?.nombre || 'Cliente'} - ${p.descripcion} ($${p.monto})\n`; });
      await ctx.reply(msg);
      return { cantidad: lista.length };
    }

    // ---- RECIBOS ----
    case 'crear_recibo': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      let concepto = args.concepto, monto = args.monto, items = null;
      if (!concepto && !monto) {
        const activo = await presupuestos.obtenerUltimoPresupuesto(cliente.id);
        if (activo) {
          items = activo.presupuesto_items?.filter((i) => !i.archivado);
          if (!items || !items.length) items = [{ descripcion: activo.descripcion, monto: activo.monto }];
          monto = activo.monto; concepto = activo.descripcion;
        }
      }
      if (!concepto && !monto && !items) return { error: `Faltan datos y ${cliente.nombre} no tiene presupuesto activo. Preguntale al usuario.` };
      const registrado = await recibos.crearRecibo({ cliente_id: cliente.id, concepto, monto, es_pago_parcial: !!args.es_pago_parcial });
      const buffer = await pdf.generarRecibo({ cliente, items, monto, concepto, numero: numFmt(registrado.numero), esPagoParcial: !!args.es_pago_parcial });
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `recibo-${cliente.nombre}.pdf` });
      const cobrosCliente = await cobros.obtenerCobrosPorCliente(cliente.id);
      const pendiente = cobrosCliente.find((c) => c.estado === 'pendiente');
      if (pendiente) {
        if (args.es_pago_parcial) {
          await cobros.registrarPagoParcial(pendiente.id, monto);
        } else {
          await cobros.marcarCobrado(pendiente.id);
        }
      }
      return { ok: true, mensaje: 'Recibo generado y enviado.', deuda_saldada: !!pendiente && !args.es_pago_parcial, cliente_id: cliente.id };
    }

    // ---- COBROS ----
    case 'consultar_pendientes': {
      const lista = await cobros.cobrosPendientes();
      if (!lista.length) { await ctx.reply('No tenés cobros pendientes. 👍'); return { cantidad: 0 }; }
      let msg = '💰 Cobros pendientes:\n\n';
      lista.forEach((c) => {
        const restante = Number(c.monto) - Number(c.monto_pagado || 0);
        msg += `• ${c.clientes?.nombre || 'Cliente'} - $${restante}${c.monto_pagado > 0 ? ` (de $${c.monto}, pagó $${c.monto_pagado})` : ''}${c.fecha_vencimiento ? ' (vence ' + c.fecha_vencimiento + ')' : ''}\n`;
      });
      await ctx.reply(msg);
      return { cantidad: lista.length };
    }
    case 'registrar_pago_parcial': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const lista = await cobros.obtenerCobrosPorCliente(cliente.id);
      const pendiente = lista.find((c) => c.estado === 'pendiente');
      if (!pendiente) return { error: `${cliente.nombre} no tiene cobros pendientes.` };
      const actualizado = await cobros.registrarPagoParcial(pendiente.id, args.monto, args.metodo_pago);
      session.setCobroActivo(ctx.chat.id, pendiente.id);
      const restante = Number(actualizado.monto) - Number(actualizado.monto_pagado);
      return { ok: true, estado: actualizado.estado, restante: restante > 0 ? restante : 0, cliente_id: cliente.id };
    }
    case 'eliminar_cobro': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const lista = await cobros.obtenerCobrosPorCliente(cliente.id);
      if (!lista.length) return { error: `${cliente.nombre} no tiene cobros guardados.` };
      if (args.permanente) { await cobros.eliminarCobroPermanente(lista[0].id); return { ok: true, mensaje: 'Cobro borrado definitivamente.' }; }
      await cobros.archivarCobro(lista[0].id);
      return { ok: true, mensaje: 'Cobro borrado (se puede restaurar).' };
    }
    case 'restaurar_cobro': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const archivado = await cobros.ultimoArchivado(cliente.id);
      if (!archivado) return { error: `${cliente.nombre} no tiene cobros borrados para restaurar.` };
      await cobros.restaurarCobro(archivado.id);
      return { ok: true };
    }
    case 'consultar_historial_pagos': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const lista = await cobros.historialPagos(cliente.id);
      return { pagos: lista.map((c) => ({ monto: c.monto, fecha: c.fecha_cobro, metodo: c.metodo_pago || 'sin especificar' })) };
    }
    case 'crear_plan_cuotas': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const lista = await cobros.obtenerCobrosPorCliente(cliente.id);
      const pendiente = lista.find((c) => c.estado === 'pendiente');
      if (!pendiente) return { error: `${cliente.nombre} no tiene una deuda pendiente para dividir en cuotas.` };
      const primeraFecha = args.primera_fecha_iso || new Date().toISOString().slice(0, 10);
      const cuotas = await cobros.crearCuotas(pendiente.id, args.cantidad_cuotas, Number(pendiente.monto) - Number(pendiente.monto_pagado || 0), primeraFecha);
      session.setCobroActivo(ctx.chat.id, pendiente.id);
      return { ok: true, cuotas: cuotas.map((c) => ({ numero: c.numero_cuota, monto: c.monto, vence: c.fecha_vencimiento })) };
    }
    case 'pagar_cuota': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const lista = await cobros.obtenerCobrosPorCliente(cliente.id);
      const pendiente = lista.find((c) => c.estado === 'pendiente') || lista[0];
      if (!pendiente) return { error: `${cliente.nombre} no tiene un plan de cuotas.` };
      const cuotas = await cobros.cuotasPorCobro(pendiente.id);
      const cuota = cuotas.find((c) => c.numero_cuota === args.numero_cuota);
      if (!cuota) return { error: `No encontré la cuota número ${args.numero_cuota}.` };
      await cobros.pagarCuota(cuota.id);
      return { ok: true };
    }
    case 'aplicar_recargo': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const lista = await cobros.obtenerCobrosPorCliente(cliente.id);
      const pendiente = lista.find((c) => c.estado === 'pendiente');
      if (!pendiente) return { error: `${cliente.nombre} no tiene una deuda pendiente.` };
      const actualizado = await cobros.aplicarRecargo(pendiente.id, args.porcentaje);
      return { ok: true, nuevo_monto: actualizado.monto };
    }
    case 'aplicar_descuento_pronto_pago': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const lista = await cobros.obtenerCobrosPorCliente(cliente.id);
      const pendiente = lista.find((c) => c.estado === 'pendiente');
      if (!pendiente) return { error: `${cliente.nombre} no tiene una deuda pendiente.` };
      await cobros.aplicarDescuentoProntoPago(pendiente.id, args.porcentaje, args.fecha_limite_iso);
      return { ok: true };
    }
    case 'guardar_comprobante_pago': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const url = session.obtenerUltimaFotoUrl(ctx.chat.id);
      if (!url) return { error: 'No tengo ninguna foto reciente para guardar como comprobante. Mandala primero.' };
      const lista = await cobros.obtenerCobrosPorCliente(cliente.id);
      const pendiente = lista.find((c) => c.estado === 'pendiente');
      await fotos.guardarFoto({ cliente_id: cliente.id, cobro_id: pendiente?.id || null, url, descripcion: 'Comprobante de pago' });
      return { ok: true };
    }
    case 'consultar_deudas_por_antiguedad': {
      const grupos = await cobros.deudasPorAntiguedad();
      return {
        recientes: grupos.recientes.map((c) => c.clientes?.nombre),
        entre_30_y_60_dias: grupos.treinta.map((c) => c.clientes?.nombre),
        mas_de_60_dias: grupos.sesenta.map((c) => c.clientes?.nombre),
      };
    }
    case 'consultar_estado_caja': {
      const pendientes = await cobros.cobrosPendientes();
      const totalPendiente = pendientes.reduce((acc, c) => acc + (Number(c.monto) - Number(c.monto_pagado || 0)), 0);
      const caja = await cobros.cajaDelDia();
      const proyeccion = await cobros.proyeccionIngresos(15);
      return { total_pendiente: totalPendiente, cobrado_hoy_por_metodo: caja, proyeccion_15_dias: proyeccion };
    }
    case 'consultar_reporte_metodo_pago': {
      const mes = args.mes_iso || new Date().toISOString().slice(0, 7);
      const desde = `${mes}-01`;
      const finMes = new Date(desde); finMes.setMonth(finMes.getMonth() + 1);
      const porMetodo = await cobros.reportePorMetodo(desde, finMes.toISOString().slice(0, 10));
      return { por_metodo: porMetodo };
    }
    case 'generar_mensaje_reclamo': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const lista = await cobros.obtenerCobrosPorCliente(cliente.id);
      const pendiente = lista.find((c) => c.estado === 'pendiente');
      if (!pendiente) return { error: `${cliente.nombre} no tiene deudas pendientes.` };
      return {
        cliente: cliente.nombre,
        telefono: cliente.telefono,
        monto: Number(pendiente.monto) - Number(pendiente.monto_pagado || 0),
        vencimiento: pendiente.fecha_vencimiento,
      };
    }
    case 'exportar_cobros_mes': {
      const mes = args.mes_iso || new Date().toISOString().slice(0, 7);
      const desde = `${mes}-01T00:00:00.000Z`;
      const finMes = new Date(`${mes}-01`); finMes.setMonth(finMes.getMonth() + 1);
      const lista = await cobros.cobrosEnRango(desde, finMes.toISOString());
      if (!lista.length) { await ctx.reply(`No hay cobros registrados en ${mes}.`); return { cantidad: 0 }; }
      const dias = [{ etiqueta: `Cobros de ${mes}`, items: lista.map((c) => ({ hora: '', texto: `${c.clientes?.nombre}: $${c.monto} [${c.estado}]${c.metodo_pago ? ' - ' + c.metodo_pago : ''}` })) }];
      const buffer = await pdf.generarAgendaPdf({ titulo: `Cobros - ${mes}`, dias });
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `cobros-${mes}.pdf` });
      return { ok: true, cantidad: lista.length };
    }
    case 'consultar_puntualidad_cliente': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      return { a_tiempo: cliente.pagos_a_tiempo || 0, tarde: cliente.pagos_tarde || 0 };
    }

    case 'consultar_recontactar': {
      const lista = await presupuestos.presupuestosParaRecontactar(7);
      if (!lista.length) { await ctx.reply('No hay presupuestos para recontactar por ahora. 👍'); return { cantidad: 0 }; }
      let msg = '📋 Presupuestos para recontactar:\n\n';
      lista.forEach((p) => { msg += `• ${p.clientes?.nombre || 'Cliente'} - ${p.descripcion} ($${p.monto || '-'})\n`; });
      await ctx.reply(msg);
      return { cantidad: lista.length };
    }

    // ---- TRABAJOS ----
    case 'registrar_trabajo': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const activo = await presupuestos.obtenerUltimoPresupuesto(cliente.id);
      const t = await trabajos.registrarTrabajo({
        cliente_id: cliente.id, presupuesto_id: activo?.id || null, descripcion: args.descripcion,
        gasto_materiales: args.gasto_materiales || 0, garantia_dias: args.garantia_dias || 90,
      });
      return { ok: true, cliente_id: cliente.id, garantia_vencimiento: t.garantia_vencimiento };
    }
    case 'editar_trabajo': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const ultimo = await trabajos.obtenerUltimoTrabajo(cliente.id);
      if (!ultimo) return { error: `${cliente.nombre} no tiene trabajos registrados.` };
      const cambios = {};
      if (args.nueva_descripcion) cambios.descripcion = args.nueva_descripcion;
      if (args.nuevo_gasto_materiales !== undefined) cambios.gasto_materiales = args.nuevo_gasto_materiales;
      if (!Object.keys(cambios).length) return { error: 'No se especificó qué cambiar.' };
      await trabajos.editarTrabajo(ultimo.id, cambios);
      return { ok: true };
    }
    case 'eliminar_trabajo': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const ultimo = await trabajos.obtenerUltimoTrabajo(cliente.id);
      if (!ultimo) return { error: `${cliente.nombre} no tiene trabajos registrados.` };
      await trabajos.eliminarTrabajo(ultimo.id);
      return { ok: true };
    }

    // ---- EQUIPOS ----
    case 'registrar_equipo': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const existentes = await equipos.equiposPorCliente(cliente.id);
      const posibleDuplicado = existentes.find((e) => e.tipo.toLowerCase() === (args.tipo || '').toLowerCase());
      const activo = await presupuestos.obtenerUltimoPresupuesto(cliente.id);
      const equipo = await equipos.registrarEquipo({
        cliente_id: cliente.id, tipo: args.tipo, fecha_instalacion: new Date().toISOString().slice(0, 10),
        meses_para_mantenimiento: args.meses_mantenimiento || null, aviso_automatico: !!args.aviso_automatico,
        marca: args.marca, modelo: args.modelo, numero_serie: args.numero_serie,
        garantia_fabrica_meses: args.garantia_fabrica_meses, vida_util_anios: args.vida_util_anios,
        presupuesto_id: activo?.id || null,
      });
      session.setEquipoActivo(ctx.chat.id, equipo.id);
      return {
        ok: true,
        proximo_mantenimiento: equipo.proximo_mantenimiento || null,
        cliente_id: cliente.id,
        posible_duplicado: posibleDuplicado ? `Ya había un ${posibleDuplicado.tipo} cargado para este cliente. Confirmá con el usuario si esto reemplaza al anterior o es uno nuevo de verdad.` : null,
      };
    }
    case 'editar_equipo': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const equipoIdActivo = session.obtenerEquipoActivo(ctx.chat.id);
      const equipo = equipoIdActivo ? { id: equipoIdActivo } : await equipos.buscarEquipoDeCliente(cliente.id, args.equipo_texto);
      if (!equipo) return { error: `${cliente.nombre} no tiene equipos cargados.` };
      const cambios = {};
      if (args.nuevo_tipo) cambios.tipo = args.nuevo_tipo;
      if (args.nueva_marca) cambios.marca = args.nueva_marca;
      if (args.nuevo_modelo) cambios.modelo = args.nuevo_modelo;
      if (args.nuevo_numero_serie) cambios.numero_serie = args.nuevo_numero_serie;
      if (args.nuevos_repuestos_necesarios) cambios.repuestos_necesarios = args.nuevos_repuestos_necesarios;
      if (!Object.keys(cambios).length) return { error: 'No se especificó qué corregir.' };
      const actualizado = await equipos.editarEquipo(equipo.id, cambios);
      session.setEquipoActivo(ctx.chat.id, actualizado.id);
      return { ok: true };
    }
    case 'consultar_equipos_cliente': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const lista = await equipos.equiposPorCliente(cliente.id);
      return { equipos: lista.map((e) => ({ tipo: e.tipo, marca: e.marca, proximo_mantenimiento: e.proximo_mantenimiento })) };
    }
    case 'consultar_historial_mantenimientos': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const equipo = await equipos.buscarEquipoDeCliente(cliente.id, args.equipo_texto);
      if (!equipo) return { error: `${cliente.nombre} no tiene ese equipo cargado.` };
      const historial = await equipos.historialMantenimientos(equipo.id);
      return { mantenimientos: historial.map((m) => ({ fecha: m.fecha, gasto: m.gasto_repuestos, descripcion: m.descripcion })) };
    }
    case 'consultar_mantenimientos_vencidos': {
      const lista = await equipos.mantenimientosVencidosSinHacer(7);
      if (!lista.length) { await ctx.reply('No tenés mantenimientos vencidos sin hacer. 👍'); return { cantidad: 0 }; }
      let msg = '⚠️ Mantenimientos vencidos sin hacer:\n\n';
      lista.forEach((e) => { msg += `• ${e.tipo} de ${e.clientes?.nombre} (vencía ${e.proximo_mantenimiento})\n`; });
      await ctx.reply(msg);
      return { cantidad: lista.length };
    }
    case 'consultar_estadistica_equipos': {
      const conteo = await equipos.estadisticaPorTipo();
      return { por_tipo: conteo };
    }
    case 'consultar_equipos_para_reemplazo': {
      const lista = await equipos.equiposParaReemplazo();
      if (!lista.length) { await ctx.reply('No hay equipos cerca del fin de su vida útil.'); return { cantidad: 0 }; }
      let msg = '🔧 Equipos que se acercan al fin de su vida útil:\n\n';
      lista.forEach((e) => { msg += `• ${e.tipo} de ${e.clientes?.nombre} (instalado ${e.fecha_instalacion})\n`; });
      await ctx.reply(msg);
      return { cantidad: lista.length };
    }
    case 'generar_ficha_equipo': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const equipo = await equipos.buscarEquipoDeCliente(cliente.id, args.equipo_texto);
      if (!equipo) return { error: `${cliente.nombre} no tiene ese equipo cargado.` };
      const buffer = await pdf.generarFichaEquipo({ cliente, equipo });
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `ficha-${equipo.tipo}-${cliente.nombre}.pdf` });
      return { ok: true };
    }
    case 'registrar_mantenimiento_realizado': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const equipo = await equipos.buscarEquipoDeCliente(cliente.id, args.equipo_texto);
      if (!equipo) return { error: `${cliente.nombre} no tiene ese equipo cargado.` };
      await equipos.registrarMantenimientoRealizado(equipo.id, args.gasto_repuestos, args.descripcion);
      return { ok: true };
    }
    case 'anotar_repuestos_necesarios': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const equipo = await equipos.buscarEquipoDeCliente(cliente.id, args.equipo_texto);
      if (!equipo) return { error: `${cliente.nombre} no tiene ese equipo cargado.` };
      await equipos.editarEquipo(equipo.id, { repuestos_necesarios: args.repuestos });
      return { ok: true };
    }
    case 'consultar_mantenimientos_agrupables': {
      const lista = await equipos.clientesConMantenimientosAgrupables(15);
      if (!lista.length) return { cantidad: 0 };
      return { clientes: lista.map((c) => ({ nombre: c.nombre, equipos: c.equipos })) };
    }
    case 'eliminar_equipo': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const lista = await equipos.equiposPorCliente(cliente.id);
      const encontrado = lista.find((e) => e.tipo.toLowerCase().includes((args.tipo || '').toLowerCase()));
      if (!encontrado) return { error: `No encontré un equipo tipo "${args.tipo}" para ${cliente.nombre}.` };
      await equipos.eliminarEquipo(encontrado.id);
      return { ok: true };
    }

    // ---- AGENDA / VISITAS ----
    case 'agendar_trabajo': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const fecha = new Date(args.fecha_hora_iso);
      if (isNaN(fecha.getTime())) return { error: 'La fecha/hora no es válida.' };
      if (fecha < new Date()) return { error: 'Esa fecha ya pasó. Confirmale al usuario la fecha correcta antes de agendar.' };

      const bloqueados = await visitas.horariosBloqueados();
      const choqueBloqueado = visitas.chocaConBloqueado(args.fecha_hora_iso, bloqueados);
      const cercanas = await visitas.visitasCercanas(args.fecha_hora_iso, 60);
      const visita = await visitas.crearVisita({
        cliente_id: cliente.id, descripcion: args.descripcion, fecha_hora: args.fecha_hora_iso, aviso_horas_antes: args.aviso_horas_antes || 2,
        que_llevar: args.que_llevar, duracion_minutos: args.duracion_minutos, recurrencia_meses: args.recurrencia_meses,
      });
      session.setVisitaActiva(ctx.chat.id, visita.id);
      const totalDelDia = await visitas.contarVisitasDelDia(args.fecha_hora_iso);

      const cobrosCliente = await cobros.obtenerCobrosPorCliente(cliente.id);
      const deudaPendiente = cobrosCliente.find((c) => c.estado === 'pendiente');
      const equiposCliente = await equipos.equiposPorCliente(cliente.id);
      const hoy = new Date().toISOString().slice(0, 10);
      const enUnMes = new Date(); enUnMes.setMonth(enUnMes.getMonth() + 1);
      const mantenimientoProximo = equiposCliente.find((e) => e.proximo_mantenimiento && e.proximo_mantenimiento <= enUnMes.toISOString().slice(0, 10));

      return {
        ok: true,
        cliente_id: cliente.id,
        choque_de_horario: cercanas.length > 0 ? cercanas.map((v) => `${v.clientes?.nombre} a las ${new Date(v.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`) : null,
        choque_horario_bloqueado: choqueBloqueado ? choqueBloqueado.descripcion || 'horario bloqueado' : null,
        visitas_ese_dia: totalDelDia,
        dia_cargado: totalDelDia >= 4,
        deuda_pendiente: deudaPendiente ? Number(deudaPendiente.monto) - Number(deudaPendiente.monto_pagado || 0) : null,
        mantenimiento_proximo: mantenimientoProximo ? { equipo: mantenimientoProximo.tipo, fecha: mantenimientoProximo.proximo_mantenimiento } : null,
      };
    }
    case 'completar_visita': {
      const r = await resolverClienteConVisita(ctx, args);
      if (r.error) return r;
      await visitas.completarVisita(r.visita.id);
      return { ok: true, mensaje: `Visita de ${r.cliente.nombre} marcada como terminada. Podés ofrecer registrar el trabajo, cobrar y preguntar si quedó conforme.`, cliente_id: r.cliente.id };
    }
    case 'confirmar_visita': {
      const r = await resolverClienteConVisita(ctx, args);
      if (r.error) return r;
      await visitas.confirmarVisita(r.visita.id);
      return { ok: true };
    }
    case 'reagendar_visita': {
      const r = await resolverClienteConVisita(ctx, args);
      if (r.error) return r;
      const nueva = new Date(args.nueva_fecha_hora_iso);
      if (isNaN(nueva.getTime())) return { error: 'La fecha/hora no es válida.' };
      await visitas.reagendarVisita(r.visita.id, args.nueva_fecha_hora_iso);
      return { ok: true, mensaje: `Visita de ${r.cliente.nombre} reagendada.`, telefono: r.cliente.telefono };
    }
    case 'cancelar_visita': {
      const r = await resolverClienteConVisita(ctx, args);
      if (r.error) return r;
      await visitas.cancelarVisita(r.visita.id, args.motivo);
      return { ok: true, telefono: r.cliente.telefono };
    }
    case 'consultar_agenda': {
      const rango = args.rango || 'semana';
      const { desde, hasta } = rangoFechas(rango, args.fecha_iso);
      const lista = await visitas.visitasEnRango(desde, hasta);
      const conPresupuesto = await Promise.all(
        lista.map(async (v) => {
          const activo = await presupuestos.obtenerUltimoPresupuesto(v.cliente_id);
          return {
            fecha: new Date(v.fecha_hora).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' }),
            hora: new Date(v.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
            cliente: v.clientes?.nombre,
            direccion: v.clientes?.direccion || null,
            descripcion: v.descripcion,
            presupuesto: activo ? { descripcion: activo.descripcion, monto: activo.monto, estado: activo.estado } : null,
          };
        })
      );
      return { cantidad: conPresupuesto.length, visitas: conPresupuesto };
    }

    // ---- RECORDATORIOS ----
    case 'consultar_dias_libres': {
      const rango = args.rango || 'semana';
      const { desde, hasta } = rangoFechas(rango);
      const libres = await visitas.diasLibresEnRango(desde, hasta);
      return { dias_libres: libres };
    }

    case 'consultar_reagendados_frecuentes': {
      const lista = await visitas.clientesQueReagendanMucho(2);
      if (!lista.length) return { cantidad: 0 };
      return { cantidad: lista.length, clientes: lista.map((v) => ({ nombre: v.clientes?.nombre, veces: v.veces_reagendada })) };
    }

    case 'contar_visitas_cliente': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const veces = await visitas.contarVisitasCliente(cliente.id);
      return { cliente_id: cliente.id, nombre: cliente.nombre, visitas_ultimo_anio: veces };
    }

    case 'generar_agenda_pdf': {
      const rango = args.rango || 'semana';
      const { desde, hasta } = rangoFechas(rango);
      const lista = await visitas.visitasEnRango(desde, hasta);
      const porDia = {};
      lista.forEach((v) => {
        const clave = new Date(v.fecha_hora).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' });
        if (!porDia[clave]) porDia[clave] = [];
        porDia[clave].push({ hora: new Date(v.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), texto: `${v.clientes?.nombre}: ${v.descripcion}` });
      });
      const dias = Object.keys(porDia).map((etiqueta) => ({ etiqueta, items: porDia[etiqueta] }));
      const buffer = await pdf.generarAgendaPdf({ titulo: `Agenda - ${rango}`, dias });
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `agenda-${rango}.pdf` });
      return { ok: true };
    }

    case 'exportar_agenda_calendario': {
      const rango = args.rango || 'semana';
      const { desde, hasta } = rangoFechas(rango);
      const lista = await visitas.visitasEnRango(desde, hasta);
      if (!lista.length) { await ctx.reply('No hay visitas agendadas en ese rango.'); return { cantidad: 0 }; }
      const buffer = pdf.generarICS(lista);
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `agenda.ics` });
      return { ok: true, cantidad: lista.length, mensaje: 'Abrí el archivo .ics con tu celular para agregarlo a Google Calendar u otro calendario.' };
    }

    case 'consultar_historial_visitas': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const lista = await visitas.historialVisitasCliente(cliente.id);
      return { visitas: lista.map((v) => ({ fecha: v.fecha_hora, descripcion: v.descripcion })) };
    }

    case 'bloquear_horario': {
      await visitas.crearHorarioBloqueado(args.hora_inicio, args.hora_fin, args.descripcion);
      return { ok: true };
    }

    case 'consultar_horas_trabajadas': {
      const rango = args.rango || 'semana';
      const { desde, hasta } = rangoFechas(rango);
      const horas = await visitas.horasTrabajadasEnRango(desde, hasta);
      return { horas };
    }

    case 'consultar_resumen_dia': {
      const { desde, hasta } = rangoFechas('hoy');
      const visitasHoy = await visitas.visitasEnRango(desde, hasta);
      const cobrosPend = await cobros.cobrosPendientes();
      const cobrosHoy = cobrosPend.filter((c) => c.fecha_vencimiento === new Date().toISOString().slice(0, 10));
      return {
        visitas_hoy: visitasHoy.map((v) => ({ hora: new Date(v.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), cliente: v.clientes?.nombre, descripcion: v.descripcion })),
        cobros_que_vencen_hoy: cobrosHoy.map((c) => ({ cliente: c.clientes?.nombre, monto: c.monto })),
      };
    }

    case 'crear_recordatorio': {
      await recordatorios.crearRecordatorio({ texto: args.texto, fecha_hora: args.fecha_hora_iso, recurrencia: args.recurrencia || null });
      return { ok: true };
    }
    case 'editar_recordatorio': {
      const lista = await recordatorios.buscarRecordatorio(args.busqueda_texto || '');
      if (!lista.length) return { error: 'No encontré ningún recordatorio con ese texto.' };
      const cambios = {};
      if (args.nuevo_texto) cambios.texto = args.nuevo_texto;
      if (args.nueva_fecha_hora_iso) cambios.fecha_hora = args.nueva_fecha_hora_iso;
      if (!Object.keys(cambios).length) return { error: 'No se especificó qué cambiar.' };
      await recordatorios.editarRecordatorio(lista[0].id, cambios);
      return { ok: true };
    }
    case 'eliminar_recordatorio': {
      const lista = await recordatorios.buscarRecordatorio(args.busqueda_texto || '');
      if (!lista.length) return { error: 'No encontré ningún recordatorio con ese texto.' };
      await recordatorios.eliminarRecordatorio(lista[0].id);
      return { ok: true };
    }

    case 'consultar_recordatorios': {
      const rango = args.rango || 'semana';
      const { desde, hasta } = rangoFechas(rango, args.fecha_iso);
      const lista = await recordatorios.recordatoriosEnRango(desde, hasta);
      const items = lista.map((r) => ({
        fecha: new Date(r.fecha_hora).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' }),
        hora: new Date(r.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        texto: r.texto,
      }));
      return { cantidad: items.length, recordatorios: items };
    }

    // ---- NOTAS ----
    case 'guardar_nota': {
      let cliente_id = null;
      if (args.cliente_nombre) {
        const cliente = await resolverCliente(ctx, { cliente_nombre: args.cliente_nombre });
        if (cliente && !cliente.multiple) cliente_id = cliente.id;
      }
      const visita_id = session.obtenerVisitaActiva(ctx.chat.id);
      const nota = await notas.crearNota({
        titulo: args.titulo || null, contenido: args.contenido, categoria: args.categoria || null,
        cliente_id, visita_id: cliente_id ? visita_id : null, prioridad: args.prioridad || 'normal',
      });
      if (args.fijar) await notas.marcarFijada(nota.id, true);
      session.setNotaActiva(ctx.chat.id, nota.id);
      return { ok: true };
    }
    case 'editar_nota': {
      let nota = null;
      if (args.busqueda) {
        const encontradas = await notas.buscarNotas(args.busqueda);
        nota = encontradas[0];
      } else {
        const activaId = session.obtenerNotaActiva(ctx.chat.id);
        nota = activaId ? { id: activaId } : await notas.ultimaNota();
      }
      if (!nota) return { error: 'No encontré ninguna nota para editar.' };
      await notas.editarNota(nota.id, { contenido: args.nuevo_contenido });
      session.setNotaActiva(ctx.chat.id, nota.id);
      return { ok: true };
    }
    case 'buscar_nota': {
      const encontradas = await notas.buscarNotas(args.busqueda || '');
      if (!encontradas.length) return { encontrado: false };
      let msg = '📝 Encontré esto:\n\n';
      encontradas.forEach((n) => { msg += `${n.fijada ? '📌 ' : ''}${n.titulo ? `${n.titulo}\n` : ''}${n.contenido}\n\n`; });
      await ctx.reply(msg);
      session.setNotaActiva(ctx.chat.id, encontradas[0].id);
      return { encontrado: true, cantidad: encontradas.length };
    }
    case 'listar_notas': {
      const lista = await notas.notasRecientes(15, !!args.incluir_completadas);
      if (!lista.length) { await ctx.reply('No tenés notas activas guardadas.'); return { cantidad: 0 }; }
      let msg = '📝 Tus notas:\n\n';
      lista.forEach((n) => { msg += `${n.fijada ? '📌 ' : ''}• ${n.titulo || n.contenido.slice(0, 40)}${n.completada ? ' ✅' : ''}\n`; });
      await ctx.reply(msg);
      return { cantidad: lista.length };
    }
    case 'consultar_notas_por_categoria': {
      const lista = await notas.notasPorCategoria(args.categoria || '');
      if (!lista.length) { await ctx.reply(`No tenés notas en "${args.categoria}".`); return { cantidad: 0 }; }
      let msg = `📝 Notas de "${args.categoria}":\n\n`;
      lista.forEach((n) => { msg += `• ${n.titulo || n.contenido.slice(0, 40)}\n`; });
      await ctx.reply(msg);
      return { cantidad: lista.length };
    }
    case 'consultar_notas_por_fecha': {
      const rango = args.rango || 'semana';
      const { desde, hasta } = rangoFechas(rango);
      const lista = await notas.notasEnRango(desde, hasta);
      if (!lista.length) { await ctx.reply('No tenés notas en ese período.'); return { cantidad: 0 }; }
      let msg = '📝 Notas:\n\n';
      lista.forEach((n) => { msg += `• ${n.titulo || n.contenido.slice(0, 40)}\n`; });
      await ctx.reply(msg);
      return { cantidad: lista.length };
    }
    case 'marcar_nota_completada': {
      const encontradas = args.busqueda ? await notas.buscarNotas(args.busqueda) : null;
      const nota = encontradas?.[0] || (session.obtenerNotaActiva(ctx.chat.id) ? { id: session.obtenerNotaActiva(ctx.chat.id) } : null);
      if (!nota) return { error: 'No encontré esa nota.' };
      await notas.marcarCompletada(nota.id);
      return { ok: true };
    }
    case 'marcar_nota_fijada': {
      const encontradas = await notas.buscarNotas(args.busqueda || '');
      if (!encontradas.length) return { error: 'No encontré esa nota.' };
      await notas.marcarFijada(encontradas[0].id, args.fijar);
      return { ok: true };
    }
    case 'guardar_foto_nota': {
      const url = session.obtenerUltimaFotoUrl(ctx.chat.id);
      if (!url) return { error: 'No tengo ninguna foto reciente. Mandala primero.' };
      const encontradas = await notas.buscarNotas(args.busqueda || '');
      if (!encontradas.length) return { error: 'No encontré esa nota.' };
      await notas.editarNota(encontradas[0].id, { foto_url: url });
      return { ok: true };
    }
    case 'combinar_notas': {
      const principales = await notas.buscarNotas(args.busqueda_principal || '');
      const aSumar = await notas.buscarNotas(args.busqueda_a_sumar || '');
      if (!principales.length || !aSumar.length) return { error: 'No encontré alguna de las dos notas.' };
      await notas.combinarNotas(principales[0].id, aSumar[0].id);
      return { ok: true };
    }
    case 'exportar_nota_pdf': {
      const encontradas = await notas.buscarNotas(args.busqueda || '');
      if (!encontradas.length) return { error: 'No encontré esa nota.' };
      const nota = encontradas[0];
      const buffer = await pdf.generarDocumentoLibre({ titulo: nota.titulo || 'Nota', contenido: nota.contenido });
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `nota.pdf` });
      return { ok: true };
    }
    case 'eliminar_nota': {
      const encontradas = await notas.buscarNotas(args.busqueda || '');
      if (!encontradas.length) return { error: 'No encontré ninguna nota con esa descripción.' };
      await notas.eliminarNota(encontradas[0].id);
      return { ok: true };
    }
    case 'eliminar_notas_completadas': {
      const cantidad = await notas.eliminarCompletadas();
      return { ok: true, cantidad };
    }

    // ---- DOCUMENTOS Y REPORTES ----
    case 'generar_documento': {
      const buffer = await pdf.generarDocumentoLibre({ titulo: args.titulo, contenido: args.contenido });
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `${args.titulo || 'documento'}.pdf` });
      return { ok: true };
    }
    case 'generar_extracto_cliente': {
      const cliente = await resolverCliente(ctx, args);
      if (!cliente) return errorClienteNoEncontrado(args.cliente_nombre);
      if (cliente.multiple) return errorClienteAmbiguo(cliente.opciones);
      const presupuestosCliente = await presupuestos.historialCompleto(cliente.id);
      const recibosCliente = await recibos.recibosPorCliente(cliente.id);
      const buffer = await pdf.generarExtracto({ cliente, presupuestos: presupuestosCliente, recibos: recibosCliente });
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `extracto-${cliente.nombre}.pdf` });
      return { ok: true, cliente_id: cliente.id };
    }
    case 'generar_bitacora': {
      const mes = args.mes_iso || new Date().toISOString().slice(0, 7);
      const desde = `${mes}-01`;
      const finMes = new Date(desde);
      finMes.setMonth(finMes.getMonth() + 1);
      finMes.setDate(0);
      const lista = await trabajos.trabajosEnRango(desde, finMes.toISOString().slice(0, 10));
      if (!lista.length) { await ctx.reply(`No hay trabajos registrados en ${mes}.`); return { cantidad: 0 }; }
      const buffer = await pdf.generarBitacora({ titulo: `Bitácora - ${mes}`, trabajos: lista });
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `bitacora-${mes}.pdf` });
      return { ok: true, cantidad: lista.length };
    }
    case 'consultar_reporte_mensual': {
      const mes = args.mes_iso || new Date().toISOString().slice(0, 7);
      const desde = `${mes}-01T00:00:00.000Z`;
      const finMes = new Date(`${mes}-01`);
      finMes.setMonth(finMes.getMonth() + 1);
      const lista = await cobros.cobrosEnRango(desde, finMes.toISOString());
      const facturado = lista.reduce((acc, c) => acc + Number(c.monto), 0);
      const cobrado = lista.filter((c) => c.estado === 'cobrado').reduce((acc, c) => acc + Number(c.monto), 0);
      const pendiente = facturado - cobrado;
      session.setReporteActivo(ctx.chat.id, 'mensual');
      return { facturado, cobrado, pendiente, mes };
    }
    case 'comparar_meses': {
      const mes = args.mes_iso || new Date().toISOString().slice(0, 7);
      const resultado = await reportes.compararMeses(mes);
      session.setReporteActivo(ctx.chat.id, 'comparacion');
      return resultado;
    }
    case 'consultar_reporte_anual': {
      const anio = args.anio || String(new Date().getFullYear());
      const resultado = await reportes.reporteAnual(anio);
      session.setReporteActivo(ctx.chat.id, 'anual');
      return { ...resultado, anio };
    }
    case 'exportar_reporte_anual': {
      const anio = args.anio || String(new Date().getFullYear());
      const resultado = await reportes.reporteAnual(anio);
      const contenido = `Reporte anual ${anio}\n\nFacturado: $${resultado.facturado}\nCobrado: $${resultado.cobrado}\nPendiente: $${resultado.pendiente}\nCantidad de cobros: ${resultado.cantidad_cobros}`;
      const buffer = await pdf.generarDocumentoLibre({ titulo: `Reporte Anual ${anio}`, contenido });
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `reporte-anual-${anio}.pdf` });
      await reportes.guardarReporteHistorial('anual', anio, contenido);
      return { ok: true };
    }
    case 'consultar_ranking_clientes': {
      const mes = args.mes_iso || new Date().toISOString().slice(0, 7);
      const { desde, hasta } = reportes.rangoMes(mes);
      const lista = await reportes.rankingClientes(desde, hasta);
      return { ranking: lista };
    }
    case 'consultar_rentabilidad_general': {
      const mes = args.mes_iso || new Date().toISOString().slice(0, 7);
      const { desde, hasta } = reportes.rangoMes(mes);
      return await reportes.rentabilidadGeneral(desde, hasta);
    }
    case 'consultar_proyeccion_cierre': {
      const mes = args.mes_iso || new Date().toISOString().slice(0, 7);
      return await reportes.proyeccionCierreMes(mes);
    }
    case 'consultar_grafico_facturacion': {
      const lista = await reportes.facturacionPorMes(args.cantidad_meses || 6);
      const maximo = Math.max(...lista.map((m) => m.total), 1);
      let msg = '📊 Facturación por mes:\n\n';
      lista.forEach((m) => {
        const barras = Math.round((m.total / maximo) * 15);
        msg += `${m.mes} ${'█'.repeat(barras)} $${m.total}\n`;
      });
      await ctx.reply(msg);
      return { meses: lista };
    }
    case 'consultar_facturacion_por_categoria': {
      const mes = args.mes_iso || new Date().toISOString().slice(0, 7);
      const { desde, hasta } = reportes.rangoMes(mes);
      const porCategoria = await reportes.facturacionPorCategoria(desde, hasta);
      return { por_categoria: porCategoria };
    }
    case 'consultar_facturacion_por_rubro': {
      const mes = args.mes_iso || new Date().toISOString().slice(0, 7);
      const { desde, hasta } = reportes.rangoMes(mes);
      const porRubro = await reportes.facturacionPorRubro(desde, hasta);
      return { por_rubro: porRubro };
    }
    case 'consultar_clientes_nuevos_vs_recurrentes': {
      const mes = args.mes_iso || new Date().toISOString().slice(0, 7);
      const { desde, hasta } = reportes.rangoMes(mes);
      return await reportes.clientesNuevosVsRecurrentes(desde, hasta);
    }
    case 'consultar_tiempo_cierre_venta': {
      const dias = await reportes.tiempoPromedioCierre();
      return { dias_promedio: dias };
    }
    case 'consultar_negocio_completo': {
      const mes = new Date().toISOString().slice(0, 7);
      const { desde, hasta } = reportes.rangoMes(mes);
      const reporteMes = await reportes.totalFacturadoEnRango(desde, hasta);
      const pendientes = await cobros.cobrosPendientes();
      const totalPendiente = pendientes.reduce((acc, c) => acc + (Number(c.monto) - Number(c.monto_pagado || 0)), 0);
      const ranking = await reportes.rankingClientes(desde, hasta, 3);
      const vencidos = await cobros.cobrosVencidos();
      const enSilencio = await clientes.clientesEnSilencio(6);
      return {
        facturado_este_mes: reporteMes,
        total_pendiente_cobro: totalPendiente,
        mejores_clientes_del_mes: ranking,
        alertas: {
          cobros_vencidos: vencidos.length,
          clientes_en_silencio: enSilencio.length,
        },
      };
    }

    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

// ================= FLUJOS GUIADOS (comandos paso a paso) =================

async function pasoNuevoCliente(ctx, estado, texto) {
  if (estado.paso === 'nombre') { estado.datos.nombre = texto; estado.paso = 'telefono'; session.set(ctx.chat.id, estado); return ctx.reply('¿Teléfono? (o "no")'); }
  if (estado.paso === 'telefono') { estado.datos.telefono = texto.toLowerCase() === 'no' ? null : texto; estado.paso = 'direccion'; session.set(ctx.chat.id, estado); return ctx.reply('¿Dirección? (o "no")'); }
  if (estado.paso === 'direccion') { estado.datos.direccion = texto.toLowerCase() === 'no' ? null : texto; estado.paso = 'notas'; session.set(ctx.chat.id, estado); return ctx.reply('¿Nota sobre el cliente? (o "no")'); }
  if (estado.paso === 'notas') {
    estado.datos.notas = texto.toLowerCase() === 'no' ? null : texto;
    const cliente = await clientes.crearCliente(estado.datos);
    session.limpiar(ctx.chat.id);
    return ctx.reply(`Cliente "${cliente.nombre}" guardado. ✅`);
  }
}

async function pasoBuscarCliente(ctx, estado, texto) {
  const encontrados = await clientes.buscarClientesPorNombre(texto);
  session.limpiar(ctx.chat.id);
  if (!encontrados.length) return ctx.reply('No encontré ningún cliente con ese nombre.');
  for (const c of encontrados.slice(0, 5)) ctx.reply(formatearFicha(await clientes.fichaCompleta(c.id)));
}

function formatearFicha({ cliente, equipos, direcciones, presupuestos, cobros, trabajos }) {
  let msg = `📋 ${cliente.nombre}${cliente.apodo ? ` (${cliente.apodo})` : ''}${cliente.prioritario ? ' ⭐' : ''}${cliente.bloqueado ? ' 🚫' : ''}\n`;
  if (cliente.categoria) msg += `Categoría: ${cliente.categoria}\n`;
  if (cliente.telefono) msg += `Tel: ${cliente.telefono}\n`;
  if (cliente.contacto_secundario) msg += `Otro contacto: ${cliente.contacto_secundario}\n`;
  if (cliente.direccion) msg += `Dirección: ${cliente.direccion}\n`;
  if (direcciones?.length) direcciones.forEach((d) => { msg += `Dirección (${d.etiqueta || 'extra'}): ${d.direccion}\n`; });
  if (cliente.horario_preferido) msg += `Horario preferido: ${cliente.horario_preferido}\n`;
  if (cliente.descuento_habitual > 0) msg += `Descuento habitual: ${cliente.descuento_habitual}%\n`;
  if (cliente.relacion) msg += `Relación: ${cliente.relacion}\n`;
  if (equipos?.length) { msg += `\n🔧 Equipos:\n`; equipos.forEach((e) => (msg += `  • ${e.tipo}\n`)); }
  if (presupuestos?.length) { msg += `\n📋 Presupuestos:\n`; presupuestos.forEach((p) => (msg += `  • ${p.descripcion} - $${p.monto || '-'} [${p.estado}]\n`)); }
  if (cobros?.length) { msg += `\n💰 Cobros:\n`; cobros.forEach((c) => (msg += `  • $${c.monto} (pagado $${c.monto_pagado || 0}) [${c.estado}]\n`)); }
  if (trabajos?.length) { msg += `\n✅ Últimos trabajos:\n`; trabajos.slice(0, 3).forEach((t) => (msg += `  • ${t.fecha}: ${t.descripcion}\n`)); }
  return msg;
}

async function pasoPresupuesto(ctx, estado, texto) {
  if (estado.paso === 'buscar_cliente') {
    const encontrados = await clientes.buscarClientesPorNombre(texto);
    if (!encontrados.length) return ctx.reply('No encontré ese cliente. Probá con /nuevocliente primero.');
    if (encontrados.length === 1) { estado.datos.cliente = encontrados[0]; estado.paso = 'descripcion'; session.set(ctx.chat.id, estado); return ctx.reply(`Cliente: ${encontrados[0].nombre}. ¿Descripción del trabajo?`); }
    estado.datos.opciones = encontrados; estado.paso = 'elegir_cliente'; session.set(ctx.chat.id, estado);
    return ctx.reply('Encontré varios, respondé con el número:\n' + encontrados.map((c, i) => `${i + 1}. ${c.nombre}`).join('\n'));
  }
  if (estado.paso === 'elegir_cliente') {
    const elegido = estado.datos.opciones?.[parseInt(texto, 10) - 1];
    if (!elegido) return ctx.reply('Número inválido, probá de nuevo.');
    estado.datos.cliente = elegido; estado.paso = 'descripcion'; session.set(ctx.chat.id, estado);
    return ctx.reply('¿Descripción del trabajo?');
  }
  if (estado.paso === 'descripcion') { estado.datos.descripcion = texto; estado.paso = 'monto'; session.set(ctx.chat.id, estado); return ctx.reply('¿Monto?'); }
  if (estado.paso === 'monto') {
    const monto = parseFloat(texto.replace(',', '.'));
    if (isNaN(monto)) return ctx.reply('Poné solo el número, ej: 45000');
    const items = [{ descripcion: estado.datos.descripcion, monto }];
    const creado = await presupuestos.crearPresupuesto({ cliente_id: estado.datos.cliente.id, items });
    const vencimiento = new Date(); vencimiento.setDate(vencimiento.getDate() + 15);
    await cobros.crearCobro({ cliente_id: estado.datos.cliente.id, presupuesto_id: creado.id, monto: creado.monto, fecha_vencimiento: vencimiento.toISOString().slice(0, 10) });
    const buffer = await pdf.generarPresupuesto({ cliente: estado.datos.cliente, items, numero: numFmt(creado.numero) });
    session.limpiar(ctx.chat.id);
    await enviarDocumentoConReintento(ctx, { source: buffer, filename: `presupuesto-${estado.datos.cliente.nombre}.pdf` });
    return ctx.reply('Presupuesto guardado y generado. ✅');
  }
}

async function pasoRecibo(ctx, estado, texto) {
  if (estado.paso === 'buscar_cliente') {
    const encontrados = await clientes.buscarClientesPorNombre(texto);
    if (!encontrados.length) return ctx.reply('No encontré ese cliente.');
    estado.datos.cliente = encontrados[0]; estado.paso = 'concepto'; session.set(ctx.chat.id, estado);
    return ctx.reply(`Cliente: ${encontrados[0].nombre}. ¿Concepto del pago?`);
  }
  if (estado.paso === 'concepto') { estado.datos.concepto = texto; estado.paso = 'monto'; session.set(ctx.chat.id, estado); return ctx.reply('¿Monto recibido?'); }
  if (estado.paso === 'monto') {
    const monto = parseFloat(texto.replace(',', '.'));
    if (isNaN(monto)) return ctx.reply('Poné solo el número.');
    const registrado = await recibos.crearRecibo({ cliente_id: estado.datos.cliente.id, concepto: estado.datos.concepto, monto });
    const buffer = await pdf.generarRecibo({ cliente: estado.datos.cliente, monto, concepto: estado.datos.concepto, numero: numFmt(registrado.numero) });
    session.limpiar(ctx.chat.id);
    await enviarDocumentoConReintento(ctx, { source: buffer, filename: `recibo-${estado.datos.cliente.nombre}.pdf` });
    return ctx.reply('Recibo generado. ✅');
  }
}

async function pasoTrabajo(ctx, estado, texto) {
  if (estado.paso === 'buscar_cliente') {
    const encontrados = await clientes.buscarClientesPorNombre(texto);
    if (!encontrados.length) return ctx.reply('No encontré ese cliente.');
    estado.datos.cliente = encontrados[0]; estado.paso = 'descripcion'; session.set(ctx.chat.id, estado);
    return ctx.reply('Contame qué trabajo hiciste.');
  }
  if (estado.paso === 'descripcion') {
    await trabajos.registrarTrabajo({ cliente_id: estado.datos.cliente.id, descripcion: texto });
    session.limpiar(ctx.chat.id);
    return ctx.reply('Trabajo registrado. ✅');
  }
}

async function pasoEquipo(ctx, estado, texto) {
  if (estado.paso === 'buscar_cliente') {
    const encontrados = await clientes.buscarClientesPorNombre(texto);
    if (!encontrados.length) return ctx.reply('No encontré ese cliente.');
    estado.datos.cliente = encontrados[0]; estado.paso = 'tipo'; session.set(ctx.chat.id, estado);
    return ctx.reply('¿Qué equipo instalaste?');
  }
  if (estado.paso === 'tipo') { estado.datos.tipo = texto; estado.paso = 'meses'; session.set(ctx.chat.id, estado); return ctx.reply('¿Cada cuántos meses hay que hacerle mantenimiento? (o "no")'); }
  if (estado.paso === 'meses') {
    estado.datos.meses = texto.toLowerCase() === 'no' ? null : parseInt(texto, 10);
    if (!estado.datos.meses) {
      await equipos.registrarEquipo({ cliente_id: estado.datos.cliente.id, tipo: estado.datos.tipo, fecha_instalacion: new Date().toISOString().slice(0, 10) });
      session.limpiar(ctx.chat.id);
      return ctx.reply('Equipo registrado. ✅');
    }
    estado.paso = 'aviso'; session.set(ctx.chat.id, estado);
    return ctx.reply('¿Avisar al cliente automático, o avisarte a vos?', Markup.keyboard(['Avisar al cliente automático', 'Avisarme a mí']).oneTime().resize());
  }
  if (estado.paso === 'aviso') {
    const automatico = texto.toLowerCase().includes('cliente');
    const equipo = await equipos.registrarEquipo({ cliente_id: estado.datos.cliente.id, tipo: estado.datos.tipo, fecha_instalacion: new Date().toISOString().slice(0, 10), meses_para_mantenimiento: estado.datos.meses, aviso_automatico: automatico });
    session.limpiar(ctx.chat.id);
    return ctx.reply(`Mantenimiento programado para ${equipo.proximo_mantenimiento}, y se repite solo cada ${estado.datos.meses} meses. ✅`, Markup.removeKeyboard());
  }
}

async function pasoRecordatorio(ctx, estado, texto) {
  if (estado.paso === 'texto') { estado.datos.texto = texto; estado.paso = 'fecha'; session.set(ctx.chat.id, estado); return ctx.reply('¿Para cuándo? DD/MM/AAAA HH:MM'); }
  if (estado.paso === 'fecha') {
    const match = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (!match) return ctx.reply('Formato inválido. Probá así: 25/12/2026 09:00');
    const [, d, m, y, h, min] = match;
    await recordatorios.crearRecordatorio({ texto: estado.datos.texto, fecha_hora: new Date(y, m - 1, d, h, min).toISOString() });
    session.limpiar(ctx.chat.id);
    return ctx.reply('Recordatorio guardado. ✅');
  }
}

// ================= AGENDA DIARIA (para el cron) =================

async function enviarAgendaDelDia(chatId) {
  const { desde, hasta } = rangoFechas('hoy');
  const visitasHoy = await visitas.visitasEnRango(desde, hasta);
  const recs = await recordatorios.recordatoriosPendientesHoy();
  const mants = await equipos.mantenimientosDelDia();
  const totalItems = visitasHoy.length + recs.length + mants.length;

  let msg = '📅 Agenda de hoy:\n\n';
  if (!totalItems) {
    msg += 'No tenés nada pendiente para hoy. 👍';
  } else {
    msg += `Tenés ${visitasHoy.length} trabajo(s) agendado(s)${recs.length ? ` y ${recs.length} recordatorio(s)` : ''}.\n\n`;
    for (const v of visitasHoy) {
      let linea = `🔧 ${new Date(v.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} - ${v.clientes?.nombre}: ${v.descripcion}${v.clientes?.direccion ? ' (' + v.clientes.direccion + ')' : ''}`;
      const pendientesCliente = await cobros.obtenerCobrosPorCliente(v.cliente_id);
      const deuda = pendientesCliente.find((c) => c.estado === 'pendiente');
      if (deuda) linea += ` — 💰 debe $${Number(deuda.monto) - Number(deuda.monto_pagado || 0)}`;
      if (v.que_llevar) linea += `\n   📦 Llevar: ${v.que_llevar}`;
      msg += linea + '\n';
    }
    recs.forEach((r) => { msg += `⏰ ${new Date(r.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} - ${r.texto}\n`; });
    mants.forEach((m) => { msg += `🔧 Mantenimiento: ${m.tipo} de ${m.clientes?.nombre}${m.aviso_automatico ? ' (se le avisa solo)' : ' (contactalo vos)'}\n`; });

    if (visitasHoy.length) {
      msg += '\n💬 Mensajes listos para confirmarle a cada cliente:\n\n';
      visitasHoy.forEach((v) => {
        const hora = new Date(v.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        msg += `Para ${v.clientes?.nombre}${v.clientes?.telefono ? ' (' + v.clientes.telefono + ')' : ''}:\n"Hola ${v.clientes?.nombre}! Te confirmo que hoy paso a las ${hora} para ${v.descripcion}. Cualquier cosa avisame."\n\n`;
      });
    }

    const notasPend = await notas.notasPendientesHoy();
    if (notasPend.length) {
      msg += '\n📝 Notas pendientes:\n';
      notasPend.forEach((n) => { msg += `  • ${n.titulo || n.contenido.slice(0, 40)}\n`; });
    }
  }
  await bot.telegram.sendMessage(chatId, msg);
}

module.exports = { bot, enviarAgendaDelDia, ejecutarHerramienta, rangoFechas };
