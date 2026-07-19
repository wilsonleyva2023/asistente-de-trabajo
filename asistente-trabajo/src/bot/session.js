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

const clienteActivo = new Map();
function setClienteActivo(chatId, clienteId) {
  clienteActivo.set(chatId, clienteId);
}
function obtenerClienteActivo(chatId) {
  return clienteActivo.get(chatId) || null;
}

const presupuestoActivo = new Map();
function setPresupuestoActivo(chatId, presupuestoId) {
  presupuestoActivo.set(chatId, presupuestoId);
}
function obtenerPresupuestoActivo(chatId) {
  return presupuestoActivo.get(chatId) || null;
}

const modoRapido = new Map();
function setModoRapido(chatId, activo) {
  modoRapido.set(chatId, activo);
}
function esModoRapido(chatId) {
  return !!modoRapido.get(chatId);
}

const ultimaAccion = new Map();
function guardarUltimaAccion(chatId, accion) {
  ultimaAccion.set(chatId, accion);
}
function obtenerUltimaAccion(chatId) {
  return ultimaAccion.get(chatId) || null;
}

const ultimaFotoUrl = new Map();
function setUltimaFotoUrl(chatId, url) {
  ultimaFotoUrl.set(chatId, url);
}
function obtenerUltimaFotoUrl(chatId) {
  return ultimaFotoUrl.get(chatId) || null;
}

const ultimoDocumentoUrl = new Map();
function setUltimoDocumentoUrl(chatId, datos) {
  ultimoDocumentoUrl.set(chatId, datos);
}
function obtenerUltimoDocumentoUrl(chatId) {
  return ultimoDocumentoUrl.get(chatId) || null;
}

const ultimoAudio = new Map();
function setUltimoAudio(chatId, datos) {
  ultimoAudio.set(chatId, datos);
}
function obtenerUltimoAudio(chatId) {
  return ultimoAudio.get(chatId) || null;
}

const cobroActivo = new Map();
function setCobroActivo(chatId, cobroId) {
  cobroActivo.set(chatId, cobroId);
}
function obtenerCobroActivo(chatId) {
  return cobroActivo.get(chatId) || null;
}

const visitaActiva = new Map();
function setVisitaActiva(chatId, visitaId) {
  visitaActiva.set(chatId, visitaId);
}
function obtenerVisitaActiva(chatId) {
  return visitaActiva.get(chatId) || null;
}

const equipoActivo = new Map();
function setEquipoActivo(chatId, equipoId) {
  equipoActivo.set(chatId, equipoId);
}
function obtenerEquipoActivo(chatId) {
  return equipoActivo.get(chatId) || null;
}

const notaActiva = new Map();
function setNotaActiva(chatId, notaId) {
  notaActiva.set(chatId, notaId);
}
function obtenerNotaActiva(chatId) {
  return notaActiva.get(chatId) || null;
}

const reporteActivo = new Map();
function setReporteActivo(chatId, tipo) {
  reporteActivo.set(chatId, tipo);
}
function obtenerReporteActivo(chatId) {
  return reporteActivo.get(chatId) || null;
}

module.exports = {
  get, set, limpiar, obtenerHistorial, podarHistorial, limpiarHistorial,
  setClienteActivo, obtenerClienteActivo,
  setPresupuestoActivo, obtenerPresupuestoActivo,
  setModoRapido, esModoRapido,
  guardarUltimaAccion, obtenerUltimaAccion,
  setUltimaFotoUrl, obtenerUltimaFotoUrl,
  setUltimoDocumentoUrl, obtenerUltimoDocumentoUrl,
  setUltimoAudio, obtenerUltimoAudio,
  setCobroActivo, obtenerCobroActivo,
  setVisitaActiva, obtenerVisitaActiva,
  setEquipoActivo, obtenerEquipoActivo,
  setNotaActiva, obtenerNotaActiva,
  setReporteActivo, obtenerReporteActivo,
};
