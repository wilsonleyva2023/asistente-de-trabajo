const { Telegraf, Markup } = require('telegraf');
const session = require('./session');
const clientes = require('../services/clientes');
const presupuestos = require('../services/presupuestos');
const cobros = require('../services/cobros');
const equipos = require('../services/equipos');
const recordatorios = require('../services/recordatorios');
const pdf = require('../services/pdf');
const ia = require('../services/ia');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Solo tu usuario de Telegram puede usar el bot (seguridad básica).
bot.use((ctx, next) => {
  const permitido = process.env.TELEGRAM_CHAT_ID_PERMITIDO;
  if (permitido && String(ctx.chat?.id) !== String(permitido)) {
    return ctx.reply('No tenés autorización para usar este asistente.');
  }
  return next();
});

// ---------- Ayuda ----------
const TEXTO_AYUDA =
  'Hola! Soy tu asistente de trabajo. Podés escribirme normal, como "hacele un presupuesto a Juan por instalar un termotanque, 45000 pesos", o usar estos comandos si preferís algo más guiado:\n\n' +
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
  '/cancelar - Cancelar lo que estés cargando';

bot.start((ctx) => ctx.reply(TEXTO_AYUDA));
bot.command('ayuda', (ctx) => ctx.reply(TEXTO_AYUDA));

bot.command('cancelar', (ctx) => {
  session.limpiar(ctx.chat.id);
  ctx.reply('Listo, cancelado.');
});

// ---------- Comandos guiados (siguen andando igual que antes) ----------
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

// ---------- Router principal de texto ----------
bot.on('text', async (ctx) => {
  const estado = session.get(ctx.chat.id);
  const texto = ctx.message.text.trim();

  // Si está en medio de un flujo guiado (comando paso a paso), seguimos ese flujo
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
        case 'editarpresupuesto':
          await pasoEditarPresupuesto(ctx, estado, texto);
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

  // Si no hay ningún flujo activo, interpretamos el mensaje con IA
  try {
    await ctx.sendChatAction('typing');
    const resultado = await ia.interpretarMensaje(texto);
    await ejecutarAccionIA(ctx, resultado);
  } catch (err) {
    console.error('Error interpretando con IA:', err);
    ctx.reply('No pude entender bien ese mensaje. Podés probar de nuevo con otras palabras, o usar /ayuda para ver los comandos guiados.');
  }
});

// ================= DISPATCHER DE IA =================

async function ejecutarAccionIA(ctx, r) {
  switch (r.accion) {
    case 'saludo_o_ayuda':
      return ctx.reply(TEXTO_AYUDA);

    case 'crear_cliente': {
      if (!r.nombre) return ctx.reply('¿Cómo se llama el cliente que querés cargar?');
      const cliente = await clientes.crearCliente({
        nombre: r.nombre,
        telefono: r.telefono || null,
        direccion: r.direccion || null,
        notas: r.notas || null,
      });
      return ctx.reply(`Cliente "${cliente.nombre}" guardado. ✅`);
    }

    case 'buscar_cliente': {
      if (!r.nombre) return ctx.reply('¿Qué cliente querés buscar?');
      const encontrados = await clientes.buscarClientesPorNombre(r.nombre);
      if (!encontrados.length) return ctx.reply(`No encontré ningún cliente llamado "${r.nombre}".`);
      for (const c of encontrados.slice(0, 5)) {
        const ficha = await clientes.fichaCompleta(c.id);
        ctx.reply(formatearFicha(ficha));
      }
      return;
    }

    case 'crear_presupuesto': {
      const cliente = await resolverCliente(ctx, r.cliente_nombre);
      if (!cliente) return; // ya se avisó al usuario
      if (!r.descripcion) {
        session.set(ctx.chat.id, { flujo: 'presupuesto', paso: 'descripcion', datos: { cliente } });
        return ctx.reply(`Cliente: ${cliente.nombre}. ¿Descripción del trabajo a presupuestar?`);
      }
      if (!r.monto) {
        session.set(ctx.chat.id, { flujo: 'presupuesto', paso: 'monto', datos: { cliente, descripcion: r.descripcion } });
        return ctx.reply('¿Monto del presupuesto?');
      }
      await presupuestos.crearPresupuesto({ cliente_id: cliente.id, descripcion: r.descripcion, monto: r.monto });
      const buffer = await pdf.generarPresupuesto({ cliente, descripcion: r.descripcion, monto: r.monto });
      await ctx.replyWithDocument({ source: buffer, filename: `presupuesto-${cliente.nombre}.pdf` });
      return ctx.reply('Presupuesto guardado y generado. ✅');
    }

    case 'crear_recibo': {
      const cliente = await resolverCliente(ctx, r.cliente_nombre);
      if (!cliente) return;
      if (!r.concepto) {
        session.set(ctx.chat.id, { flujo: 'recibo', paso: 'concepto', datos: { cliente } });
        return ctx.reply(`Cliente: ${cliente.nombre}. ¿Concepto del pago?`);
      }
      if (!r.monto) {
        session.set(ctx.chat.id, { flujo: 'recibo', paso: 'monto', datos: { cliente, concepto: r.concepto } });
        return ctx.reply('¿Monto recibido?');
      }
      const buffer = await pdf.generarRecibo({ cliente, monto: r.monto, concepto: r.concepto });
      await ctx.replyWithDocument({ source: buffer, filename: `recibo-${cliente.nombre}.pdf` });
      return ctx.reply('Recibo generado. ✅');
    }

    case 'registrar_trabajo': {
      const cliente = await resolverCliente(ctx, r.cliente_nombre);
      if (!cliente) return;
      if (!r.descripcion) {
        session.set(ctx.chat.id, { flujo: 'trabajo', paso: 'descripcion', datos: { cliente } });
        return ctx.reply(`Cliente: ${cliente.nombre}. Contame qué trabajo hiciste.`);
      }
      await recordatorios.registrarTrabajo({ cliente_id: cliente.id, descripcion: r.descripcion });
      return ctx.reply('Trabajo registrado. ✅');
    }

    case 'crear_recordatorio': {
      if (!r.texto) return ctx.reply('¿Qué querés que te recuerde?');
      if (!r.fecha_hora_iso) {
        session.set(ctx.chat.id, { flujo: 'recordatorio', paso: 'fecha', datos: { texto: r.texto } });
        return ctx.reply('¿Para cuándo? Escribilo así: DD/MM/AAAA HH:MM');
      }
      await recordatorios.crearRecordatorio({ texto: r.texto, fecha_hora: r.fecha_hora_iso });
      return ctx.reply('Recordatorio guardado. ✅');
    }

    case 'registrar_equipo': {
      const cliente = await resolverCliente(ctx, r.cliente_nombre);
      if (!cliente) return;
      if (!r.tipo) {
        session.set(ctx.chat.id, { flujo: 'equipo', paso: 'tipo', datos: { cliente } });
        return ctx.reply(`Cliente: ${cliente.nombre}. ¿Qué equipo instalaste?`);
      }
      const equipo = await equipos.registrarEquipo({
        cliente_id: cliente.id,
        tipo: r.tipo,
        fecha_instalacion: new Date().toISOString().slice(0, 10),
        meses_para_mantenimiento: r.meses_mantenimiento || null,
        aviso_automatico: !!r.aviso_automatico,
      });
      if (equipo.proximo_mantenimiento) {
        return ctx.reply(
          `Listo, mantenimiento programado para ${equipo.proximo_mantenimiento}. ${equipo.aviso_automatico ? 'Se le avisará automáticamente al cliente.' : 'Te voy a avisar a vos ese día.'} ✅`
        );
      }
      return ctx.reply('Equipo registrado. ✅');
    }

    case 'editar_presupuesto': {
      const cliente = await resolverCliente(ctx, r.cliente_nombre);
      if (!cliente) return;
      const lista = await presupuestos.obtenerPresupuestosPorCliente(cliente.id);
      if (!lista.length) return ctx.reply(`${cliente.nombre} no tiene presupuestos guardados todavía.`);
      if (lista.length === 1) {
        return aplicarEdicionPresupuesto(ctx, lista[0], r.nuevo_monto, r.nueva_descripcion);
      }
      session.set(ctx.chat.id, {
        flujo: 'editarpresupuesto',
        paso: 'elegir',
        datos: { opciones: lista, nuevo_monto: r.nuevo_monto || null, nueva_descripcion: r.nueva_descripcion || null },
      });
      return ctx.reply(
        `${cliente.nombre} tiene varios presupuestos. ¿Cuál querés modificar? Respondé con el número:\n` +
          lista.map((p, i) => `${i + 1}. ${p.descripcion} - $${p.monto} (${new Date(p.fecha_creacion).toLocaleDateString('es-AR')})`).join('\n')
      );
    }

    case 'consultar_pendientes':
      return enviarPendientes(ctx);

    case 'consultar_recontactar':
      return enviarRecontactar(ctx);

    case 'consultar_agenda':
      return enviarAgendaDelDia(ctx.chat.id);

    default:
      return ctx.reply('No entendí bien qué querés hacer. Podés reformularlo, o escribir /ayuda para ver los comandos guiados.');
  }
}

// Busca un cliente por nombre; si hay 0 o varios resultados, le avisa al usuario y devuelve null
async function resolverCliente(ctx, nombre) {
  if (!nombre) {
    ctx.reply('¿Para qué cliente es? Decime el nombre.');
    return null;
  }
  const encontrados = await clientes.buscarClientesPorNombre(nombre);
  if (!encontrados.length) {
    ctx.reply(`No encontré ningún cliente llamado "${nombre}". Podés cargarlo primero con /nuevocliente.`);
    return null;
  }
  if (encontrados.length > 1) {
    ctx.reply('Encontré varios con ese nombre:\n' + encontrados.map((c, i) => `${i + 1}. ${c.nombre}`).join('\n') + '\n\nEscribí el nombre completo para elegir uno.');
    return null;
  }
  return encontrados[0];
}

// ================= CONSULTAS =================

async function enviarPendientes(ctx) {
  const lista = await cobros.cobrosPendientes();
  if (!lista.length) return ctx.reply('No tenés cobros pendientes. 👍');
  let msg = 'Cobros pendientes:\n\n';
  lista.forEach((c) => {
    msg += `• ${c.clientes?.nombre || 'Cliente'} - $${c.monto}${c.fecha_vencimiento ? ' (vence ' + c.fecha_vencimiento + ')' : ''}\n`;
  });
  ctx.reply(msg);
}

async function enviarRecontactar(ctx) {
  const lista = await presupuestos.presupuestosParaRecontactar(7);
  if (!lista.length) return ctx.reply('No hay presupuestos para recontactar por ahora.');
  let msg = 'Presupuestos para recontactar (sin novedades hace más de 7 días):\n\n';
  lista.forEach((p) => {
    msg += `• ${p.clientes?.nombre || 'Cliente'} - ${p.descripcion} ($${p.monto || '-'})\n`;
  });
  ctx.reply(msg);
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

async function aplicarEdicionPresupuesto(ctx, presupuesto, nuevoMonto, nuevaDescripcion) {
  const cambios = {};
  if (nuevoMonto) cambios.monto = nuevoMonto;
  if (nuevaDescripcion) cambios.descripcion = nuevaDescripcion;
  if (!Object.keys(cambios).length) {
    return ctx.reply('¿Qué querés cambiar, el monto o la descripción?');
  }
  const actualizado = await presupuestos.actualizarPresupuesto(presupuesto.id, cambios);
  return ctx.reply(`Presupuesto actualizado: "${actualizado.descripcion}" - $${actualizado.monto}. ✅`);
}

async function pasoEditarPresupuesto(ctx, estado, texto) {
  if (estado.paso === 'elegir') {
    const idx = parseInt(texto, 10) - 1;
    const elegido = estado.datos.opciones?.[idx];
    if (!elegido) return ctx.reply('Número inválido, probá de nuevo.');
    session.limpiar(ctx.chat.id);
    return aplicarEdicionPresupuesto(ctx, elegido, estado.datos.nuevo_monto, estado.datos.nueva_descripcion);
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
