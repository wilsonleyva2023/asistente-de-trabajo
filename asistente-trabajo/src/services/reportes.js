const { supabase } = require('../db');
const { fechaAR } = require('../utils/fecha');

function rangoMes(mesISO) {
  const desde = `${mesISO}-01`;
  const fin = new Date(desde + 'T00:00:00-03:00');
  fin.setMonth(fin.getMonth() + 1);
  return { desde: `${desde}T00:00:00-03:00`, hasta: fin.toISOString() };
}

async function totalFacturadoEnRango(desdeISO, hastaISO) {
  const { data, error } = await supabase.from('cobros').select('monto').gte('creado_en', desdeISO).lte('creado_en', hastaISO);
  if (error) throw error;
  return (data || []).reduce((acc, c) => acc + Number(c.monto), 0);
}

// Compara un mes contra el anterior
async function compararMeses(mesISO) {
  const actual = await totalFacturadoEnRango(...Object.values(rangoMes(mesISO)));
  const fechaAnterior = new Date(`${mesISO}-01T00:00:00-03:00`);
  fechaAnterior.setMonth(fechaAnterior.getMonth() - 1);
  const mesAnteriorISO = fechaAR(fechaAnterior).slice(0, 7);
  const anterior = await totalFacturadoEnRango(...Object.values(rangoMes(mesAnteriorISO)));
  const diferencia = anterior > 0 ? Math.round(((actual - anterior) / anterior) * 100) : null;
  return { mes_actual: actual, mes_anterior: anterior, variacion_porcentaje: diferencia };
}

async function reporteAnual(anio) {
  const desde = `${anio}-01-01T00:00:00-03:00`;
  const hasta = `${Number(anio) + 1}-01-01T00:00:00-03:00`;
  const { data, error } = await supabase.from('cobros').select('*').gte('creado_en', desde).lte('creado_en', hasta);
  if (error) throw error;
  const facturado = (data || []).reduce((acc, c) => acc + Number(c.monto), 0);
  const cobrado = (data || []).filter((c) => c.estado === 'cobrado').reduce((acc, c) => acc + Number(c.monto), 0);
  return { facturado, cobrado, pendiente: facturado - cobrado, cantidad_cobros: (data || []).length };
}

async function rankingClientes(desdeISO, hastaISO, limite = 5) {
  const { data, error } = await supabase.from('cobros').select('monto, clientes(nombre)').gte('creado_en', desdeISO).lte('creado_en', hastaISO);
  if (error) throw error;
  const porCliente = {};
  (data || []).forEach((c) => {
    const nombre = c.clientes?.nombre || 'Cliente';
    porCliente[nombre] = (porCliente[nombre] || 0) + Number(c.monto);
  });
  return Object.entries(porCliente).sort((a, b) => b[1] - a[1]).slice(0, limite).map(([nombre, total]) => ({ nombre, total }));
}

async function rentabilidadGeneral(desdeISO, hastaISO) {
  const { data: trabajosData, error } = await supabase.from('trabajos').select('gasto_materiales').gte('fecha', desdeISO.slice(0, 10)).lt('fecha', hastaISO.slice(0, 10));
  if (error) throw error;
  const gastos = (trabajosData || []).reduce((acc, t) => acc + Number(t.gasto_materiales || 0), 0);
  const facturado = await totalFacturadoEnRango(desdeISO, hastaISO);
  return { facturado, gastos, ganancia_neta: facturado - gastos };
}

// Proyección simple: (facturado hasta hoy / días transcurridos del mes) * días totales del mes
async function proyeccionCierreMes(mesISO) {
  const { desde, hasta } = rangoMes(mesISO);
  const hoy = new Date();
  const inicioMes = new Date(desde);
  const finMes = new Date(hasta);
  const diasTranscurridos = Math.max(1, Math.ceil((Math.min(hoy, finMes) - inicioMes) / (1000 * 60 * 60 * 24)));
  const diasTotales = Math.ceil((finMes - inicioMes) / (1000 * 60 * 60 * 24));
  const facturadoHastaHoy = await totalFacturadoEnRango(desde, new Date().toISOString());
  const proyeccion = Math.round((facturadoHastaHoy / diasTranscurridos) * diasTotales);
  return { facturado_hasta_hoy: facturadoHastaHoy, proyeccion_fin_de_mes: proyeccion };
}

async function facturacionPorMes(cantidadMeses = 6) {
  const resultado = [];
  const hoy = new Date();
  for (let i = cantidadMeses - 1; i >= 0; i--) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const mesISO = fechaAR(fecha).slice(0, 7);
    const { desde, hasta } = rangoMes(mesISO);
    const total = await totalFacturadoEnRango(desde, hasta);
    resultado.push({ mes: mesISO, total });
  }
  return resultado;
}

async function facturacionPorCategoria(desdeISO, hastaISO) {
  const { data, error } = await supabase.from('cobros').select('monto, clientes(categoria)').gte('creado_en', desdeISO).lte('creado_en', hastaISO);
  if (error) throw error;
  const porCategoria = {};
  (data || []).forEach((c) => {
    const cat = c.clientes?.categoria || 'sin categoría';
    porCategoria[cat] = (porCategoria[cat] || 0) + Number(c.monto);
  });
  return porCategoria;
}

async function facturacionPorRubro(desdeISO, hastaISO) {
  const { data, error } = await supabase.from('trabajos').select('rubro, presupuestos(monto)').gte('fecha', desdeISO.slice(0, 10)).lt('fecha', hastaISO.slice(0, 10));
  if (error) throw error;
  const porRubro = {};
  (data || []).forEach((t) => {
    const rubro = t.rubro || 'sin especificar';
    porRubro[rubro] = (porRubro[rubro] || 0) + Number(t.presupuestos?.monto || 0);
  });
  return porRubro;
}

async function clientesNuevosVsRecurrentes(desdeISO, hastaISO) {
  const { data: cobrosPeriodo, error } = await supabase.from('cobros').select('cliente_id').gte('creado_en', desdeISO).lte('creado_en', hastaISO);
  if (error) throw error;
  const clientesDelPeriodo = [...new Set((cobrosPeriodo || []).map((c) => c.cliente_id))];
  let nuevos = 0, recurrentes = 0;
  for (const clienteId of clientesDelPeriodo) {
    const { data: anteriores } = await supabase.from('cobros').select('id').eq('cliente_id', clienteId).lt('creado_en', desdeISO).limit(1);
    if (anteriores && anteriores.length) recurrentes++;
    else nuevos++;
  }
  return { nuevos, recurrentes };
}

async function tiempoPromedioCierre() {
  const { data, error } = await supabase.from('presupuestos').select('fecha_creacion, fecha_aceptacion').eq('estado', 'aceptado').not('fecha_aceptacion', 'is', null);
  if (error) throw error;
  if (!data || !data.length) return null;
  const dias = data.map((p) => (new Date(p.fecha_aceptacion) - new Date(p.fecha_creacion)) / (1000 * 60 * 60 * 24));
  return Math.round((dias.reduce((a, b) => a + b, 0) / dias.length) * 10) / 10;
}

async function guardarReporteHistorial(tipo, periodo, contenido) {
  const { error } = await supabase.from('reportes_historial').insert([{ tipo, periodo, contenido }]);
  if (error) throw error;
}

async function ultimoReporte(tipo) {
  const { data, error } = await supabase.from('reportes_historial').select('*').eq('tipo', tipo).order('generado_en', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

module.exports = {
  rangoMes,
  totalFacturadoEnRango,
  compararMeses,
  reporteAnual,
  rankingClientes,
  rentabilidadGeneral,
  proyeccionCierreMes,
  facturacionPorMes,
  facturacionPorCategoria,
  facturacionPorRubro,
  clientesNuevosVsRecurrentes,
  tiempoPromedioCierre,
  guardarReporteHistorial,
  ultimoReporte,
};
