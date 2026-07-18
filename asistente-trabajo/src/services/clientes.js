const { supabase } = require('../db');

async function crearCliente({ nombre, telefono, direccion, notas }) {
  const { data, error } = await supabase
    .from('clientes')
    .insert([{ nombre, telefono, direccion, notas }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function buscarClientesPorNombre(texto) {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .ilike('nombre', `%${texto}%`)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return data;
}

async function obtenerCliente(id) {
  const { data, error } = await supabase.from('clientes').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function fichaCompleta(id) {
  const cliente = await obtenerCliente(id);
  const { data: equipos } = await supabase.from('equipos').select('*').eq('cliente_id', id);
  const { data: presupuestos } = await supabase
    .from('presupuestos')
    .select('*')
    .eq('cliente_id', id)
    .order('fecha_creacion', { ascending: false });
  const { data: cobros } = await supabase
    .from('cobros')
    .select('*')
    .eq('cliente_id', id)
    .order('creado_en', { ascending: false });
  const { data: trabajos } = await supabase
    .from('trabajos')
    .select('*')
    .eq('cliente_id', id)
    .order('fecha', { ascending: false });
  return { cliente, equipos, presupuestos, cobros, trabajos };
}

module.exports = { crearCliente, buscarClientesPorNombre, obtenerCliente, fichaCompleta };
