const { supabase } = require('../db');

async function crearRecordatorio({ texto, fecha_hora }) {
  const { data, error } = await supabase.from('recordatorios').insert([{ texto, fecha_hora }]).select().single();
  if (error) throw error;
  return data;
}

async function editarRecordatorio(id, cambios) {
  const { data, error } = await supabase.from('recordatorios').update(cambios).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function eliminarRecordatorio(id) {
  const { error } = await supabase.from('recordatorios').delete().eq('id', id);
  if (error) throw error;
}

// Busca por texto parecido, para poder editar/eliminar por descripción
async function buscarRecordatorio(texto) {
  const { data, error } = await supabase
    .from('recordatorios')
    .select('*')
    .eq('cumplido', false)
    .ilike('texto', `%${texto}%`)
    .order('fecha_hora', { ascending: true });
  if (error) throw error;
  return data;
}

async function recordatoriosPendientesHoy() {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date();
  fin.setHours(23, 59, 59, 999);
  const { data, error } = await supabase
    .from('recordatorios')
    .select('*')
    .eq('cumplido', false)
    .gte('fecha_hora', inicio.toISOString())
    .lte('fecha_hora', fin.toISOString())
    .order('fecha_hora', { ascending: true });
  if (error) throw error;
  return data;
}

async function recordatoriosEnRango(desdeISO, hastaISO) {
  const { data, error } = await supabase
    .from('recordatorios')
    .select('*')
    .eq('cumplido', false)
    .gte('fecha_hora', desdeISO)
    .lte('fecha_hora', hastaISO)
    .order('fecha_hora', { ascending: true });
  if (error) throw error;
  return data;
}

async function marcarCumplido(id) {
  const { error } = await supabase.from('recordatorios').update({ cumplido: true }).eq('id', id);
  if (error) throw error;
}

module.exports = {
  crearRecordatorio,
  editarRecordatorio,
  eliminarRecordatorio,
  buscarRecordatorio,
  recordatoriosPendientesHoy,
  recordatoriosEnRango,
  marcarCumplido,
};
