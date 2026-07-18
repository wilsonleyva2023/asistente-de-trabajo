const { supabase } = require('../db');

async function crearCliente({ nombre, telefono, direccion, notas, apodo }) {
  const { data, error } = await supabase
    .from('clientes')
    .insert([{ nombre, telefono, direccion, notas, apodo: apodo || null }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function actualizarCliente(id, cambios) {
  const { data, error } = await supabase.from('clientes').update(cambios).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// Busca por nombre O por apodo/referencia (ej: "el del termotanque")
async function buscarClientesPorNombre(texto) {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('archivado', false)
    .or(`nombre.ilike.%${texto}%,apodo.ilike.%${texto}%`)
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
    .select('*, presupuesto_items(*)')
    .eq('cliente_id', id)
    .eq('archivado', false)
    .order('fecha_creacion', { ascending: false });
  const { data: cobros } = await supabase
    .from('cobros')
    .select('*')
    .eq('cliente_id', id)
    .eq('archivado', false)
    .order('creado_en', { ascending: false });
  const { data: trabajos } = await supabase
    .from('trabajos')
    .select('*')
    .eq('cliente_id', id)
    .order('fecha', { ascending: false });
  return { cliente, equipos, presupuestos, cobros, trabajos };
}

// Datos rápidos para que la IA pueda distinguir entre varios clientes con el mismo nombre
async function infoParaDistinguir(id) {
  const cliente = await obtenerCliente(id);
  const { data: presupuestos } = await supabase
    .from('presupuestos')
    .select('descripcion, monto, fecha_creacion')
    .eq('cliente_id', id)
    .eq('archivado', false)
    .order('fecha_creacion', { ascending: false })
    .limit(1);
  const { data: cobros } = await supabase.from('cobros').select('monto, estado').eq('cliente_id', id).eq('archivado', false).eq('estado', 'pendiente');
  const deudaTotal = (cobros || []).reduce((acc, c) => acc + Number(c.monto), 0);
  return {
    id: cliente.id,
    nombre: cliente.nombre,
    apodo: cliente.apodo || null,
    direccion: cliente.direccion || 'sin dirección registrada',
    telefono: cliente.telefono || 'sin teléfono registrado',
    ultimo_presupuesto: presupuestos?.[0] || null,
    deuda_pendiente: deudaTotal,
  };
}

async function archivarCliente(id) {
  const { data, error } = await supabase.from('clientes').update({ archivado: true }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function restaurarCliente(id) {
  const { data, error } = await supabase.from('clientes').update({ archivado: false }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function eliminarClientePermanente(id) {
  const { error } = await supabase.from('clientes').delete().eq('id', id);
  if (error) throw error;
}

module.exports = {
  crearCliente,
  actualizarCliente,
  buscarClientesPorNombre,
  obtenerCliente,
  fichaCompleta,
  infoParaDistinguir,
  archivarCliente,
  restaurarCliente,
  eliminarClientePermanente,
};
