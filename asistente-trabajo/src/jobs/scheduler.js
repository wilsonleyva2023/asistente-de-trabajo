const cron = require('node-cron');
const { bot, enviarAgendaDelDia, rangoFechas } = require('../bot');
const equipos = require('../services/equipos');
const presupuestos = require('../services/presupuestos');
const cobros = require('../services/cobros');
const visitas = require('../services/visitas');
const trabajos = require('../services/trabajos');

const CHAT_ID = process.env.TELEGRAM_CHAT_ID_PERMITIDO;
const TZ = 'America/Argentina/Buenos_Aires';

function iniciarTareasProgramadas() {
  if (!CHAT_ID) {
    console.warn('TELEGRAM_CHAT_ID_PERMITIDO no está configurado: las tareas programadas no van a poder avisarte.');
    return;
  }

  // Agenda a la noche anterior (21:00) y a la mañana (08:00)
  cron.schedule('0 21 * * *', () => enviarAgendaDelDia(CHAT_ID), { timezone: TZ });
  cron.schedule('0 8 * * *', () => enviarAgendaDelDia(CHAT_ID), { timezone: TZ });

  // Resumen semanal, domingos a la noche
  cron.schedule('0 20 * * 0', () => enviarResumenSemanal(CHAT_ID), { timezone: TZ });

  // Mantenimientos de equipos vencidos
  cron.schedule('0 10 * * *', () => revisarMantenimientos(CHAT_ID), { timezone: TZ });

  // Avisos de visitas agendadas con anticipación (se revisa cada 15 minutos)
  cron.schedule('*/15 * * * *', () => revisarAvisosDeVisitas(CHAT_ID), { timezone: TZ });

  // Garantías por vencer, una vez al día
  cron.schedule('0 9 * * *', () => revisarGarantias(CHAT_ID), { timezone: TZ });

  // Resumen de fin de día, a las 19:00
  cron.schedule('0 19 * * *', () => enviarResumenDelDia(CHAT_ID), { timezone: TZ });

  console.log('Tareas programadas iniciadas.');
}

async function enviarResumenSemanal(chatId) {
  const pendientesRecontacto = await presupuestos.presupuestosParaRecontactar(7);
  const cobrosPend = await cobros.cobrosPendientes();
  let msg = '📊 Resumen semanal:\n\n';
  msg += `📋 Presupuestos para recontactar: ${pendientesRecontacto.length}\n`;
  msg += `💰 Cobros pendientes: ${cobrosPend.length}\n`;
  if (cobrosPend.length) {
    const total = cobrosPend.reduce((acc, c) => acc + (Number(c.monto) - Number(c.monto_pagado || 0)), 0);
    msg += `Total pendiente de cobro: $${total}\n`;
  }
  await bot.telegram.sendMessage(chatId, msg);
}

async function revisarMantenimientos(chatId) {
  const lista = await equipos.mantenimientosDelDia();
  for (const m of lista) {
    if (m.aviso_automatico && m.clientes?.telefono) {
      await bot.telegram.sendMessage(
        chatId,
        `🔧 Aviso de mantenimiento para reenviar a ${m.clientes.nombre} (${m.clientes.telefono}):\n\n` +
          `"Hola ${m.clientes.nombre}! Hace un tiempo te instalamos ${m.tipo} y ya sería momento de darle mantenimiento. ¿Coordinamos una visita?"`
      );
    } else if (m.clientes) {
      await bot.telegram.sendMessage(chatId, `🔧 Recordatorio: hoy vence el mantenimiento de ${m.tipo} de ${m.clientes.nombre}. Contactalo cuando puedas.`);
    }
    await equipos.marcarAvisoEnviado(m.id);
  }
}

async function revisarAvisosDeVisitas(chatId) {
  const lista = await visitas.visitasParaAvisar();
  for (const v of lista) {
    const hora = new Date(v.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const fecha = new Date(v.fecha_hora).toLocaleDateString('es-AR');
    await bot.telegram.sendMessage(chatId, `⏰ Recordatorio: tenés una visita con ${v.clientes?.nombre} el ${fecha} a las ${hora} — ${v.descripcion}`);
    await visitas.marcarAvisada(v.id);
  }
}

async function revisarGarantias(chatId) {
  const lista = await trabajos.garantiasPorVencer(5);
  for (const t of lista) {
    await bot.telegram.sendMessage(chatId, `⚠️ La garantía del trabajo "${t.descripcion}" de ${t.clientes?.nombre} vence el ${t.garantia_vencimiento}.`);
  }
}

async function enviarResumenDelDia(chatId) {
  const { desde, hasta } = rangoFechas('hoy');
  const resumen = await visitas.resumenDelDia(desde, hasta);
  if (!resumen.length) return;
  const completados = resumen.filter((v) => v.estado === 'completado');
  const reagendados = resumen.filter((v) => v.estado === 'reagendado');
  const cancelados = resumen.filter((v) => v.estado === 'cancelado');
  let msg = `🌙 Resumen del día:\n\n✅ Hiciste ${completados.length} trabajo(s)`;
  if (reagendados.length) msg += `\n🔁 Reagendaste: ${reagendados.map((v) => v.clientes?.nombre).join(', ')}`;
  if (cancelados.length) msg += `\n❌ Cancelaste: ${cancelados.map((v) => v.clientes?.nombre).join(', ')}`;
  await bot.telegram.sendMessage(chatId, msg);
}

module.exports = { iniciarTareasProgramadas };
