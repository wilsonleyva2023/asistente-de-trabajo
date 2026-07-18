const { supabase } = require('../db');

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
        garantia_vencimiento: vencimiento.toISOString().slice(0, 10),
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
  const hoy = new Date().toISOString().slice(0, 10);
  const limite = new Date();
  limite.setDate(limite.getDate() + diasAntes);
  const { data, error } = await supabase
    .from('trabajos')
    .select('*, clientes(nombre, telefono)')
    .gte('garantia_vencimiento', hoy)
    .lte('garantia_vencimiento', limite.toISOString().slice(0, 10));
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

module.exports = {
  registrarTrabajo,
  editarTrabajo,
  eliminarTrabajo,
  obtenerUltimoTrabajo,
  trabajosPorCliente,
  garantiasPorVencer,
  trabajosEnRango,
};
