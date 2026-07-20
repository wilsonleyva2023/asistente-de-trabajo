// Utilidad central para fechas: SIEMPRE calcula el día calendario según Argentina,
// nunca según el huso horario del servidor (que corre en UTC).
// Usar esta función en cualquier lugar donde se necesite "la fecha de hoy" o
// convertir una fecha/hora a formato YYYY-MM-DD para guardar en la base de datos.

function fechaAR(fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(fecha);
}

// Primer día del mes siguiente a un "YYYY-MM", calculado con números puros (sin Date ni huso horario),
// para usar en comparaciones contra columnas de solo fecha (sin hora).
function primerDiaMesSiguiente(mesISO) {
  const [anio, mes] = mesISO.split('-').map(Number);
  const anioSig = mes === 12 ? anio + 1 : anio;
  const mesSig = mes === 12 ? 1 : mes + 1;
  return `${anioSig}-${String(mesSig).padStart(2, '0')}-01`;
}

// Suma días a la fecha de HOY (Argentina) y devuelve YYYY-MM-DD
function fechaARMasDias(dias) {
  const hoy = new Date();
  hoy.setDate(hoy.getDate() + dias);
  return fechaAR(hoy);
}

// Último día del mes (número de días real, sin pasar por Date ni huso horario)
function ultimoDiaMes(mesISO) {
  const [anio, mes] = mesISO.split('-').map(Number);
  const dias = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dias).padStart(2, '0')}`;
}

module.exports = { fechaAR, fechaARMasDias, primerDiaMesSiguiente, ultimoDiaMes };
