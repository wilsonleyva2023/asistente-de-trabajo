const { supabase } = require('../db');

async function crearCobro({ cliente_id, presupuesto_id, monto, fecha_vencimiento }) {
  const { data, error } = await supabase
    .from('cobros')
    .insert([{ cliente_id, presupuesto_id, monto, fecha_vencimiento, estado: 'pendiente', monto_pagado: 0 }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function marcarCobrado(id, metodo_pago) {
  const { data: actual } = await supabase.from('cobros').select('*, clientes(pagos_a_tiempo, pagos_tarde)').eq('id', id).single();
  const aTiempo = !actual?.fecha_vencimiento || new Date() <= new Date(actual.fecha_vencimiento);
  if (actual?.cliente_id) {
    const campo = aTiempo ? 'pagos_a_tiempo' : 'pagos_tarde';
    const valorActual = actual.clientes?.[campo] || 0;
    await supabase.from('clientes').update({ [campo]: valorActual + 1 }).eq('id', actual.cliente_id);
  }
  const { data, error } = await supabase
    .from('cobros')
    .update({ estado: 'cobrado', fecha_cobro: new Date().toISOString().slice(0, 10), metodo_pago: metodo_pago || actual?.metodo_pago || null })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function registrarPagoParcial(id, montoPagado, metodo_pago) {
  const { data: actual, error: errorGet } = await supabase.from('cobros').select('*, clientes(pagos_a_tiempo, pagos_tarde)').eq('id', id).single();
  if (errorGet) throw errorGet;
  const nuevoPagado = Number(actual.monto_pagado || 0) + Number(montoPagado);
  const completo = nuevoPagado >= Number(actual.monto);
  const cambios = { monto_pagado: nuevoPagado, metodo_pago: metodo_pago || actual.metodo_pago || null };
  if (completo) {
    cambios.estado = 'cobrado';
    cambios.fecha_cobro = new Date().toISOString().slice(0, 10);
    const aTiempo = !actual.fecha_vencimiento || new Date() <= new Date(actual.fecha_vencimiento);
    const campo = aTiempo ? 'pagos_a_tiempo' : 'pagos_tarde';
    const valorActual = actual.clientes?.[campo] || 0;
    await supabase.from('clientes').update({ [campo]: valorActual + 1 }).eq('id', actual.cliente_id);
  }
  const { data, error } = await supabase.from('cobros').update(cambios).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function cobrosPendientes() {
  const { data, error } = await supabase
    .from('cobros')
    .select('*, clientes(nombre, telefono)')
    .eq('estado', 'pendiente')
    .eq('archivado', false)
    .order('fecha_vencimiento', { ascending: true });
  if (error) throw error;
  return data;
}

async function obtenerCobrosPorCliente(cliente_id) {
  const { data, error } = await supabase.from('cobros').select('*').eq('cliente_id', cliente_id).eq('archivado', false).order('creado_en', { ascending: false });
  if (error) throw error;
  return data;
}

async function historialPagos(cliente_id) {
  const { data, error } = await supabase
    .from('cobros')
    .select('*')
    .eq('cliente_id', cliente_id)
    .eq('estado', 'cobrado')
    .order('fecha_cobro', { ascending: false });
  if (error) throw error;
  return data;
}

async function archivarCobro(id) {
  const { data, error } = await supabase.from('cobros').update({ archivado: true }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function restaurarCobro(id) {
  const { data, error } = await supabase.from('cobros').update({ archivado: false }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function eliminarCobroPermanente(id) {
  const { error } = await supabase.from('cobros').delete().eq('id', id);
  if (error) throw error;
}

async function ultimoArchivado(cliente_id) {
  const { data, error } = await supabase.from('cobros').select('*').eq('cliente_id', cliente_id).eq('archivado', true).order('creado_en', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function actualizarMontoPorPresupuesto(presupuesto_id, nuevoMonto) {
  const { data: cobro } = await supabase.from('cobros').select('*').eq('presupuesto_id', presupuesto_id).eq('archivado', false).maybeSingle();
  if (!cobro) return null;
  const { error } = await supabase.from('cobros').update({ monto: nuevoMonto }).eq('id', cobro.id);
  if (error) throw error;
  return cobro;
}

async function cancelarPorPresupuesto(presupuesto_id) {
  const { data: cobro } = await supabase.from('cobros').select('*').eq('presupuesto_id', presupuesto_id).eq('archivado', false).maybeSingle();
  if (!cobro) return null;
  const { error } = await supabase.from('cobros').update({ archivado: true }).eq('id', cobro.id);
  if (error) throw error;
  return cobro;
}

async function cobrosEnRango(desdeISO, hastaISO) {
  const { data, error } = await supabase.from('cobros').select('*, clientes(nombre)').gte('creado_en', desdeISO).lte('creado_en', hastaISO);
  if (error) throw error;
  return data;
}

// ---------- NUEVO: cuotas ----------
async function crearCuotas(cobro_id, cantidad, montoTotal, primerVencimiento) {
  const montoPorCuota = Math.round((montoTotal / cantidad) * 100) / 100;
  const cuotas = [];
  for (let i = 0; i < cantidad; i++) {
    const venc = new Date(primerVencimiento);
    venc.setMonth(venc.getMonth() + i);
    cuotas.push({ cobro_id, numero_cuota: i + 1, monto: montoPorCuota, fecha_vencimiento: venc.toISOString().slice(0, 10) });
  }
  const { data, error } = await supabase.from('cobro_cuotas').insert(cuotas).select();
  if (error) throw error;
  return data;
}

async function cuotasPorCobro(cobro_id) {
  const { data, error } = await supabase.from('cobro_cuotas').select('*').eq('cobro_id', cobro_id).order('numero_cuota', { ascending: true });
  if (error) throw error;
  return data;
}

async function pagarCuota(cuota_id) {
  const { data, error } = await supabase.from('cobro_cuotas').update({ estado: 'pagada' }).eq('id', cuota_id).select().single();
  if (error) throw error;
  return data;
}

// ---------- NUEVO: recargo ----------
async function aplicarRecargo(id, porcentaje) {
  const { data: actual } = await supabase.from('cobros').select('*').eq('id', id).single();
  const recargo = Math.round(Number(actual.monto) * (porcentaje / 100) * 100) / 100;
  const { data, error } = await supabase.from('cobros').update({ monto: Number(actual.monto) + recargo, recargo_aplicado: recargo }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ---------- NUEVO: descuento por pronto pago ----------
async function aplicarDescuentoProntoPago(id, porcentaje, fechaLimite) {
  const { data, error } = await supabase
    .from('cobros')
    .update({ descuento_pronto_pago: porcentaje, fecha_limite_descuento: fechaLimite })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- NUEVO: vencidos (para agrupar en un solo aviso) ----------
async function cobrosVencidos() {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('cobros')
    .select('*, clientes(nombre, telefono)')
    .eq('estado', 'pendiente')
    .eq('archivado', false)
    .lt('fecha_vencimiento', hoy);
  if (error) throw error;
  return data;
}

// ---------- NUEVO: agrupado por antigüedad ----------
async function deudasPorAntiguedad() {
  const pendientes = await cobrosPendientes();
  const hoy = new Date();
  const grupos = { recientes: [], treinta: [], sesenta: [] };
  pendientes.forEach((c) => {
    if (!c.fecha_vencimiento) return grupos.recientes.push(c);
    const dias = Math.floor((hoy - new Date(c.fecha_vencimiento)) / (1000 * 60 * 60 * 24));
    if (dias <= 30) grupos.recientes.push(c);
    else if (dias <= 60) grupos.treinta.push(c);
    else grupos.sesenta.push(c);
  });
  return grupos;
}

// ---------- NUEVO: caja del día / proyección / por método ----------
async function cajaDelDia() {
  const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
  const { data, error } = await supabase.from('cobros').select('*').eq('estado', 'cobrado').gte('fecha_cobro', inicio.toISOString().slice(0, 10));
  if (error) throw error;
  const porMetodo = {};
  (data || []).forEach((c) => {
    const m = c.metodo_pago || 'sin especificar';
    porMetodo[m] = (porMetodo[m] || 0) + Number(c.monto_pagado || c.monto);
  });
  return porMetodo;
}

async function proyeccionIngresos(dias = 15) {
  const hoy = new Date().toISOString().slice(0, 10);
  const limite = new Date(); limite.setDate(limite.getDate() + dias);
  const { data, error } = await supabase
    .from('cobros')
    .select('monto, monto_pagado')
    .eq('estado', 'pendiente')
    .eq('archivado', false)
    .gte('fecha_vencimiento', hoy)
    .lte('fecha_vencimiento', limite.toISOString().slice(0, 10));
  if (error) throw error;
  return (data || []).reduce((acc, c) => acc + (Number(c.monto) - Number(c.monto_pagado || 0)), 0);
}

async function reportePorMetodo(desdeISO, hastaISO) {
  const { data, error } = await supabase.from('cobros').select('*').eq('estado', 'cobrado').gte('fecha_cobro', desdeISO).lte('fecha_cobro', hastaISO);
  if (error) throw error;
  const porMetodo = {};
  (data || []).forEach((c) => {
    const m = c.metodo_pago || 'sin especificar';
    porMetodo[m] = (porMetodo[m] || 0) + Number(c.monto);
  });
  return porMetodo;
}

module.exports = {
  crearCobro,
  marcarCobrado,
  registrarPagoParcial,
  cobrosPendientes,
  obtenerCobrosPorCliente,
  historialPagos,
  archivarCobro,
  restaurarCobro,
  eliminarCobroPermanente,
  ultimoArchivado,
  actualizarMontoPorPresupuesto,
  cancelarPorPresupuesto,
  cobrosEnRango,
  crearCuotas,
  cuotasPorCobro,
  pagarCuota,
  aplicarRecargo,
  aplicarDescuentoProntoPago,
  cobrosVencidos,
  deudasPorAntiguedad,
  cajaDelDia,
  proyeccionIngresos,
  reportePorMetodo,
};
