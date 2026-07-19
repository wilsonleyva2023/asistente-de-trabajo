const { supabase } = require('../db');
const cobros = require('./cobros');

async function registrarHistorial(presupuesto_id, cambio) {
  await supabase.from('presupuesto_historial').insert([{ presupuesto_id, cambio }]);
}

async function crearPresupuesto({ cliente_id, items, descripcion, monto, dias_validez }) {
  const listaItems = items && items.length ? items : [{ descripcion, monto }];
  const totalMonto = listaItems.reduce((acc, i) => acc + Number(i.monto || 0), 0);
  const descripcionGeneral = listaItems.map((i) => i.descripcion).join(' + ');

  const { data: presupuesto, error } = await supabase
    .from('presupuestos')
    .insert([{ cliente_id, descripcion: descripcionGeneral, monto: totalMonto, estado: 'pendiente', dias_validez: dias_validez || 15 }])
    .select()
    .single();
  if (error) throw error;

  const { data: itemsGuardados, error: errorItems } = await supabase
    .from('presupuesto_items')
    .insert(listaItems.map((i) => ({ presupuesto_id: presupuesto.id, descripcion: i.descripcion, monto: i.monto })))
    .select();
  if (errorItems) throw errorItems;

  await registrarHistorial(presupuesto.id, `Creado con ${listaItems.length} ítem(s), total $${totalMonto}`);
  return { ...presupuesto, items: itemsGuardados };
}

async function obtenerItems(presupuesto_id) {
  const { data, error } = await supabase
    .from('presupuesto_items')
    .select('*')
    .eq('presupuesto_id', presupuesto_id)
    .eq('archivado', false)
    .order('creado_en', { ascending: true });
  if (error) throw error;
  return data;
}

// Recalcula el total del presupuesto Y actualiza la deuda pendiente asociada, para que nunca queden desincronizados.
async function recalcularYSincronizar(presupuesto_id) {
  const itemsRestantes = await obtenerItems(presupuesto_id);
  const nuevoTotal = itemsRestantes.reduce((acc, i) => acc + Number(i.monto), 0);
  const nuevaDescripcion = itemsRestantes.map((i) => i.descripcion).join(' + ') || '(sin ítems)';
  const { data, error } = await supabase
    .from('presupuestos')
    .update({ monto: nuevoTotal, descripcion: nuevaDescripcion, fecha_ultimo_contacto: new Date().toISOString() })
    .eq('id', presupuesto_id)
    .select()
    .single();
  if (error) throw error;
  await cobros.actualizarMontoPorPresupuesto(presupuesto_id, nuevoTotal);
  return { presupuesto: data, items: itemsRestantes };
}

async function quitarItems(presupuesto_id, itemIds, permanente = false) {
  if (permanente) {
    const { error } = await supabase.from('presupuesto_items').delete().in('id', itemIds);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('presupuesto_items').update({ archivado: true }).in('id', itemIds);
    if (error) throw error;
  }
  await registrarHistorial(presupuesto_id, `Se quitaron ${itemIds.length} ítem(s)`);
  return recalcularYSincronizar(presupuesto_id);
}

async function agregarItems(presupuesto_id, items) {
  const { error } = await supabase.from('presupuesto_items').insert(items.map((i) => ({ presupuesto_id, descripcion: i.descripcion, monto: i.monto })));
  if (error) throw error;
  await registrarHistorial(presupuesto_id, `Se agregaron ${items.length} ítem(s): ${items.map((i) => i.descripcion).join(', ')}`);
  return recalcularYSincronizar(presupuesto_id);
}

// Cambiar estado también sincroniza la deuda: si se rechaza o queda sin concretar, se cancela la deuda asociada.
async function cambiarEstado(id, estado) {
  const cambios = { estado, fecha_ultimo_contacto: new Date().toISOString() };
  if (estado === 'aceptado') cambios.fecha_aceptacion = new Date().toISOString();
  const { data, error } = await supabase.from('presupuestos').update(cambios).eq('id', id).select().single();
  if (error) throw error;
  await registrarHistorial(id, `Estado cambiado a "${estado}"`);
  if (estado === 'rechazado' || estado === 'no_concretado') {
    await cobros.cancelarPorPresupuesto(id);
  }
  return data;
}

async function presupuestosParaRecontactar(diasSinContacto = 7) {
  const limite = new Date();
  limite.setDate(limite.getDate() - diasSinContacto);
  const { data, error } = await supabase
    .from('presupuestos')
    .select('*, clientes(nombre, telefono)')
    .eq('archivado', false)
    .in('estado', ['pendiente', 'no_concretado'])
    .lt('fecha_ultimo_contacto', limite.toISOString())
    .order('fecha_ultimo_contacto', { ascending: true });
  if (error) throw error;
  return data;
}

async function obtenerUltimoPresupuesto(cliente_id) {
  const { data, error } = await supabase
    .from('presupuestos')
    .select('*, presupuesto_items(*)')
    .eq('cliente_id', cliente_id)
    .eq('archivado', false)
    .order('fecha_creacion', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function actualizarPresupuesto(id, cambios) {
  const { data, error } = await supabase
    .from('presupuestos')
    .update({ ...cambios, fecha_ultimo_contacto: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  if (cambios.monto) await cobros.actualizarMontoPorPresupuesto(id, cambios.monto);
  return data;
}

async function obtenerPresupuestosPorCliente(cliente_id) {
  const { data, error } = await supabase
    .from('presupuestos')
    .select('*, presupuesto_items(*)')
    .eq('cliente_id', cliente_id)
    .eq('archivado', false)
    .order('fecha_creacion', { ascending: false });
  if (error) throw error;
  return data;
}

async function archivarPresupuesto(id) {
  const { data, error } = await supabase.from('presupuestos').update({ archivado: true }).eq('id', id).select().single();
  if (error) throw error;
  await cobros.cancelarPorPresupuesto(id);
  return data;
}

async function restaurarPresupuesto(id) {
  const { data, error } = await supabase.from('presupuestos').update({ archivado: false }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function eliminarPresupuestoPermanente(id) {
  const { error } = await supabase.from('presupuestos').delete().eq('id', id);
  if (error) throw error;
}

async function ultimoArchivado(cliente_id) {
  const { data, error } = await supabase
    .from('presupuestos')
    .select('*')
    .eq('cliente_id', cliente_id)
    .eq('archivado', true)
    .order('fecha_ultimo_contacto', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function presupuestosArchivados() {
  const { data, error } = await supabase
    .from('presupuestos')
    .select('*, clientes(nombre, telefono, direccion)')
    .eq('archivado', true)
    .order('fecha_ultimo_contacto', { ascending: false });
  if (error) throw error;
  return data;
}

// Extracto de cuenta / reporte: todos los presupuestos de un cliente, sin importar estado
async function historialCompleto(cliente_id) {
  const { data, error } = await supabase
    .from('presupuestos')
    .select('*, presupuesto_items(*)')
    .eq('cliente_id', cliente_id)
    .order('fecha_creacion', { ascending: true });
  if (error) throw error;
  return data;
}

async function listarTodos() {
  const { data, error } = await supabase
    .from('presupuestos')
    .select('*, clientes(nombre)')
    .eq('archivado', false)
    .order('fecha_creacion', { ascending: false });
  if (error) throw error;
  return data;
}

// Presupuestos rechazados hace bastante tiempo, para sugerir reintentar
async function rechazadosParaReintentar(mesesMinimo = 3) {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - mesesMinimo);
  const { data, error } = await supabase
    .from('presupuestos')
    .select('*, clientes(nombre, telefono)')
    .eq('archivado', false)
    .eq('estado', 'rechazado')
    .lt('fecha_ultimo_contacto', limite.toISOString());
  if (error) throw error;
  return data;
}

async function obtenerHistorial(presupuesto_id) {
  const { data, error } = await supabase.from('presupuesto_historial').select('*').eq('presupuesto_id', presupuesto_id).order('creado_en', { ascending: true });
  if (error) throw error;
  return data;
}

// Presupuestos pendientes cuya validez ya venció (para el aviso automático)
async function presupuestosPorVencer() {
  const { data, error } = await supabase
    .from('presupuestos')
    .select('*, clientes(nombre, telefono)')
    .eq('archivado', false)
    .eq('estado', 'pendiente')
    .eq('aviso_vencimiento_enviado', false);
  if (error) throw error;
  const hoy = new Date();
  return (data || []).filter((p) => {
    const vence = new Date(p.fecha_creacion);
    vence.setDate(vence.getDate() + (p.dias_validez || 15));
    return vence <= hoy;
  });
}

async function marcarAvisoVencimientoEnviado(id) {
  await supabase.from('presupuestos').update({ aviso_vencimiento_enviado: true }).eq('id', id);
}

async function tasaConversion(desdeISO, hastaISO) {
  const { data, error } = await supabase.from('presupuestos').select('estado').gte('fecha_creacion', desdeISO).lte('fecha_creacion', hastaISO);
  if (error) throw error;
  const total = data.length;
  const aceptados = data.filter((p) => p.estado === 'aceptado').length;
  const rechazados = data.filter((p) => p.estado === 'rechazado').length;
  return { total, aceptados, rechazados, porcentaje: total ? Math.round((aceptados / total) * 100) : 0 };
}

async function presupuestosEnRango(desdeISO, hastaISO) {
  const { data, error } = await supabase
    .from('presupuestos')
    .select('*, presupuesto_items(*), clientes(nombre)')
    .gte('fecha_creacion', desdeISO)
    .lte('fecha_creacion', hastaISO)
    .order('fecha_creacion', { ascending: true });
  if (error) throw error;
  return data;
}

async function contarHoy() {
  const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
  const { data, error } = await supabase.from('presupuestos').select('id').gte('fecha_creacion', inicio.toISOString());
  if (error) throw error;
  return (data || []).length;
}

async function guardarPlantilla(nombre, items) {
  const { data, error } = await supabase.from('plantillas_presupuesto').insert([{ nombre, items }]).select().single();
  if (error) throw error;
  return data;
}

async function obtenerPlantilla(nombre) {
  const { data, error } = await supabase.from('plantillas_presupuesto').select('*').ilike('nombre', `%${nombre}%`).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function listarPlantillas() {
  const { data, error } = await supabase.from('plantillas_presupuesto').select('*').order('creado_en', { ascending: false });
  if (error) throw error;
  return data;
}

// Repite el último presupuesto de un cliente como base para uno nuevo, con posibles cambios
async function repetirPresupuesto(cliente_id, cambios = {}) {
  const ultimo = await obtenerUltimoPresupuesto(cliente_id);
  if (!ultimo) return null;
  const items = (ultimo.presupuesto_items || []).filter((i) => !i.archivado).map((i) => ({ descripcion: i.descripcion, monto: cambios.monto || i.monto }));
  return crearPresupuesto({ cliente_id, items });
}

module.exports = {
  crearPresupuesto,
  obtenerItems,
  quitarItems,
  agregarItems,
  cambiarEstado,
  presupuestosParaRecontactar,
  obtenerUltimoPresupuesto,
  actualizarPresupuesto,
  obtenerPresupuestosPorCliente,
  archivarPresupuesto,
  restaurarPresupuesto,
  eliminarPresupuestoPermanente,
  ultimoArchivado,
  presupuestosArchivados,
  historialCompleto,
  listarTodos,
  rechazadosParaReintentar,
  obtenerHistorial,
  presupuestosPorVencer,
  marcarAvisoVencimientoEnviado,
  tasaConversion,
  presupuestosEnRango,
  contarHoy,
  guardarPlantilla,
  obtenerPlantilla,
  listarPlantillas,
  repetirPresupuesto,
};
