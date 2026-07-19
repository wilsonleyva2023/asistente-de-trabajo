const { supabase } = require('../db');

async function guardarFoto({ cliente_id, presupuesto_id, trabajo_id, cobro_id, url, descripcion, etiqueta }) {
  const { data, error } = await supabase
    .from('fotos')
    .insert([{
      cliente_id: cliente_id || null, presupuesto_id: presupuesto_id || null, trabajo_id: trabajo_id || null,
      cobro_id: cobro_id || null, url, descripcion: descripcion || null, etiqueta: etiqueta || null,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function fotosDeCliente(cliente_id, filtros = {}) {
  let query = supabase.from('fotos').select('*').eq('cliente_id', cliente_id).order('creado_en', { ascending: false });
  if (filtros.trabajo_id) query = query.eq('trabajo_id', filtros.trabajo_id);
  if (filtros.etiqueta) query = query.eq('etiqueta', filtros.etiqueta);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function eliminarFoto(id) {
  const { error } = await supabase.from('fotos').delete().eq('id', id);
  if (error) throw error;
}

// Trabajos de un cliente agrupados con sus fotos, para poder listar "qué trabajos tienen fotos"
async function trabajosConFotos(cliente_id) {
  const { data, error } = await supabase.from('fotos').select('trabajo_id, creado_en').eq('cliente_id', cliente_id).not('trabajo_id', 'is', null);
  if (error) throw error;
  return data;
}

async function fotosDePresupuesto(presupuesto_id) {
  const { data, error } = await supabase.from('fotos').select('*').eq('presupuesto_id', presupuesto_id);
  if (error) throw error;
  return data;
}

async function fotosRecientes(limite = 10) {
  const { data, error } = await supabase.from('fotos').select('*, clientes(nombre)').order('creado_en', { ascending: false }).limit(limite);
  if (error) throw error;
  return data;
}

module.exports = { guardarFoto, fotosDeCliente, fotosDePresupuesto, fotosRecientes, eliminarFoto, trabajosConFotos };
