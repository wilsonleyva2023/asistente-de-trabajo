// Guarda en memoria en qué paso de un comando guiado está cada usuario,
// y el historial reciente de la conversación libre con la IA.
const sesiones = new Map();
const historiales = new Map();

function get(chatId) {
  return sesiones.get(chatId) || null;
}

function set(chatId, estado) {
  sesiones.set(chatId, estado);
}

function limpiar(chatId) {
  sesiones.delete(chatId);
}

function obtenerHistorial(chatId) {
  if (!historiales.has(chatId)) historiales.set(chatId, []);
  return historiales.get(chatId);
}

// Evita que el historial crezca sin límite (y con eso, el costo por mensaje)
function podarHistorial(chatId, maxTurnos = 16) {
  const h = obtenerHistorial(chatId);
  if (h.length > maxTurnos) {
    historiales.set(chatId, h.slice(h.length - maxTurnos));
  }
}

function limpiarHistorial(chatId) {
  historiales.delete(chatId);
}

module.exports = { get, set, limpiar, obtenerHistorial, podarHistorial, limpiarHistorial };
