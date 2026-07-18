const { supabase } = require('../db');

async function crearVisita({ cliente_id, descripcion, fecha_hora, aviso_horas_antes }) {
  const { data, error } = await supabase
    .from('visitas')
    .insert([{ cliente_id, descripcion, fecha_hora, aviso_horas_antes: aviso_horas_antes || 2 }])
    .select('*, clientes(nombre, direccion, telefono)')
    .single();
  if (error) throw error;
  return data;
}

async function editarVisita(id, cambios) {
  const { data, error } = await supabase.from('visitas').update(cambios).eq('id', id).select('*, clientes(nombre)').single();
  if (error) throw error;
  return data;
}

async function completarVisita(id) {
  const { data, error } = await supabase.from('visitas').update({ estado: 'completado' }).eq('id', id).select('*, clientes(nombre)').single();
  if (error) throw error;
  return data;
}

async function cancelarVisita(id) {
  const { data, error } = await supabase.from('visitas').update({ estado: 'cancelado' }).eq('id', id).select('*, clientes(nombre)').single();
  if (error) throw error;
  return data;
}

async function reagendarVisita(id, nuevaFechaHora) {
  const { data, error } = await supabase
    .from('visitas')
    .update({ fecha_hora: nuevaFechaHora, estado: 'pendiente', avisado: false })
    .eq('id', id)
    .select('*, clientes(nombre)')
    .single();
  if (error) throw error;
  return data;
}

async function visitasEnRango(desdeISO, hastaISO) {
  const { data, error } = await supabase
    .from('visitas')
    .select('*, clientes(nombre, direccion, telefono)')
    .eq('estado', 'pendiente')
    .gte('fecha_hora', desdeISO)
    .lte('fecha_hora', hastaISO)
    .order('fecha_hora', { ascending: true });
  if (error) throw error;
  return data;
}

// Busca la visita pendiente más cercana de un cliente (para completar/reagendar por nombre)
async function proximaVisitaPendiente(cliente_id) {
  const { data, error } = await supabase
    .from('visitas')
    .select('*')
    .eq('cliente_id', cliente_id)
    .eq('estado', 'pendiente')
    .order('fecha_hora', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Para el chequeo de superposición de horarios
async function visitasCercanas(fecha_hora, ventanaMinutos = 60) {
  const centro = new Date(fecha_hora);
  const desde = new Date(centro.getTime() - ventanaMinutos * 60000);
  const hasta = new Date(centro.getTime() + ventanaMinutos * 60000);
  const { data, error } = await supabase
    .from('visitas')
    .select('*, clientes(nombre)')
    .eq('estado', 'pendiente')
    .gte('fecha_hora', desde.toISOString())
    .lte('fecha_hora', hasta.toISOString());
  if (error) throw error;
  return data;
}

// Para el aviso automático de "faltan X horas"
async function visitasParaAvisar() {
  const ahora = new Date();
  const { data, error } = await supabase.from('visitas').select('*, clientes(nombre, direccion, telefono)').eq('estado', 'pendiente').eq('avisado', false);
  if (error) throw error;
  return (data || []).filter((v) => {
    const horaAviso = new Date(v.fecha_hora);
    horaAviso.setHours(horaAviso.getHours() - (v.aviso_horas_antes || 2));
    return ahora >= horaAviso && ahora < new Date(v.fecha_hora);
  });
}

async function marcarAvisada(id) {
  const { error } = await supabase.from('visitas').update({ avisado: true }).eq('id', id);
  if (error) throw error;
}

// Para el resumen de fin de día
async function resumenDelDia(desdeISO, hastaISO) {
  const { data, error } = await supabase
    .from('visitas')
    .select('*, clientes(nombre)')
    .gte('fecha_hora', desdeISO)
    .lte('fecha_hora', hastaISO)
    .in('estado', ['completado', 'reagendado', 'cancelado']);
  if (error) throw error;
  return data;
}

module.exports = {
  crearVisita,
  editarVisita,
  completarVisita,
  cancelarVisita,
  reagendarVisita,
  visitasEnRango,
  proximaVisitaPendiente,
  visitasCercanas,
  visitasParaAvisar,
  marcarAvisada,
  resumenDelDia,
};
