const { supabase } = require('../db');

// ---- Kit de herramientas habituales ----
async function agregarAlKit(nombre) {
  const existentes = await listarKit();
  const yaExiste = existentes.find((h) => h.nombre.toLowerCase() === nombre.toLowerCase());
  if (yaExiste) return yaExiste;
  const { data, error } = await supabase.from('herramientas_kit').insert([{ nombre }]).select().single();
  if (error) throw error;
  return data;
}

async function listarKit() {
  const { data, error } = await supabase.from('herramientas_kit').select('*').order('nombre', { ascending: true });
  if (error) throw error;
  return data;
}

async function marcarEstado(nombre, estado, notas) {
  const { data, error } = await supabase.from('herramientas_kit').update({ estado, notas: notas || null }).ilike('nombre', `%${nombre}%`).select();
  if (error) throw error;
  return data;
}

async function registrarMantenimiento(nombre) {
  const { error } = await supabase.from('herramientas_kit').update({ ultimo_mantenimiento: new Date().toISOString().slice(0, 10) }).ilike('nombre', `%${nombre}%`);
  if (error) throw error;
}

// ---- Qué se lleva/recupera en cada visita ----
async function registrarLlevadas(visita_id, cliente_id, items) {
  const registros = items.map((item) => ({ visita_id, cliente_id, item }));
  const { data, error } = await supabase.from('visita_herramientas').insert(registros).select();
  if (error) throw error;
  return data;
}

async function herramientasDeVisita(visita_id) {
  const { data, error } = await supabase.from('visita_herramientas').select('*').eq('visita_id', visita_id);
  if (error) throw error;
  return data;
}

async function marcarTodasRecuperadas(visita_id) {
  const { error } = await supabase.from('visita_herramientas').update({ recuperada: true }).eq('visita_id', visita_id);
  if (error) throw error;
}

async function marcarPendiente(visita_id, item) {
  const { error } = await supabase.from('visita_herramientas').update({ recuperada: false }).eq('visita_id', visita_id).ilike('item', `%${item}%`);
  if (error) throw error;
}

async function pendientesRecuperar() {
  const { data, error } = await supabase.from('visita_herramientas').select('*, clientes(nombre)').eq('recuperada', false);
  if (error) throw error;
  return data;
}

// Historial: qué tanto se olvida cada herramienta (para detectar patrones)
async function historialOlvidos() {
  const { data, error } = await supabase.from('visita_herramientas').select('item').eq('recuperada', false);
  if (error) throw error;
  const conteo = {};
  (data || []).forEach((r) => { conteo[r.item] = (conteo[r.item] || 0) + 1; });
  return conteo;
}

module.exports = {
  agregarAlKit,
  listarKit,
  marcarEstado,
  registrarMantenimiento,
  registrarLlevadas,
  herramientasDeVisita,
  marcarTodasRecuperadas,
  marcarPendiente,
  pendientesRecuperar,
  historialOlvidos,
};
