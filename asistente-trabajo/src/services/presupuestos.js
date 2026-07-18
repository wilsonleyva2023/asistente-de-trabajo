const { supabase } = require('../db');

async function crearPresupuesto({ cliente_id, descripcion, monto }) {
  const { data, error } = await supabase
    .from('presupuestos')
    .insert([{ cliente_id, descripcion, monto, estado: 'pendiente' }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function cambiarEstado(id, estado) {
  // estado: pendiente | aceptado | rechazado | no_concretado
  const { data, error } = await supabase
    .from('presupuestos')
    .update({ estado, fecha_ultimo_contacto: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Presupuestos que quedaron pendientes hace más de X días sin novedades,
// para recontactar al cliente
async function presupuestosParaRecontactar(diasSinContacto = 7) {
  const limite = new Date();
  limite.setDate(limite.getDate() - diasSinContacto);
  const { data, error } = await supabase
    .from('presupuestos')
    .select('*, clientes(nombre, telefono)')
    .in('estado', ['pendiente', 'no_concretado'])
    .lt('fecha_ultimo_contacto', limite.toISOString())
    .order('fecha_ultimo_contacto', { ascending: true });
  if (error) throw error;
  return data;
}

module.exports = { crearPresupuesto, cambiarEstado, presupuestosParaRecontactar };
