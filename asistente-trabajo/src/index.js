require('dotenv').config();
const express = require('express');
const { bot } = require('./bot');
const { iniciarTareasProgramadas } = require('./jobs/scheduler');

// Salvaguarda: si algo falla de forma inesperada en cualquier parte del código
// (por ejemplo, un corte de red al mandar un archivo a Telegram), esto evita
// que el servidor entero se caiga. Solo se registra el error en los Logs.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection (el servidor sigue funcionando):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception (el servidor sigue funcionando):', err);
});

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Asistente de trabajo funcionando ✅');
});

const WEBHOOK_PATH = `/telegraf/${process.env.TELEGRAM_BOT_TOKEN}`;
app.use(bot.webhookCallback(WEBHOOK_PATH));

app.listen(PORT, async () => {
  console.log(`Servidor web escuchando en el puerto ${PORT}`);
  const dominio = process.env.RENDER_EXTERNAL_URL;
  if (dominio) {
    try {
      await bot.telegram.setWebhook(`${dominio}${WEBHOOK_PATH}`);
      console.log('Webhook de Telegram configurado en', `${dominio}${WEBHOOK_PATH}`);
    } catch (err) {
      console.error('Error configurando el webhook:', err);
    }
  } else {
    console.warn('No se encontró RENDER_EXTERNAL_URL, no se pudo configurar el webhook automáticamente.');
  }
});

iniciarTareasProgramadas();
