const { supabase } = require('../db');

async function crearNota({ titulo, contenido }) {
  const { data, error } = await supabase.from('notas').insert([{ titulo: titulo || null, contenido }]).select().single();
  if (error) throw error;
  return data;
}

async function buscarNotas(busqueda) {
  const { data, error } = await supabase
    .from('notas')
    .select('*')
    .or(`titulo.ilike.%${busqueda}%,contenido.ilike.%${busqueda}%`)
    .order('creado_en', { ascending: false })
    .limit(5);
  if (error) throw error;
  return data;
}

async function notasRecientes(limite = 20) {
  const { data, error } = await supabase.from('notas').select('*').order('creado_en', { ascending: false }).limit(limite);
  if (error) throw error;
  return data;
}

async function eliminarNota(id) {
  const { error } = await supabase.from('notas').delete().eq('id', id);
  if (error) throw error;
}

module.exports = { crearNota, buscarNotas, notasRecientes, eliminarNota };
