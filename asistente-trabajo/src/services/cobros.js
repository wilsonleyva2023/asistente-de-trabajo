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

module.exports = { crearCobro, marcarCobrado, cobrosPendientes };
