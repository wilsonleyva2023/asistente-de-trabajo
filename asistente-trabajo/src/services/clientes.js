const { supabase } = require('../db');

async function crearCliente({ nombre, telefono, direccion, notas, apodo, referido_por, categoria, cumpleanos, horario_preferido, relacion, descuento_habitual, contacto_secundario }) {
  const { data, error } = await supabase
    .from('clientes')
    .insert([{
      nombre, telefono, direccion, notas, apodo: apodo || null, referido_por: referido_por || null,
      categoria: categoria || null, cumpleanos: cumpleanos || null, horario_preferido: horario_preferido || null,
      relacion: relacion || null, descuento_habitual: descuento_habitual || 0, contacto_secundario: contacto_secundario || null,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function actualizarCliente(id, cambios) {
  const { data, error } = await supabase.from('clientes').update(cambios).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// Busca exacto por nombre/apodo; si no encuentra nada, intenta por parecido (tolera errores de tipeo)
async function buscarClientesPorNombre(texto) {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('archivado', false)
    .or(`nombre.ilike.%${texto}%,apodo.ilike.%${texto}%`)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  if (data && data.length) return data;

  // Fallback por similitud (para tolerar "Roverto" -> "Roberto")
  const { data: parecidos, error: errorSim } = await supabase.rpc('clientes_similares', { termino: texto }).select();
  if (errorSim) return [];
  return parecidos || [];
}

async function buscarClientesPorCategoria(categoria) {
  const { data, error } = await supabase.from('clientes').select('*').eq('archivado', false).ilike('categoria', `%${categoria}%`);
  if (error) throw error;
  return data;
}

async function buscarPorTelefono(telefono) {
  const { data, error } = await supabase.from('clientes').select('*').eq('archivado', false).ilike('telefono', `%${telefono}%`);
  if (error) throw error;
  return data;
}

async function clientesRecientes(limite = 10) {
  const { data, error } = await supabase.from('clientes').select('*').eq('archivado', false).order('creado_en', { ascending: false }).limit(limite);
  if (error) throw error;
  return data;
}

async function obtenerCliente(id) {
  const { data, error } = await supabase.from('clientes').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function fichaCompleta(id) {
  const cliente = await obtenerCliente(id);
  const { data: equipos } = await supabase.from('equipos').select('*').eq('cliente_id', id);
  const { data: direcciones } = await supabase.from('cliente_direcciones').select('*').eq('cliente_id', id);
  const { data: presupuestos } = await supabase
    .from('presupuestos')
    .select('*, presupuesto_items(*)')
    .eq('cliente_id', id)
    .eq('archivado', false)
    .order('fecha_creacion', { ascending: false });
  const { data: cobros } = await supabase.from('cobros').select('*').eq('cliente_id', id).eq('archivado', false).order('creado_en', { ascending: false });
  const { data: trabajos } = await supabase.from('trabajos').select('*').eq('cliente_id', id).order('fecha', { ascending: false });
  return { cliente, equipos, direcciones, presupuestos, cobros, trabajos };
}

async function infoParaDistinguir(id) {
  const cliente = await obtenerCliente(id);
  const { data: presupuestos } = await supabase
    .from('presupuestos')
    .select('descripcion, monto, fecha_creacion')
    .eq('cliente_id', id)
    .eq('archivado', false)
    .order('fecha_creacion', { ascending: false })
    .limit(1);
  const { data: cobros } = await supabase.from('cobros').select('monto, estado').eq('cliente_id', id).eq('archivado', false).eq('estado', 'pendiente');
  const deudaTotal = (cobros || []).reduce((acc, c) => acc + Number(c.monto), 0);
  return {
    id: cliente.id,
    nombre: cliente.nombre,
    apodo: cliente.apodo || null,
    direccion: cliente.direccion || 'sin dirección registrada',
    telefono: cliente.telefono || 'sin teléfono registrado',
    ultimo_presupuesto: presupuestos?.[0] || null,
    deuda_pendiente: deudaTotal,
  };
}

// Último contacto real: la fecha más reciente entre trabajos, presupuestos y visitas completadas
async function ultimoContacto(id) {
  const { data: trabajo } = await supabase.from('trabajos').select('fecha').eq('cliente_id', id).order('fecha', { ascending: false }).limit(1).maybeSingle();
  const { data: presupuesto } = await supabase.from('presupuestos').select('fecha_creacion').eq('cliente_id', id).order('fecha_creacion', { ascending: false }).limit(1).maybeSingle();
  const fechas = [trabajo?.fecha, presupuesto?.fecha_creacion].filter(Boolean).map((f) => new Date(f));
  if (!fechas.length) return null;
  return new Date(Math.max(...fechas)).toISOString().slice(0, 10);
}

// Clientes sin ningún contacto hace más de X meses (para la alerta automática)
async function clientesEnSilencio(mesesSinContacto = 6) {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - mesesSinContacto);
  const { data: todos } = await supabase.from('clientes').select('id, nombre').eq('archivado', false).eq('bloqueado', false);
  const resultado = [];
  for (const c of todos || []) {
    const ultimo = await ultimoContacto(c.id);
    if (!ultimo || new Date(ultimo) < limite) resultado.push({ nombre: c.nombre, ultimo_contacto: ultimo || 'nunca' });
  }
  return resultado;
}

async function agregarDireccion(cliente_id, etiqueta, direccion) {
  const { data, error } = await supabase.from('cliente_direcciones').insert([{ cliente_id, etiqueta: etiqueta || null, direccion }]).select().single();
  if (error) throw error;
  return data;
}

// Combina dos clientes duplicados: pasa todo lo de "desde" a "hacia", y archiva "desde"
async function combinarClientes(idDesde, idHacia) {
  await supabase.from('presupuestos').update({ cliente_id: idHacia }).eq('cliente_id', idDesde);
  await supabase.from('cobros').update({ cliente_id: idHacia }).eq('cliente_id', idDesde);
  await supabase.from('trabajos').update({ cliente_id: idHacia }).eq('cliente_id', idDesde);
  await supabase.from('equipos').update({ cliente_id: idHacia }).eq('cliente_id', idDesde);
  await supabase.from('visitas').update({ cliente_id: idHacia }).eq('cliente_id', idDesde);
  await supabase.from('recibos').update({ cliente_id: idHacia }).eq('cliente_id', idDesde);
  await supabase.from('clientes').update({ archivado: true }).eq('id', idDesde);
}

async function archivarCliente(id) {
  const { data, error } = await supabase.from('clientes').update({ archivado: true }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function restaurarCliente(id) {
  const { data, error } = await supabase.from('clientes').update({ archivado: false }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function buscarClienteArchivado(texto) {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('archivado', true)
    .or(`nombre.ilike.%${texto}%,apodo.ilike.%${texto}%`)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function eliminarClientePermanente(id) {
  const { error } = await supabase.from('clientes').delete().eq('id', id);
  if (error) throw error;
}

module.exports = {
  crearCliente,
  actualizarCliente,
  buscarClientesPorNombre,
  buscarClientesPorCategoria,
  buscarPorTelefono,
  clientesRecientes,
  obtenerCliente,
  fichaCompleta,
  infoParaDistinguir,
  ultimoContacto,
  clientesEnSilencio,
  agregarDireccion,
  combinarClientes,
  archivarCliente,
  restaurarCliente,
  buscarClienteArchivado,
  eliminarClientePermanente,
};
