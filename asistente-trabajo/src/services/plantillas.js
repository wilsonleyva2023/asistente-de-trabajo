const { supabase } = require('../db');

async function guardarPlantilla(nombre, items) {
  const { data, error } = await supabase.from('plantillas_presupuesto').insert([{ nombre, items }]).select().single();
  if (error) throw error;
  return data;
}

async function buscarPlantilla(nombre) {
  const { data, error } = await supabase.from('plantillas_presupuesto').select('*').ilike('nombre', `%${nombre}%`).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function listarPlantillas() {
  const { data, error } = await supabase.from('plantillas_presupuesto').select('*').order('creado_en', { ascending: false });
  if (error) throw error;
  return data;
}

module.exports = { guardarPlantilla, buscarPlantilla, listarPlantillas };
