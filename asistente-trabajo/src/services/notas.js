const { supabase } = require('../db');

async function crearNota({ titulo, contenido, categoria, cliente_id, visita_id, prioridad, foto_url }) {
  const { data, error } = await supabase
    .from('notas')
    .insert([{
      titulo: titulo || null, contenido, categoria: categoria || null,
      cliente_id: cliente_id || null, visita_id: visita_id || null,
      prioridad: prioridad || 'normal', foto_url: foto_url || null,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function editarNota(id, cambios) {
  const { data, error } = await supabase.from('notas').update(cambios).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function buscarNotas(busqueda) {
  const { data, error } = await supabase
    .from('notas')
    .select('*')
    .eq('archivada', false)
    .or(`titulo.ilike.%${busqueda}%,contenido.ilike.%${busqueda}%`)
    .order('fijada', { ascending: false })
    .order('creado_en', { ascending: false })
    .limit(5);
  if (error) throw error;
  return data;
}

// Lista solo las activas (no completadas, no archivadas) por defecto
async function notasRecientes(limite = 20, incluirCompletadas = false) {
  let query = supabase.from('notas').select('*').eq('archivada', false).order('fijada', { ascending: false }).order('creado_en', { ascending: false }).limit(limite);
  if (!incluirCompletadas) query = query.eq('completada', false);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function notasEnRango(desdeISO, hastaISO) {
  const { data, error } = await supabase.from('notas').select('*').eq('archivada', false).gte('creado_en', desdeISO).lte('creado_en', hastaISO).order('creado_en', { ascending: false });
  if (error) throw error;
  return data;
}

async function notasPorCategoria(categoria) {
  const { data, error } = await supabase.from('notas').select('*').eq('archivada', false).ilike('categoria', `%${categoria}%`);
  if (error) throw error;
  return data;
}

async function notasPorCliente(cliente_id) {
  const { data, error } = await supabase.from('notas').select('*').eq('archivada', false).eq('cliente_id', cliente_id).order('creado_en', { ascending: false });
  if (error) throw error;
  return data;
}

async function ultimaNota() {
  const { data, error } = await supabase.from('notas').select('*').eq('archivada', false).order('creado_en', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function marcarCompletada(id) {
  const { data, error } = await supabase.from('notas').update({ completada: true }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function marcarFijada(id, fijada) {
  const { data, error } = await supabase.from('notas').update({ fijada: !!fijada }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function notasPendientesHoy() {
  const { data, error } = await supabase.from('notas').select('*').eq('archivada', false).eq('completada', false).order('creado_en', { ascending: false }).limit(5);
  if (error) throw error;
  return data;
}

async function eliminarNota(id) {
  const { error } = await supabase.from('notas').delete().eq('id', id);
  if (error) throw error;
}

async function eliminarCompletadas() {
  const { data, error } = await supabase.from('notas').delete().eq('completada', true).select();
  if (error) throw error;
  return (data || []).length;
}

async function combinarNotas(idPrincipal, idASumar) {
  const { data: notaSumar } = await supabase.from('notas').select('contenido').eq('id', idASumar).single();
  const { data: notaPrincipal, error } = await supabase
    .from('notas')
    .select('contenido')
    .eq('id', idPrincipal)
    .single();
  if (error) throw error;
  const nuevoContenido = `${notaPrincipal.contenido}\n${notaSumar?.contenido || ''}`;
  await supabase.from('notas').update({ contenido: nuevoContenido }).eq('id', idPrincipal);
  await supabase.from('notas').delete().eq('id', idASumar);
}

// Archiva notas viejas (más de X meses) sin completar ni tocar, para no ensuciar la lista
async function archivarNotasViejas(meses = 6) {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - meses);
  const { data, error } = await supabase.from('notas').update({ archivada: true }).lt('creado_en', limite.toISOString()).eq('archivada', false).select();
  if (error) throw error;
  return (data || []).length;
}

module.exports = {
  crearNota,
  editarNota,
  buscarNotas,
  notasRecientes,
  notasEnRango,
  notasPorCategoria,
  notasPorCliente,
  ultimaNota,
  marcarCompletada,
  marcarFijada,
  notasPendientesHoy,
  eliminarNota,
  eliminarCompletadas,
  combinarNotas,
  archivarNotasViejas,
};
