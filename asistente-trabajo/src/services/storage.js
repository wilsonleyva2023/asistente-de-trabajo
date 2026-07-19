const { supabase } = require('../db');

const BUCKET = 'fotos-trabajos';

async function subirFoto(buffer, nombreArchivo) {
  const ruta = `${Date.now()}-${nombreArchivo}`;
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, buffer, { contentType: 'image/jpeg' });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
  return data.publicUrl;
}

async function subirArchivo(buffer, nombreArchivo, contentType) {
  const ruta = `${Date.now()}-${nombreArchivo}`;
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, buffer, { contentType: contentType || 'application/octet-stream' });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
  return data.publicUrl;
}

module.exports = { subirFoto, subirArchivo };
