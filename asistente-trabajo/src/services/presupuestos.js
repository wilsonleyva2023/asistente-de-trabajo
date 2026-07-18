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
  const { data, error } = await supabase
    .from('presupuestos')
    .update({ estado, fecha_ultimo_contacto: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

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

async function obtenerUltimoPresupuesto(cliente_id) {
  const { data, error } = await supabase
    .from('presupuestos')
    .select('*')
    .eq('cliente_id', cliente_id)
    .order('fecha_creacion', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function actualizarPresupuesto(id, cambios) {
  const { data, error } = await supabase
    .from('presupuestos')
    .update({ ...cambios, fecha_ultimo_contacto: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function obtenerPresupuestosPorCliente(cliente_id) {
  const { data, error } = await supabase
    .from('presupuestos')
    .select('*')
    .eq('cliente_id', cliente_id)
    .order('fecha_creacion', { ascending: false });
  if (error) throw error;
  return data;
}

module.exports = { crearPresupuesto, cambiarEstado, presupuestosParaRecontactar, obtenerUltimoPresupuesto, actualizarPresupuesto, obtenerPresupuestosPorCliente };
