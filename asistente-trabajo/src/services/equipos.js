const { supabase } = require('../db');

async function registrarEquipo({ cliente_id, tipo, descripcion, fecha_instalacion, meses_para_mantenimiento, aviso_automatico }) {
  let proximo_mantenimiento = null;
  if (meses_para_mantenimiento) {
    const f = new Date(fecha_instalacion);
    f.setMonth(f.getMonth() + Number(meses_para_mantenimiento));
    proximo_mantenimiento = f.toISOString().slice(0, 10);
  }
  const { data, error } = await supabase
    .from('equipos')
    .insert([{ cliente_id, tipo, descripcion, fecha_instalacion, proximo_mantenimiento, aviso_automatico: !!aviso_automatico }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Equipos cuyo mantenimiento vence hoy o ya pasó y todavía no se avisó
async function mantenimientosDelDia() {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('equipos')
    .select('*, clientes(nombre, telefono)')
    .lte('proximo_mantenimiento', hoy)
    .not('proximo_mantenimiento', 'is', null)
    .eq('aviso_enviado', false);
  if (error) throw error;
  return data;
}

async function marcarAvisoEnviado(id) {
  const { error } = await supabase.from('equipos').update({ aviso_enviado: true }).eq('id', id);
  if (error) throw error;
}

module.exports = { registrarEquipo, mantenimientosDelDia, marcarAvisoEnviado };
