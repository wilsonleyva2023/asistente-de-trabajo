const { supabase } = require('../db');

const BUCKET = 'fotos-trabajos';

async function subirFoto(buffer, nombreArchivo) {
  const ruta = `${Date.now()}-${nombreArchivo}`;
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, buffer, { contentType: 'image/jpeg' });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
  return data.publicUrl;
}

async function guardarReferenciaFoto({ cliente_id, presupuesto_id, trabajo_id, url, descripcion }) {
  const { data, error } = await supabase
    .from('fotos')
    .insert([{ cliente_id: cliente_id || null, presupuesto_id: presupuesto_id || null, trabajo_id: trabajo_id || null, url, descripcion: descripcion || null }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function fotosPorPresupuesto(presupuesto_id) {
  const { data, error } = await supabase.from('fotos').select('*').eq('presupuesto_id', presupuesto_id);
  if (error) throw error;
  return data;
}

async function fotosPorCliente(cliente_id) {
  const { data, error } = await supabase.from('fotos').select('*').eq('cliente_id', cliente_id).order('creado_en', { ascending: false });
  if (error) throw error;
  return data;
}

module.exports = { subirFoto, guardarReferenciaFoto, fotosPorPresupuesto, fotosPorCliente };
