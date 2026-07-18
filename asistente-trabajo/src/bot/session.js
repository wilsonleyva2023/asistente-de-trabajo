// Guarda en memoria en qué paso de una conversación está cada usuario.
// Como es un asistente para un solo usuario (vos), no hace falta base de datos para esto.
const sesiones = new Map();

function get(chatId) {
  return sesiones.get(chatId) || null;
}

function set(chatId, estado) {
  sesiones.set(chatId, estado);
}

function limpiar(chatId) {
  sesiones.delete(chatId);
}

module.exports = { get, set, limpiar };
