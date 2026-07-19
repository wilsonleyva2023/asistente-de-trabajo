const { supabase } = require('../db');

async function crearRecordatorio({ texto, fecha_hora, recurrencia }) {
  const { data, error } = await supabase.from('recordatorios').insert([{ texto, fecha_hora, recurrencia: recurrencia || null }]).select().single();
  if (error) throw error;
  return data;
}

// Los recordatorios recurrentes que ya pasaron su fecha se reprograman solos para el próximo ciclo.
async function avanzarRecurrentes() {
  const ahora = new Date();
  const { data, error } = await supabase.from('recordatorios').select('*').not('recurrencia', 'is', null).lt('fecha_hora', ahora.toISOString());
  if (error) throw error;
  for (const r of data || []) {
    const nueva = new Date(r.fecha_hora);
    if (r.recurrencia === 'semanal') nueva.setDate(nueva.getDate() + 7);
    else if (r.recurrencia === 'mensual') nueva.setMonth(nueva.getMonth() + 1);
    else continue;
    await supabase.from('recordatorios').update({ fecha_hora: nueva.toISOString() }).eq('id', r.id);
  }
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
  avanzarRecurrentes,
};
