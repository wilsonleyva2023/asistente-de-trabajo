const { supabase } = require('../db');

async function crearCobro({ cliente_id, presupuesto_id, monto, fecha_vencimiento }) {
  const { data, error } = await supabase
    .from('cobros')
    .insert([{ cliente_id, presupuesto_id, monto, fecha_vencimiento, estado: 'pendiente' }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function marcarCobrado(id) {
  const { data, error } = await supabase
    .from('cobros')
    .update({ estado: 'cobrado', fecha_cobro: new Date().toISOString().slice(0, 10) })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function cobrosPendientes() {
  const { data, error } = await supabase
    .from('cobros')
    .select('*, clientes(nombre, telefono)')
    .eq('estado', 'pendiente')
    .order('fecha_vencimiento', { ascending: true });
  if (error) throw error;
  return data;
}

async function obtenerCobrosPorCliente(cliente_id) {
  const { data, error } = await supabase.from('cobros').select('*').eq('cliente_id', cliente_id).order('creado_en', { ascending: false });
  if (error) throw error;
  return data;
}

async function eliminarCobro(id) {
  const { error } = await supabase.from('cobros').delete().eq('id', id);
  if (error) throw error;
}

module.exports = { crearCobro, marcarCobrado, cobrosPendientes, obtenerCobrosPorCliente, eliminarCobro };
