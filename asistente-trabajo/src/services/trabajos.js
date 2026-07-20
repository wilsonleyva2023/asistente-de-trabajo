const { supabase } = require('../db');
const { fechaAR } = require('../utils/fecha');

async function registrarTrabajo({ cliente_id, presupuesto_id, descripcion, gasto_materiales, garantia_dias }) {
  const dias = garantia_dias || 90;
  const vencimiento = new Date();
  vencimiento.setDate(vencimiento.getDate() + dias);
  const { data, error } = await supabase
    .from('trabajos')
    .insert([
      {
        cliente_id,
        presupuesto_id: presupuesto_id || null,
        descripcion,
        gasto_materiales: gasto_materiales || 0,
        garantia_dias: dias,
        garantia_vencimiento: fechaAR(vencimiento),
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function editarTrabajo(id, cambios) {
  const { data, error } = await supabase.from('trabajos').update(cambios).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function eliminarTrabajo(id) {
  const { error } = await supabase.from('trabajos').delete().eq('id', id);
  if (error) throw error;
}

async function obtenerUltimoTrabajo(cliente_id) {
  const { data, error } = await supabase
    .from('trabajos')
    .select('*')
    .eq('cliente_id', cliente_id)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function trabajosPorCliente(cliente_id) {
  const { data, error } = await supabase.from('trabajos').select('*').eq('cliente_id', cliente_id).order('fecha', { ascending: false });
  if (error) throw error;
  return data;
}

async function garantiasPorVencer(diasAntes = 5) {
  const hoy = fechaAR();
  const limite = new Date();
  limite.setDate(limite.getDate() + diasAntes);
  const { data, error } = await supabase
    .from('trabajos')
    .select('*, clientes(nombre, telefono)')
    .gte('garantia_vencimiento', hoy)
    .lte('garantia_vencimiento', fechaAR(limite));
  if (error) throw error;
  return data;
}

// Para la bitácora / reporte mensual: todos los trabajos de un rango de fechas
async function trabajosEnRango(desdeISO, hastaISO) {
  const { data, error } = await supabase
    .from('trabajos')
    .select('*, clientes(nombre)')
    .gte('fecha', desdeISO)
    .lte('fecha', hastaISO)
    .order('fecha', { ascending: true });
  if (error) throw error;
  return data;
}

async function registrarSatisfaccion(trabajo_id, satisfaccion) {
  const { data, error } = await supabase.from('trabajos').update({ satisfaccion }).eq('id', trabajo_id).select().single();
  if (error) throw error;
  return data;
}

// Detecta si un cliente tuvo varios trabajos parecidos en poco tiempo (posible problema de fondo)
async function trabajosRepetidos(cliente_id, meses = 6) {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - meses);
  const { data, error } = await supabase.from('trabajos').select('*').eq('cliente_id', cliente_id).gte('fecha', fechaAR(limite));
  if (error) throw error;
  return data;
}

// Ganancia neta de un trabajo: lo cobrado (vía el presupuesto asociado) menos el gasto en materiales
async function rentabilidad(trabajo_id) {
  const { data: trabajo, error } = await supabase.from('trabajos').select('*, presupuestos(monto)').eq('id', trabajo_id).single();
  if (error) throw error;
  const cobrado = trabajo.presupuestos?.monto || 0;
  const gasto = Number(trabajo.gasto_materiales || 0);
  return { cobrado, gasto, ganancia_neta: cobrado - gasto };
}

// Busca entre los trabajos de un cliente el que mejor coincida con un texto (ej: "termotanque", "inodoro")
async function buscarTrabajoDeCliente(cliente_id, texto) {
  const { data, error } = await supabase.from('trabajos').select('*').eq('cliente_id', cliente_id).order('fecha', { ascending: false });
  if (error) throw error;
  if (!texto) return data || [];
  const t = texto.toLowerCase();
  return (data || []).filter((tr) => tr.descripcion.toLowerCase().includes(t));
}

module.exports = {
  registrarTrabajo,
  editarTrabajo,
  eliminarTrabajo,
  obtenerUltimoTrabajo,
  trabajosPorCliente,
  garantiasPorVencer,
  trabajosEnRango,
  registrarSatisfaccion,
  trabajosRepetidos,
  rentabilidad,
  buscarTrabajoDeCliente,
};
