const { supabase } = require('../db');

async function guardarServicio({ nombre, categoria, mano_obra, materiales_min, materiales_max, garantia_dias, duracion_minutos, materiales_tipicos }) {
  const { data, error } = await supabase
    .from('catalogo_servicios')
    .insert([{
      nombre, categoria: categoria || null, mano_obra, materiales_min: materiales_min || 0, materiales_max: materiales_max || 0,
      garantia_dias: garantia_dias || 90, duracion_minutos: duracion_minutos || null, materiales_tipicos: materiales_tipicos || null,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function editarServicio(id, cambios) {
  const { data, error } = await supabase.from('catalogo_servicios').update(cambios).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function eliminarServicio(id) {
  const { error } = await supabase.from('catalogo_servicios').delete().eq('id', id);
  if (error) throw error;
}

async function buscarServicio(texto) {
  const { data, error } = await supabase.from('catalogo_servicios').select('*').ilike('nombre', `%${texto}%`).limit(3);
  if (error) throw error;
  return data;
}

async function listarServicios(categoria) {
  let query = supabase.from('catalogo_servicios').select('*').order('nombre', { ascending: true });
  if (categoria) query = query.ilike('categoria', `%${categoria}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function actualizarPreciosMasivo(porcentaje) {
  const { data: todos, error } = await supabase.from('catalogo_servicios').select('id, mano_obra');
  if (error) throw error;
  for (const s of todos || []) {
    const nuevo = Math.round(Number(s.mano_obra) * (1 + porcentaje / 100));
    await supabase.from('catalogo_servicios').update({ mano_obra: nuevo }).eq('id', s.id);
  }
  return (todos || []).length;
}

async function incrementarUso(id) {
  const { data: actual } = await supabase.from('catalogo_servicios').select('veces_usado').eq('id', id).single();
  await supabase.from('catalogo_servicios').update({ veces_usado: (actual?.veces_usado || 0) + 1 }).eq('id', id);
}

async function servicioMasUsado(limite = 5) {
  const { data, error } = await supabase.from('catalogo_servicios').select('*').order('veces_usado', { ascending: false }).limit(limite);
  if (error) throw error;
  return data;
}

module.exports = {
  guardarServicio,
  editarServicio,
  eliminarServicio,
  buscarServicio,
  listarServicios,
  actualizarPreciosMasivo,
  incrementarUso,
  servicioMasUsado,
};
