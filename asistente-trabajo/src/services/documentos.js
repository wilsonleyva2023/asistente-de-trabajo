const { supabase } = require('../db');

async function guardarDocumento({ cliente_id, presupuesto_id, url, nombre_archivo, resumen }) {
  const { data, error } = await supabase
    .from('documentos')
    .insert([{ cliente_id: cliente_id || null, presupuesto_id: presupuesto_id || null, url, nombre_archivo: nombre_archivo || null, resumen: resumen || null }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function documentosDeCliente(cliente_id) {
  const { data, error } = await supabase.from('documentos').select('*').eq('cliente_id', cliente_id).order('creado_en', { ascending: false });
  if (error) throw error;
  return data;
}

module.exports = { guardarDocumento, documentosDeCliente };
