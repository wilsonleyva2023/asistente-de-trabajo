require('dotenv').config();
const express = require('express');
const { bot } = require('./bot');
const { iniciarTareasProgramadas } = require('./jobs/scheduler');

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
