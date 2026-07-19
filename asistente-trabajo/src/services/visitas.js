const { supabase } = require('../db');

async function crearVisita({ cliente_id, descripcion, fecha_hora, aviso_horas_antes, que_llevar, duracion_minutos, recurrencia_meses }) {
  const { data, error } = await supabase
    .from('visitas')
    .insert([{
      cliente_id, descripcion, fecha_hora, aviso_horas_antes: aviso_horas_antes || 2,
      que_llevar: que_llevar || null, duracion_minutos: duracion_minutos || 60, recurrencia_meses: recurrencia_meses || null,
    }])
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

async function confirmarVisita(id) {
  const { data, error } = await supabase.from('visitas').update({ confirmada_por_cliente: true }).eq('id', id).select('*, clientes(nombre)').single();
  if (error) throw error;
  return data;
}

async function completarVisita(id) {
  const { data, error } = await supabase.from('visitas').update({ estado: 'completado' }).eq('id', id).select('*, clientes(nombre)').single();
  if (error) throw error;

  // Si es recurrente, programamos la próxima automáticamente
  if (data.recurrencia_meses) {
    const proxima = new Date(data.fecha_hora);
    proxima.setMonth(proxima.getMonth() + data.recurrencia_meses);
    await supabase.from('visitas').insert([{
      cliente_id: data.cliente_id, descripcion: data.descripcion, fecha_hora: proxima.toISOString(),
      aviso_horas_antes: data.aviso_horas_antes, duracion_minutos: data.duracion_minutos, recurrencia_meses: data.recurrencia_meses,
    }]);
  }
  return data;
}

async function cancelarVisita(id, motivo) {
  const { data, error } = await supabase.from('visitas').update({ estado: 'cancelado', motivo_cancelacion: motivo || null }).eq('id', id).select('*, clientes(nombre)').single();
  if (error) throw error;
  return data;
}

async function reagendarVisita(id, nuevaFechaHora) {
  const { data: actual } = await supabase.from('visitas').select('veces_reagendada').eq('id', id).single();
  const { data, error } = await supabase
    .from('visitas')
    .update({ fecha_hora: nuevaFechaHora, estado: 'pendiente', avisado: false, veces_reagendada: (actual?.veces_reagendada || 0) + 1 })
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

async function contarVisitasDelDia(fechaISO) {
  const dia = new Date(fechaISO);
  const inicio = new Date(dia); inicio.setHours(0, 0, 0, 0);
  const fin = new Date(dia); fin.setHours(23, 59, 59, 999);
  const { data, error } = await supabase.from('visitas').select('id').eq('estado', 'pendiente').gte('fecha_hora', inicio.toISOString()).lte('fecha_hora', fin.toISOString());
  if (error) throw error;
  return (data || []).length;
}

async function contarVisitasCliente(cliente_id) {
  const haceUnAnio = new Date();
  haceUnAnio.setFullYear(haceUnAnio.getFullYear() - 1);
  const { data, error } = await supabase.from('visitas').select('id').eq('cliente_id', cliente_id).eq('estado', 'completado').gte('fecha_hora', haceUnAnio.toISOString());
  if (error) throw error;
  return (data || []).length;
}

// Historial detallado (todas las completadas, con fecha)
async function historialVisitasCliente(cliente_id) {
  const { data, error } = await supabase.from('visitas').select('*').eq('cliente_id', cliente_id).eq('estado', 'completado').order('fecha_hora', { ascending: false });
  if (error) throw error;
  return data;
}

async function clientesQueReagendanMucho(minimo = 2) {
  const { data, error } = await supabase.from('visitas').select('*, clientes(nombre)').gte('veces_reagendada', minimo).eq('estado', 'pendiente');
  if (error) throw error;
  return data;
}

async function diasLibresEnRango(desdeISO, hastaISO) {
  const lista = await visitasEnRango(desdeISO, hastaISO);
  const diasConTrabajo = new Set(lista.map((v) => new Date(v.fecha_hora).toISOString().slice(0, 10)));
  const libres = [];
  const cursor = new Date(desdeISO);
  const fin = new Date(hastaISO);
  while (cursor <= fin) {
    const clave = cursor.toISOString().slice(0, 10);
    if (!diasConTrabajo.has(clave)) libres.push(clave);
    cursor.setDate(cursor.getDate() + 1);
  }
  return libres;
}

// Horas trabajadas (visitas completadas) en un rango
async function horasTrabajadasEnRango(desdeISO, hastaISO) {
  const { data, error } = await supabase.from('visitas').select('duracion_minutos').eq('estado', 'completado').gte('fecha_hora', desdeISO).lte('fecha_hora', hastaISO);
  if (error) throw error;
  const minutos = (data || []).reduce((acc, v) => acc + (v.duracion_minutos || 60), 0);
  return Math.round((minutos / 60) * 10) / 10;
}

// Horarios bloqueados
async function crearHorarioBloqueado(hora_inicio, hora_fin, descripcion) {
  const { data, error } = await supabase.from('horarios_bloqueados').insert([{ hora_inicio, hora_fin, descripcion }]).select().single();
  if (error) throw error;
  return data;
}

async function horariosBloqueados() {
  const { data, error } = await supabase.from('horarios_bloqueados').select('*');
  if (error) throw error;
  return data;
}

function chocaConBloqueado(fechaHoraISO, bloqueados) {
  const hora = new Date(fechaHoraISO).toTimeString().slice(0, 5);
  return (bloqueados || []).find((b) => hora >= b.hora_inicio.slice(0, 5) && hora <= b.hora_fin.slice(0, 5));
}

module.exports = {
  crearVisita,
  editarVisita,
  confirmarVisita,
  completarVisita,
  cancelarVisita,
  reagendarVisita,
  visitasEnRango,
  proximaVisitaPendiente,
  visitasCercanas,
  visitasParaAvisar,
  marcarAvisada,
  resumenDelDia,
  contarVisitasDelDia,
  contarVisitasCliente,
  historialVisitasCliente,
  clientesQueReagendanMucho,
  diasLibresEnRango,
  horasTrabajadasEnRango,
  crearHorarioBloqueado,
  horariosBloqueados,
  chocaConBloqueado,
};
