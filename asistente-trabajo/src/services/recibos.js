const { supabase } = require('../db');

async function crearRecibo({ cliente_id, presupuesto_id, concepto, monto, es_pago_parcial }) {
  const { data, error } = await supabase
    .from('recibos')
    .insert([{ cliente_id, presupuesto_id: presupuesto_id || null, concepto, monto, es_pago_parcial: !!es_pago_parcial, es_pago_completo: !es_pago_parcial }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function contarHoy() {
  const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
  const { data, error } = await supabase.from('recibos').select('id').gte('creado_en', inicio.toISOString());
  if (error) throw error;
  return (data || []).length;
}

async function recibosPorCliente(cliente_id) {
  const { data, error } = await supabase.from('recibos').select('*').eq('cliente_id', cliente_id).order('creado_en', { ascending: false });
  if (error) throw error;
  return data;
}

async function recibosEnRango(desdeISO, hastaISO) {
  const { data, error } = await supabase
    .from('recibos')
    .select('*, clientes(nombre)')
    .gte('creado_en', desdeISO)
    .lte('creado_en', hastaISO)
    .order('creado_en', { ascending: true });
  if (error) throw error;
  return data;
}

module.exports = { crearRecibo, recibosPorCliente, recibosEnRango, contarHoy };
