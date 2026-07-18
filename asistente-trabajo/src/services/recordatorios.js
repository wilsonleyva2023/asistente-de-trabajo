const { supabase } = require('../db');

async function crearRecordatorio({ texto, fecha_hora }) {
  const { data, error } = await supabase
    .from('recordatorios')
    .insert([{ texto, fecha_hora }])
    .select()
    .single();
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

async function marcarCumplido(id) {
  const { error } = await supabase.from('recordatorios').update({ cumplido: true }).eq('id', id);
  if (error) throw error;
}

async function registrarTrabajo({ cliente_id, presupuesto_id, descripcion }) {
  const { data, error } = await supabase
    .from('trabajos')
    .insert([{ cliente_id, presupuesto_id, descripcion }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

module.exports = { crearRecordatorio, recordatoriosPendientesHoy, marcarCumplido, registrarTrabajo };
