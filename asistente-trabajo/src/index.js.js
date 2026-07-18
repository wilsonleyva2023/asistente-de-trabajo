require('dotenv').config();
const express = require('express');
const { bot } = require('./bot');
const { iniciarTareasProgramadas } = require('./jobs/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Render necesita que haya un servidor web escuchando en un puerto,
// aunque el "trabajo real" lo hace el bot. Esta ruta sirve para eso.
app.get('/', (req, res) => {
  res.send('Asistente de trabajo funcionando ✅');
});

app.listen(PORT, () => {
  console.log(`Servidor web escuchando en el puerto ${PORT}`);
});

bot
  .launch()
  .then(() => console.log('Bot de Telegram iniciado.'))
  .catch((err) => console.error('Error iniciando el bot:', err));

iniciarTareasProgramadas();

// Apagado prolijo
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
