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

bot.use((ctx, next) => {
  const permitido = process.env.TELEGRAM_CHAT_ID_PERMITIDO;
  if (permitido && String(ctx.chat?.id) !== String(permitido)) {
    return ctx.reply('No tenés autorización para usar este asistente.');
  }
  return next();
});

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

bot.on('text', async (ctx) => {
  const estado = session.get(ctx.chat.id);
  const texto = ctx.message.text.trim();

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
