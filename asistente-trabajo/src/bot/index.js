const { Telegraf, Markup } = require('telegraf');
const https = require('https');
const session = require('./session');
const clientes = require('../services/clientes');
const presupuestos = require('../services/presupuestos');
const cobros = require('../services/cobros');
const equipos = require('../services/equipos');
const recordatorios = require('../services/recordatorios');
const notas = require('../services/notas');
const pdf = require('../services/pdf');
const ia = require('../services/ia');

// keepAlive: false evita "socket hang up" al reutilizar conexiones que
// el servidor ya cerró (común en hosting gratuito como Render).
const agenteSinKeepAlive = new https.Agent({ keepAlive: false });

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, {
  telegram: { agent: agenteSinKeepAlive },
});

bot.use((ctx, next) => {
  const permitido = process.env.TELEGRAM_CHAT_ID_PERMITIDO;
  if (permitido && String(ctx.chat?.id) !== String(permitido)) {
    return ctx.reply('No tenés autorización para usar este asistente.');
  }
  return next();
});

const TEXTO_AYUDA =
  'Hola! Soy tu asistente de trabajo. Podés hablarme normal, de lo que necesites: cargar un cliente, hacer un presupuesto, anotar una lista de materiales, lo que sea. También tenés comandos guiados si preferís:\n\n' +
  '/nuevocliente - Cargar un cliente nuevo\n' +
  '/clientes - Buscar un cliente\n' +
  '/presupuesto - Crear un presupuesto\n' +
  '/recibo - Generar un recibo de pago\n' +
  '/trabajo - Registrar un trabajo realizado\n' +
  '/equipo - Registrar un equipo instalado\n' +
  '/recordatorio - Crear un recordatorio\n' +
  '/pendientes - Ver cobros pendientes\n' +
  '/recontactar - Ver presupuestos para recontactar\n' +
  '/agenda - Ver la agenda de hoy\n' +
  '/cancelar - Cancelar lo que estés cargando';

bot.start((ctx) => ctx.reply(TEXTO_AYUDA));
bot.command('ayuda', (ctx) => ctx.reply(TEXTO_AYUDA));

bot.command('cancelar', (ctx) => {
  session.limpiar(ctx.chat.id);
  ctx.reply('Listo, cancelado.');
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

bot.command('pendientes', (ctx) => enviarPendientes(ctx));
bot.command('recontactar', (ctx) => enviarRecontactar(ctx));
bot.command('agenda', async (ctx) => enviarAgendaDelDia(ctx.chat.id));

// ================= ROUTER PRINCIPAL =================

async function procesarTexto(ctx, texto) {
  const estado = session.get(ctx.chat.id);

  // Si está en medio de un comando guiado, seguimos ese flujo paso a paso
  if (estado) {
    try {
      switch (estado.flujo) {
        case 'nuevocliente':
          await pasoNuevoCliente(ctx, estado, texto);
          break;
        case 'buscarcliente':
          await pasoBuscarCliente(ctx, estado, texto);
          break;
        case 'presupuesto':
          await pasoPresupuesto(ctx, estado, texto);
          break;
        case 'recibo':
          await pasoRecibo(ctx, estado, texto);
          break;
        case 'trabajo':
          await pasoTrabajo(ctx, estado, texto);
          break;
        case 'equipo':
          await pasoEquipo(ctx, estado, texto);
          break;
        case 'recordatorio':
          await pasoRecordatorio(ctx, estado, texto);
          break;
      }
    } catch (err) {
      console.error(err);
      ctx.reply('Uy, pasó un error guardando eso. Probá de nuevo con /cancelar y empezar otra vez.');
      session.limpiar(ctx.chat.id);
    }
    return;
  }

  // Si no hay ningún comando guiado activo, conversamos libre con la IA (con herramientas)
  try {
    await ctx.sendChatAction('typing');
    const historial = session.obtenerHistorial(ctx.chat.id);
    const respuesta = await ia.conversar(historial, texto, (nombre, args) => ejecutarHerramienta(ctx, nombre, args));
    session.podarHistorial(ctx.chat.id);
    await ctx.reply(respuesta);
  } catch (err) {
    console.error('Error conversando con IA:', err);
    session.limpiarHistorial(ctx.chat.id);
    ctx.reply('Uy, tuve un problema procesando eso. Ya reinicié la memoria de esta charla, probá de nuevo.');
  }
}

bot.on('text', async (ctx) => {
  await procesarTexto(ctx, ctx.message.text.trim());
});

bot.on('voice', async (ctx) => {
  try {
    await ctx.sendChatAction('typing');
    const fileId = ctx.message.voice.file_id;
    const url = await ctx.telegram.getFileLink(fileId);
    const resp = await fetch(url);
    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const texto = await ia.transcribirAudio(buffer, 'audio/ogg');
    await ctx.reply(`🎙️ Entendí: "${texto}"`);
    await procesarTexto(ctx, texto);
  } catch (err) {
    console.error('Error interpretando audio:', err);
    ctx.reply('No pude entender ese audio. Probá de nuevo o escribilo por texto.');
  }
});

async function procesarConArchivo(ctx, texto, buffer, mimeType) {
  const estado = session.get(ctx.chat.id);
  if (estado) {
    return ctx.reply('Recibí el archivo, pero estás en medio de completar otra cosa. Escribí /cancelar primero si querés que lo procese.');
  }
  try {
    await ctx.sendChatAction('typing');
    const historial = session.obtenerHistorial(ctx.chat.id);
    const respuesta = await ia.conversar(historial, texto, (nombre, args) => ejecutarHerramienta(ctx, nombre, args), [
      { mimeType, data: buffer.toString('base64') },
    ]);
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
    const fotos = ctx.message.photo;
    const fileId = fotos[fotos.length - 1].file_id; // la de mayor resolución
    const url = await ctx.telegram.getFileLink(fileId);
    const resp = await fetch(url);
    const buffer = Buffer.from(await resp.arrayBuffer());
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
    const resp = await fetch(url);
    const buffer = Buffer.from(await resp.arrayBuffer());
    const mime = doc.mime_type || 'application/octet-stream';
    const texto = ctx.message.caption || `Te mando un documento (${doc.file_name || 'sin nombre'}). Fijate qué es y decime qué te parece o ayudame con lo que corresponda.`;
    await procesarConArchivo(ctx, texto, buffer, mime);
  } catch (err) {
    console.error('Error procesando documento:', err);
    ctx.reply('No pude procesar ese documento. Puede que el formato no sea compatible. Probá con una foto o un PDF.');
  }
});

// ================= HERRAMIENTAS QUE LA IA PUEDE USAR =================

// A veces Render tiene cortes de red breves al mandar archivos grandes a Telegram.
// Reintentamos un par de veces antes de rendirnos.
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

async function resolverClienteSimple(nombre) {
  if (!nombre) return null;
  const encontrados = await clientes.buscarClientesPorNombre(nombre);
  if (!encontrados.length) return null;
  if (encontrados.length > 1) return { multiple: true, nombres: encontrados.map((c) => c.nombre) };
  return encontrados[0];
}

async function ejecutarHerramienta(ctx, nombre, args) {
  switch (nombre) {
    case 'buscar_cliente': {
      const encontrados = await clientes.buscarClientesPorNombre(args.nombre || '');
      if (!encontrados.length) return { encontrado: false };
      for (const c of encontrados.slice(0, 5)) {
        const ficha = await clientes.fichaCompleta(c.id);
        await ctx.reply(formatearFicha(ficha));
      }
      return { encontrado: true, cantidad: encontrados.length };
    }

    case 'crear_cliente': {
      const cliente = await clientes.crearCliente({
        nombre: args.nombre,
        telefono: args.telefono || null,
        direccion: args.direccion || null,
        notas: args.notas || null,
      });
      return { ok: true, nombre: cliente.nombre };
    }

    case 'crear_presupuesto': {
      const cliente = await resolverClienteSimple(args.cliente_nombre);
      if (!cliente) return { error: `No encontré ningún cliente llamado "${args.cliente_nombre}". Sugerile cargarlo primero.` };
      if (cliente.multiple) return { error: `Hay varios clientes parecidos: ${cliente.nombres.join(', ')}. Preguntale al usuario cuál es exactamente.` };
      await presupuestos.crearPresupuesto({ cliente_id: cliente.id, descripcion: args.descripcion, monto: args.monto });
      const buffer = await pdf.generarPresupuesto({
        cliente,
        descripcion: args.descripcion,
        monto: args.monto,
        direccionTrabajo: args.direccion_trabajo,
        alcance: args.alcance_texto,
        incluirAlcance: args.incluir_alcance !== false,
        garantia: args.garantia_texto,
        incluirGarantia: args.incluir_garantia !== false,
        formaPago: args.forma_pago_texto,
        incluirFormaPago: args.incluir_forma_pago !== false,
      });
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `presupuesto-${cliente.nombre}.pdf` });
      return { ok: true, mensaje: 'Presupuesto creado y PDF enviado.' };
    }

    case 'editar_presupuesto': {
      const cliente = await resolverClienteSimple(args.cliente_nombre);
      if (!cliente) return { error: `No encontré ningún cliente llamado "${args.cliente_nombre}".` };
      if (cliente.multiple) return { error: `Hay varios clientes parecidos: ${cliente.nombres.join(', ')}. Preguntale cuál es.` };
      const ultimo = await presupuestos.obtenerUltimoPresupuesto(cliente.id);
      if (!ultimo) return { error: `${cliente.nombre} no tiene presupuestos guardados.` };
      const cambios = {};
      if (args.nuevo_monto) cambios.monto = args.nuevo_monto;
      if (args.nueva_descripcion) cambios.descripcion = args.nueva_descripcion;
      if (!Object.keys(cambios).length) return { error: 'No se especificó qué cambiar.' };
      const actualizado = await presupuestos.actualizarPresupuesto(ultimo.id, cambios);
      return { ok: true, descripcion: actualizado.descripcion, monto: actualizado.monto };
    }

    case 'reenviar_presupuesto': {
      const cliente = await resolverClienteSimple(args.cliente_nombre);
      if (!cliente) return { error: `No encontré ningún cliente llamado "${args.cliente_nombre}".` };
      if (cliente.multiple) return { error: `Hay varios clientes parecidos: ${cliente.nombres.join(', ')}. Preguntale cuál es.` };
      const ultimo = await presupuestos.obtenerUltimoPresupuesto(cliente.id);
      if (!ultimo) return { error: `${cliente.nombre} no tiene presupuestos guardados.` };
      const buffer = await pdf.generarPresupuesto({
        cliente,
        descripcion: ultimo.descripcion,
        monto: ultimo.monto,
        direccionTrabajo: args.direccion_trabajo,
        alcance: args.alcance_texto,
        incluirAlcance: args.incluir_alcance !== false,
        garantia: args.garantia_texto,
        incluirGarantia: args.incluir_garantia !== false,
        formaPago: args.forma_pago_texto,
        incluirFormaPago: args.incluir_forma_pago !== false,
      });
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `presupuesto-${cliente.nombre}.pdf` });
      return { ok: true };
    }

    case 'crear_recibo': {
      const cliente = await resolverClienteSimple(args.cliente_nombre);
      if (!cliente) return { error: `No encontré ningún cliente llamado "${args.cliente_nombre}".` };
      if (cliente.multiple) return { error: `Hay varios clientes parecidos: ${cliente.nombres.join(', ')}. Preguntale cuál es.` };
      const buffer = await pdf.generarRecibo({ cliente, monto: args.monto, concepto: args.concepto });
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `recibo-${cliente.nombre}.pdf` });
      return { ok: true, mensaje: 'Recibo generado y enviado.' };
    }

    case 'registrar_trabajo': {
      const cliente = await resolverClienteSimple(args.cliente_nombre);
      if (!cliente) return { error: `No encontré ningún cliente llamado "${args.cliente_nombre}".` };
      if (cliente.multiple) return { error: `Hay varios clientes parecidos: ${cliente.nombres.join(', ')}. Preguntale cuál es.` };
      await recordatorios.registrarTrabajo({ cliente_id: cliente.id, descripcion: args.descripcion });
      return { ok: true };
    }

    case 'registrar_equipo': {
      const cliente = await resolverClienteSimple(args.cliente_nombre);
      if (!cliente) return { error: `No encontré ningún cliente llamado "${args.cliente_nombre}".` };
      if (cliente.multiple) return { error: `Hay varios clientes parecidos: ${cliente.nombres.join(', ')}. Preguntale cuál es.` };
      const equipo = await equipos.registrarEquipo({
        cliente_id: cliente.id,
        tipo: args.tipo,
        fecha_instalacion: new Date().toISOString().slice(0, 10),
        meses_para_mantenimiento: args.meses_mantenimiento || null,
        aviso_automatico: !!args.aviso_automatico,
      });
      return { ok: true, proximo_mantenimiento: equipo.proximo_mantenimiento || null };
    }

    case 'crear_recordatorio': {
      await recordatorios.crearRecordatorio({ texto: args.texto, fecha_hora: args.fecha_hora_iso });
      return { ok: true };
    }

    case 'consultar_pendientes': {
      const lista = await cobros.cobrosPendientes();
      if (!lista.length) {
        await ctx.reply('No tenés cobros pendientes. 👍');
        return { cantidad: 0 };
      }
      let msg = 'Cobros pendientes:\n\n';
      lista.forEach((c) => {
        msg += `• ${c.clientes?.nombre || 'Cliente'} - $${c.monto}${c.fecha_vencimiento ? ' (vence ' + c.fecha_vencimiento + ')' : ''}\n`;
      });
      await ctx.reply(msg);
      return { cantidad: lista.length };
    }

    case 'consultar_recontactar': {
      const lista = await presupuestos.presupuestosParaRecontactar(7);
      if (!lista.length) {
        await ctx.reply('No hay presupuestos para recontactar por ahora.');
        return { cantidad: 0 };
      }
      let msg = 'Presupuestos para recontactar:\n\n';
      lista.forEach((p) => {
        msg += `• ${p.clientes?.nombre || 'Cliente'} - ${p.descripcion} ($${p.monto || '-'})\n`;
      });
      await ctx.reply(msg);
      return { cantidad: lista.length };
    }

    case 'consultar_agenda': {
      await enviarAgendaDelDia(ctx.chat.id);
      return { ok: true };
    }

    case 'guardar_nota': {
      await notas.crearNota({ titulo: args.titulo || null, contenido: args.contenido });
      return { ok: true };
    }

    case 'buscar_nota': {
      const encontradas = await notas.buscarNotas(args.busqueda || '');
      if (!encontradas.length) return { encontrado: false };
      let msg = '📝 Encontré esto:\n\n';
      encontradas.forEach((n) => {
        msg += `${n.titulo ? `*${n.titulo}*\n` : ''}${n.contenido}\n\n`;
      });
      await ctx.reply(msg);
      return { encontrado: true, cantidad: encontradas.length };
    }

    case 'generar_documento': {
      const buffer = await pdf.generarDocumentoLibre({ titulo: args.titulo, contenido: args.contenido });
      await enviarDocumentoConReintento(ctx, { source: buffer, filename: `${args.titulo || 'documento'}.pdf` });
      return { ok: true };
    }

    case 'eliminar_presupuesto': {
      const cliente = await resolverClienteSimple(args.cliente_nombre);
      if (!cliente) return { error: `No encontré ningún cliente llamado "${args.cliente_nombre}".` };
      if (cliente.multiple) return { error: `Hay varios clientes parecidos: ${cliente.nombres.join(', ')}. Preguntale cuál es.` };
      const ultimo = await presupuestos.obtenerUltimoPresupuesto(cliente.id);
      if (!ultimo) return { error: `${cliente.nombre} no tiene presupuestos guardados.` };
      await presupuestos.eliminarPresupuesto(ultimo.id);
      return { ok: true, mensaje: `Presupuesto de ${cliente.nombre} borrado.` };
    }

    case 'eliminar_cobro': {
      const cliente = await resolverClienteSimple(args.cliente_nombre);
      if (!cliente) return { error: `No encontré ningún cliente llamado "${args.cliente_nombre}".` };
      if (cliente.multiple) return { error: `Hay varios clientes parecidos: ${cliente.nombres.join(', ')}. Preguntale cuál es.` };
      const lista = await cobros.obtenerCobrosPorCliente(cliente.id);
      if (!lista.length) return { error: `${cliente.nombre} no tiene cobros/deudas guardadas.` };
      await cobros.eliminarCobro(lista[0].id);
      return { ok: true, mensaje: `Cobro de ${cliente.nombre} borrado.` };
    }

    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

// ================= FLUJOS GUIADOS (comandos paso a paso) =================

async function pasoNuevoCliente(ctx, estado, texto) {
  if (estado.paso === 'nombre') {
    estado.datos.nombre = texto;
    estado.paso = 'telefono';
    session.set(ctx.chat.id, estado);
    return ctx.reply('¿Teléfono? (o escribí "no" si no tenés)');
  }
  if (estado.paso === 'telefono') {
    estado.datos.telefono = texto.toLowerCase() === 'no' ? null : texto;
    estado.paso = 'direccion';
    session.set(ctx.chat.id, estado);
    return ctx.reply('¿Dirección? (o "no")');
  }
  if (estado.paso === 'direccion') {
    estado.datos.direccion = texto.toLowerCase() === 'no' ? null : texto;
    estado.paso = 'notas';
    session.set(ctx.chat.id, estado);
    return ctx.reply('¿Alguna nota sobre el cliente? (o "no")');
  }
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
  for (const c of encontrados.slice(0, 5)) {
    const ficha = await clientes.fichaCompleta(c.id);
    ctx.reply(formatearFicha(ficha));
  }
}

function formatearFicha({ cliente, equipos, presupuestos, cobros, trabajos }) {
  let msg = `📋 ${cliente.nombre}\n`;
  if (cliente.telefono) msg += `Tel: ${cliente.telefono}\n`;
  if (cliente.direccion) msg += `Dirección: ${cliente.direccion}\n`;
  if (equipos?.length) {
    msg += `\nEquipos instalados:\n`;
    equipos.forEach((e) => (msg += `  • ${e.tipo} (instalado ${e.fecha_instalacion})\n`));
  }
  if (presupuestos?.length) {
    msg += `\nPresupuestos:\n`;
    presupuestos.forEach((p) => (msg += `  • ${p.descripcion} - $${p.monto || '-'} [${p.estado}]\n`));
  }
  if (cobros?.length) {
    msg += `\nCobros:\n`;
    cobros.forEach((c) => (msg += `  • $${c.monto} [${c.estado}]\n`));
  }
  if (trabajos?.length) {
    msg += `\nÚltimos trabajos:\n`;
    trabajos.slice(0, 3).forEach((t) => (msg += `  • ${t.fecha}: ${t.descripcion}\n`));
  }
  return msg;
}

async function pasoPresupuesto(ctx, estado, texto) {
  if (estado.paso === 'buscar_cliente') {
    const encontrados = await clientes.buscarClientesPorNombre(texto);
    if (!encontrados.length) return ctx.reply('No encontré ese cliente. Probá con /nuevocliente primero, o escribí otro nombre.');
    if (encontrados.length === 1) {
      estado.datos.cliente = encontrados[0];
      estado.paso = 'descripcion';
      session.set(ctx.chat.id, estado);
      return ctx.reply(`Cliente: ${encontrados[0].nombre}. ¿Descripción del trabajo a presupuestar?`);
    }
    estado.datos.opciones = encontrados;
    estado.paso = 'elegir_cliente';
    session.set(ctx.chat.id, estado);
    return ctx.reply('Encontré varios, respondé con el número:\n' + encontrados.map((c, i) => `${i + 1}. ${c.nombre}`).join('\n'));
  }
  if (estado.paso === 'elegir_cliente') {
    const idx = parseInt(texto, 10) - 1;
    const elegido = estado.datos.opciones?.[idx];
    if (!elegido) return ctx.reply('Número inválido, probá de nuevo.');
    estado.datos.cliente = elegido;
    estado.paso = 'descripcion';
    session.set(ctx.chat.id, estado);
    return ctx.reply('¿Descripción del trabajo a presupuestar?');
  }
  if (estado.paso === 'descripcion') {
    estado.datos.descripcion = texto;
    estado.paso = 'monto';
    session.set(ctx.chat.id, estado);
    return ctx.reply('¿Monto del presupuesto? (solo el número)');
  }
  if (estado.paso === 'monto') {
    const monto = parseFloat(texto.replace(',', '.'));
    if (isNaN(monto)) return ctx.reply('Poné solo el número, ej: 45000');
    estado.datos.monto = monto;
    await presupuestos.crearPresupuesto({
      cliente_id: estado.datos.cliente.id,
      descripcion: estado.datos.descripcion,
      monto,
    });
    const buffer = await pdf.generarPresupuesto({ cliente: estado.datos.cliente, descripcion: estado.datos.descripcion, monto });
    session.limpiar(ctx.chat.id);
    await enviarDocumentoConReintento(ctx, { source: buffer, filename: `presupuesto-${estado.datos.cliente.nombre}.pdf` });
    return ctx.reply('Presupuesto guardado y generado. ✅ Se lo podés reenviar al cliente por WhatsApp.');
  }
}

async function pasoRecibo(ctx, estado, texto) {
  if (estado.paso === 'buscar_cliente') {
    const encontrados = await clientes.buscarClientesPorNombre(texto);
    if (!encontrados.length) return ctx.reply('No encontré ese cliente.');
    estado.datos.cliente = encontrados[0];
    estado.paso = 'concepto';
    session.set(ctx.chat.id, estado);
    return ctx.reply(`Cliente: ${encontrados[0].nombre}. ¿Concepto del pago? (ej: "Instalación termotanque")`);
  }
  if (estado.paso === 'concepto') {
    estado.datos.concepto = texto;
    estado.paso = 'monto';
    session.set(ctx.chat.id, estado);
    return ctx.reply('¿Monto recibido?');
  }
  if (estado.paso === 'monto') {
    const monto = parseFloat(texto.replace(',', '.'));
    if (isNaN(monto)) return ctx.reply('Poné solo el número.');
    const buffer = await pdf.generarRecibo({ cliente: estado.datos.cliente, monto, concepto: estado.datos.concepto });
    session.limpiar(ctx.chat.id);
    await enviarDocumentoConReintento(ctx, { source: buffer, filename: `recibo-${estado.datos.cliente.nombre}.pdf` });
    return ctx.reply('Recibo generado. ✅');
  }
}

async function pasoTrabajo(ctx, estado, texto) {
  if (estado.paso === 'buscar_cliente') {
    const encontrados = await clientes.buscarClientesPorNombre(texto);
    if (!encontrados.length) return ctx.reply('No encontré ese cliente.');
    estado.datos.cliente = encontrados[0];
    estado.paso = 'descripcion';
    session.set(ctx.chat.id, estado);
    return ctx.reply('Contame qué trabajo hiciste.');
  }
  if (estado.paso === 'descripcion') {
    await recordatorios.registrarTrabajo({ cliente_id: estado.datos.cliente.id, descripcion: texto });
    session.limpiar(ctx.chat.id);
    return ctx.reply('Trabajo registrado. ✅');
  }
}

async function pasoEquipo(ctx, estado, texto) {
  if (estado.paso === 'buscar_cliente') {
    const encontrados = await clientes.buscarClientesPorNombre(texto);
    if (!encontrados.length) return ctx.reply('No encontré ese cliente.');
    estado.datos.cliente = encontrados[0];
    estado.paso = 'tipo';
    session.set(ctx.chat.id, estado);
    return ctx.reply('¿Qué equipo instalaste? (ej: termotanque, split, cámara)');
  }
  if (estado.paso === 'tipo') {
    estado.datos.tipo = texto;
    estado.paso = 'meses';
    session.set(ctx.chat.id, estado);
    return ctx.reply('¿En cuántos meses hay que hacerle mantenimiento? (ej: 6). Si no aplica, escribí "no".');
  }
  if (estado.paso === 'meses') {
    estado.datos.meses = texto.toLowerCase() === 'no' ? null : parseInt(texto, 10);
    if (!estado.datos.meses) {
      await equipos.registrarEquipo({
        cliente_id: estado.datos.cliente.id,
        tipo: estado.datos.tipo,
        fecha_instalacion: new Date().toISOString().slice(0, 10),
      });
      session.limpiar(ctx.chat.id);
      return ctx.reply('Equipo registrado (sin recordatorio de mantenimiento). ✅');
    }
    estado.paso = 'aviso';
    session.set(ctx.chat.id, estado);
    return ctx.reply(
      `Cuando se cumpla la fecha, ¿querés que le avise directo al cliente por WhatsApp, o preferís que te avise a vos para escribirle personalmente?`,
      Markup.keyboard(['Avisar al cliente automático', 'Avisarme a mí']).oneTime().resize()
    );
  }
  if (estado.paso === 'aviso') {
    const automatico = texto.toLowerCase().includes('cliente');
    const equipo = await equipos.registrarEquipo({
      cliente_id: estado.datos.cliente.id,
      tipo: estado.datos.tipo,
      fecha_instalacion: new Date().toISOString().slice(0, 10),
      meses_para_mantenimiento: estado.datos.meses,
      aviso_automatico: automatico,
    });
    session.limpiar(ctx.chat.id);
    return ctx.reply(
      `Listo, mantenimiento programado para ${equipo.proximo_mantenimiento}. ${automatico ? 'Se le avisará automáticamente al cliente.' : 'Te voy a avisar a vos ese día para que lo contactes.'} ✅`,
      Markup.removeKeyboard()
    );
  }
}

async function pasoRecordatorio(ctx, estado, texto) {
  if (estado.paso === 'texto') {
    estado.datos.texto = texto;
    estado.paso = 'fecha';
    session.set(ctx.chat.id, estado);
    return ctx.reply('¿Para cuándo? Escribilo así: DD/MM/AAAA HH:MM (ej: 25/12/2026 09:00)');
  }
  if (estado.paso === 'fecha') {
    const match = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (!match) return ctx.reply('Formato inválido. Probá así: 25/12/2026 09:00');
    const [, d, m, y, h, min] = match;
    const fecha = new Date(y, m - 1, d, h, min);
    await recordatorios.crearRecordatorio({ texto: estado.datos.texto, fecha_hora: fecha.toISOString() });
    session.limpiar(ctx.chat.id);
    return ctx.reply('Recordatorio guardado. ✅');
  }
}

// ================= AGENDA / CONSULTAS DIRECTAS =================

async function enviarPendientes(ctx) {
  await ejecutarHerramienta(ctx, 'consultar_pendientes', {});
}

async function enviarRecontactar(ctx) {
  await ejecutarHerramienta(ctx, 'consultar_recontactar', {});
}

async function enviarAgendaDelDia(chatId) {
  const recs = await recordatorios.recordatoriosPendientesHoy();
  const mants = await equipos.mantenimientosDelDia();
  let msg = '📅 Agenda de hoy:\n\n';
  if (!recs.length && !mants.length) {
    msg += 'No tenés nada pendiente para hoy. 👍';
  } else {
    recs.forEach((r) => {
      const hora = new Date(r.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      msg += `⏰ ${hora} - ${r.texto}\n`;
    });
    mants.forEach((m) => {
      msg += `🔧 Mantenimiento: ${m.tipo} de ${m.clientes?.nombre}${m.aviso_automatico ? ' (se le avisa solo)' : ' (contactalo vos)'}\n`;
    });
  }
  await bot.telegram.sendMessage(chatId, msg);
}

module.exports = { bot, enviarAgendaDelDia };
