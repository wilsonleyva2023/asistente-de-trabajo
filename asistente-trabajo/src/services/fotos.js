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

async function fotosDeCliente(cliente_id) {
  const { data, error } = await supabase.from('fotos').select('*').eq('cliente_id', cliente_id).order('creado_en', { ascending: false });
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

module.exports = { guardarFoto, fotosDeCliente, fotosDePresupuesto, fotosRecientes };
