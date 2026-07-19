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

// Cuántas visitas pendientes hay agendadas para un día puntual (para avisar si está sobrecargado)
async function contarVisitasDelDia(fechaISO) {
  const dia = new Date(fechaISO);
  const inicio = new Date(dia); inicio.setHours(0, 0, 0, 0);
  const fin = new Date(dia); fin.setHours(23, 59, 59, 999);
  const { data, error } = await supabase.from('visitas').select('id').eq('estado', 'pendiente').gte('fecha_hora', inicio.toISOString()).lte('fecha_hora', fin.toISOString());
  if (error) throw error;
  return (data || []).length;
}

// Cuántas veces se completó una visita a un cliente en el último año
async function contarVisitasCliente(cliente_id) {
  const haceUnAnio = new Date();
  haceUnAnio.setFullYear(haceUnAnio.getFullYear() - 1);
  const { data, error } = await supabase.from('visitas').select('id').eq('cliente_id', cliente_id).eq('estado', 'completado').gte('fecha_hora', haceUnAnio.toISOString());
  if (error) throw error;
  return (data || []).length;
}

// Visitas pendientes que ya se reagendaron 2 o más veces (alerta)
async function clientesQueReagendanMucho(minimo = 2) {
  const { data, error } = await supabase.from('visitas').select('*, clientes(nombre)').gte('veces_reagendada', minimo).eq('estado', 'pendiente');
  if (error) throw error;
  return data;
}

// Días de un rango que no tienen ninguna visita pendiente (huecos libres)
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
  contarVisitasDelDia,
  contarVisitasCliente,
  clientesQueReagendanMucho,
  diasLibresEnRango,
};
