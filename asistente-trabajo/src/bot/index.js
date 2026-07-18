const { Telegraf, Markup } = require('telegraf');
const session = require('./session');
const clientes = require('../services/clientes');
const presupuestos = require('../services/presupuestos');
const cobros = require('../services/cobros');
const equipos = require('../services/equipos');
const recordatorios = require('../services/recordatorios');
const pdf = require('../services/pdf');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Solo tu usuario de Telegram puede usar el bot (seguridad básica).
// Configurá TELEGRAM_CHAT_ID_PERMITIDO en las variables de entorno después
// de mandarle un primer mensaje al bot (te explico cómo obtenerlo en el README).
bot.use((ctx, next) => {
  console.log('MI CHAT ID ES:', ctx.chat?.id);
  const permitido = process.env.TELEGRAM_CHAT_ID_PERMITIDO;
  if (permitido && String(ctx.chat?.id) !== String(permitido)) {
    return ctx.reply('No tenés autorización para usar este asistente.');
  }
  return next();
});

// ---------- Ayuda ----------
bot.start((ctx) => {
  ctx.reply(
    'Hola! Soy tu asistente de trabajo. Comandos disponibles:\n\n' +
      '/nuevocliente - Cargar un cliente nuevo\n' +
      '/clientes - Buscar un cliente\n' +
      '/presupuesto - Crear un presupuesto\n' +
      '/recibo - Generar un recibo de pago\n' +
      '/trabajo - Registrar un trabajo realizado\n' +
      '/equipo - Registrar un equipo instalado (para avisos de mantenimiento)\n' +
      '/recordatorio - Crear un recordatorio\n' +
      '/pendientes - Ver cobros pendientes\n' +
      '/recontactar - Ver presupuestos para recontactar\n' +
      '/agenda - Ver la agenda de hoy\n' +
      '/cancelar - Cancelar lo que estés cargando'
  );
});

bot.command('cancelar', (ctx) => {
  session.limpiar(ctx.chat.id);
  ctx.reply('Listo, cancelado.');
});

// ---------- Nuevo cliente ----------
bot.command('nuevocliente', (ctx) => {
  session.set(ctx.chat.id, { flujo: 'nuevocliente', paso: 'nombre', datos: {} });
  ctx.reply('¿Nombre del cliente?');
});

// ---------- Buscar clientes / ficha ----------
bot.command('clientes', (ctx) => {
  session.set(ctx.chat.id, { flujo: 'buscarcliente', paso: 'texto', datos: {} });
  ctx.reply('¿Nombre (o parte del nombre) del cliente que buscás?');
});

// ---------- Presupuesto ----------
bot.command('presupuesto', (ctx) => {
  session.set(ctx.chat.id, { flujo: 'presupuesto', paso: 'buscar_cliente', datos: {} });
  ctx.reply('¿Para qué cliente es el presupuesto? Escribí el nombre.');
});

// ---------- Recibo ----------
bot.command('recibo', (ctx) => {
  session.set(ctx.chat.id, { flujo: 'recibo', paso: 'buscar_cliente', datos: {} });
  ctx.reply('¿A qué cliente le generás el recibo? Escribí el nombre.');
});

// ---------- Trabajo realizado ----------
bot.command('trabajo', (ctx) => {
  session.set(ctx.chat.id, { flujo: 'trabajo', paso: 'buscar_cliente', datos: {} });
  ctx.reply('¿Para qué cliente fue el trabajo? Escribí el nombre.');
});

// ---------- Equipo instalado / mantenimiento futuro ----------
bot.command('equipo', (ctx) => {
  session.set(ctx.chat.id, { flujo: 'equipo', paso: 'buscar_cliente', datos: {} });
  ctx.reply('¿A qué cliente le instalaste el equipo? Escribí el nombre.');
});

// ---------- Recordatorio simple ----------
bot.command('recordatorio', (ctx) => {
  session.set(ctx.chat.id, { flujo: 'recordatorio', paso: 'texto', datos: {} });
  ctx.reply('¿Qué querés que te recuerde?');
});

// ---------- Consultas directas (sin flujo) ----------
bot.command('pendientes', async (ctx) => {
  const lista = await cobros.cobrosPendientes();
  if (!lista.length) return ctx.reply('No tenés cobros pendientes. 👍');
  let msg = 'Cobros pendientes:\n\n';
  lista.forEach((c) => {
    msg += `• ${c.clientes?.nombre || 'Cliente'} - $${c.monto}${c.fecha_vencimiento ? ' (vence ' + c.fecha_vencimiento + ')' : ''}\n`;
  });
  ctx.reply(msg);
});

bot.command('recontactar', async (ctx) => {
  const lista = await presupuestos.presupuestosParaRecontactar(7);
  if (!lista.length) return ctx.reply('No hay presupuestos para recontactar por ahora.');
  let msg = 'Presupuestos para recontactar (sin novedades hace más de 7 días):\n\n';
  lista.forEach((p) => {
    msg += `• ${p.clientes?.nombre || 'Cliente'} - ${p.descripcion} ($${p.monto || '-'})\n`;
  });
  ctx.reply(msg);
});

bot.command('agenda', async (ctx) => {
  await enviarAgendaDelDia(ctx.chat.id);
});

// ---------- Router principal de texto (según el flujo activo) ----------
bot.on('text', async (ctx) => {
  const estado = session.get(ctx.chat.id);
  if (!estado) return; // no está en medio de ningún flujo, ignoramos
  const texto = ctx.message.text.trim();

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
});

// ================= FLUJOS =================

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
    const p = await presupuestos.crearPresupuesto({
      cliente_id: estado.datos.cliente.id,
      descripcion: estado.datos.descripcion,
      monto,
    });
    const buffer = await pdf.generarPresupuesto({ cliente: estado.datos.cliente, descripcion: estado.datos.descripcion, monto });
    session.limpiar(ctx.chat.id);
    await ctx.replyWithDocument({ source: buffer, filename: `presupuesto-${estado.datos.cliente.nombre}.pdf` });
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
    await ctx.replyWithDocument({ source: buffer, filename: `recibo-${estado.datos.cliente.nombre}.pdf` });
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
    return ctx.reply('Contame qué trabajo hiciste (por texto por ahora, el audio lo sumamos más adelante).');
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
