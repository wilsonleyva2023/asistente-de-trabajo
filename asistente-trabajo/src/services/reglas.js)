const { supabase } = require('../db');

async function guardarRegla(regla) {
  const { data, error } = await supabase.from('reglas_personalizadas').insert([{ regla }]).select().single();
  if (error) throw error;
  return data;
}

async function listarReglas() {
  const { data, error } = await supabase.from('reglas_personalizadas').select('*').order('creado_en', { ascending: true });
  if (error) throw error;
  return data;
}

async function textoReglas() {
  const reglas = await listarReglas();
  if (!reglas.length) return null;
  return reglas.map((r) => `- ${r.regla}`).join('\n');
}

async function eliminarRegla(id) {
  const { error } = await supabase.from('reglas_personalizadas').delete().eq('id', id);
  if (error) throw error;
}

module.exports = { guardarRegla, listarReglas, textoReglas, eliminarRegla };
