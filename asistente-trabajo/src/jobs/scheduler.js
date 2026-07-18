const cron = require('node-cron');
const { bot, enviarAgendaDelDia } = require('../bot');
const equipos = require('../services/equipos');
const presupuestos = require('../services/presupuestos');
const cobros = require('../services/cobros');

const CHAT_ID = process.env.TELEGRAM_CHAT_ID_PERMITIDO;

function iniciarTareasProgramadas() {
  if (!CHAT_ID) {
    console.warn('TELEGRAM_CHAT_ID_PERMITIDO no está configurado: las tareas programadas no van a poder avisarte.');
    return;
  }

  // Agenda a la noche anterior (21:00) y a la mañana (08:00), hora de Argentina
  cron.schedule('0 21 * * *', () => enviarAgendaDelDia(CHAT_ID), { timezone: 'America/Argentina/Buenos_Aires' });
  cron.schedule('0 8 * * *', () => enviarAgendaDelDia(CHAT_ID), { timezone: 'America/Argentina/Buenos_Aires' });

  // Resumen semanal, domingos a la noche
  cron.schedule('0 20 * * 0', () => enviarResumenSemanal(CHAT_ID), { timezone: 'America/Argentina/Buenos_Aires' });

  // Revisión diaria de mantenimientos y avisos a clientes (10:00)
  cron.schedule('0 10 * * *', () => revisarMantenimientos(CHAT_ID), { timezone: 'America/Argentina/Buenos_Aires' });

  console.log('Tareas programadas iniciadas.');
}

async function enviarResumenSemanal(chatId) {
  const pendientesRecontacto = await presupuestos.presupuestosParaRecontactar(7);
  const cobrosPend = await cobros.cobrosPendientes();
  let msg = '📊 Resumen semanal:\n\n';
  msg += `Presupuestos para recontactar: ${pendientesRecontacto.length}\n`;
  msg += `Cobros pendientes: ${cobrosPend.length}\n`;
  if (cobrosPend.length) {
    const total = cobrosPend.reduce((acc, c) => acc + Number(c.monto), 0);
    msg += `Total pendiente de cobro: $${total}\n`;
  }
  await bot.telegram.sendMessage(chatId, msg);
}

async function revisarMantenimientos(chatId) {
  const lista = await equipos.mantenimientosDelDia();
  for (const m of lista) {
    if (m.aviso_automatico && m.clientes?.telefono) {
      // Nota: esto NO envía WhatsApp automáticamente todavía (requiere WhatsApp Business API,
      // que se conecta más adelante). Por ahora te avisa a vos con el mensaje listo para reenviar.
      await bot.telegram.sendMessage(
        chatId,
        `🔧 Aviso de mantenimiento para reenviar a ${m.clientes.nombre} (${m.clientes.telefono}):\n\n` +
          `"Hola ${m.clientes.nombre}! Hace un tiempo te instalamos ${m.tipo} y ya sería momento de darle mantenimiento. ¿Coordinamos una visita?"`
      );
    } else if (m.clientes) {
      await bot.telegram.sendMessage(
        chatId,
        `🔧 Recordatorio: hoy vence el mantenimiento de ${m.tipo} de ${m.clientes.nombre}. Contactalo cuando puedas.`
      );
    }
    await equipos.marcarAvisoEnviado(m.id);
  }
}

module.exports = { iniciarTareasProgramadas };
