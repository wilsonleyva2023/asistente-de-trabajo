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

async function marcarCobrado(id) {
  const { data, error } = await supabase
    .from('cobros')
    .update({ estado: 'cobrado', fecha_cobro: new Date().toISOString().slice(0, 10) })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function registrarPagoParcial(id, montoPagado) {
  const { data: actual, error: errorGet } = await supabase.from('cobros').select('*').eq('id', id).single();
  if (errorGet) throw errorGet;
  const nuevoPagado = Number(actual.monto_pagado || 0) + Number(montoPagado);
  const completo = nuevoPagado >= Number(actual.monto);
  const { data, error } = await supabase
    .from('cobros')
    .update({
      monto_pagado: nuevoPagado,
      estado: completo ? 'cobrado' : 'pendiente',
      fecha_cobro: completo ? new Date().toISOString().slice(0, 10) : actual.fecha_cobro,
    })
    .eq('id', id)
    .select()
    .single();
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
  const { data, error } = await supabase
    .from('cobros')
    .select('*')
    .eq('cliente_id', cliente_id)
    .eq('archivado', false)
    .order('creado_en', { ascending: false });
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
  const { data, error } = await supabase
    .from('cobros')
    .select('*')
    .eq('cliente_id', cliente_id)
    .eq('archivado', true)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Usado por presupuestos.js para mantener sincronizado el monto cuando cambian los ítems
async function actualizarMontoPorPresupuesto(presupuesto_id, nuevoMonto) {
  const { data: cobro } = await supabase.from('cobros').select('*').eq('presupuesto_id', presupuesto_id).eq('archivado', false).maybeSingle();
  if (!cobro) return null;
  const { error } = await supabase.from('cobros').update({ monto: nuevoMonto }).eq('id', cobro.id);
  if (error) throw error;
  return cobro;
}

// Usado por presupuestos.js cuando se rechaza/archiva un presupuesto: cancela la deuda asociada
async function cancelarPorPresupuesto(presupuesto_id) {
  const { data: cobro } = await supabase.from('cobros').select('*').eq('presupuesto_id', presupuesto_id).eq('archivado', false).maybeSingle();
  if (!cobro) return null;
  const { error } = await supabase.from('cobros').update({ archivado: true }).eq('id', cobro.id);
  if (error) throw error;
  return cobro;
}

async function cobrosEnRango(desdeISO, hastaISO) {
  const { data, error } = await supabase
    .from('cobros')
    .select('*, clientes(nombre)')
    .gte('creado_en', desdeISO)
    .lte('creado_en', hastaISO);
  if (error) throw error;
  return data;
}

module.exports = {
  crearCobro,
  marcarCobrado,
  registrarPagoParcial,
  cobrosPendientes,
  obtenerCobrosPorCliente,
  archivarCobro,
  restaurarCobro,
  eliminarCobroPermanente,
  ultimoArchivado,
  actualizarMontoPorPresupuesto,
  cancelarPorPresupuesto,
  cobrosEnRango,
};
