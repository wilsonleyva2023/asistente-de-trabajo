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
    .insert([
      {
        cliente_id,
        tipo,
        descripcion,
        fecha_instalacion,
        proximo_mantenimiento,
        meses_intervalo: meses_para_mantenimiento || null,
        aviso_automatico: !!aviso_automatico,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function editarEquipo(id, cambios) {
  const { data, error } = await supabase.from('equipos').update(cambios).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function eliminarEquipo(id) {
  const { error } = await supabase.from('equipos').update({ activo: false }).eq('id', id);
  if (error) throw error;
}

async function equiposPorCliente(cliente_id) {
  const { data, error } = await supabase.from('equipos').select('*').eq('cliente_id', cliente_id).eq('activo', true);
  if (error) throw error;
  return data;
}

async function mantenimientosDelDia() {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('equipos')
    .select('*, clientes(nombre, telefono)')
    .eq('activo', true)
    .lte('proximo_mantenimiento', hoy)
    .not('proximo_mantenimiento', 'is', null)
    .eq('aviso_enviado', false);
  if (error) throw error;
  return data;
}

// En vez de solo marcar "ya avisé", si el equipo tiene un intervalo (ej: cada 12 meses),
// programa solo la próxima fecha para el año siguiente y reactiva el aviso.
async function marcarAvisoEnviado(id) {
  const { data: equipo, error: errGet } = await supabase.from('equipos').select('*').eq('id', id).single();
  if (errGet) throw errGet;

  if (equipo.meses_intervalo) {
    const siguiente = new Date(equipo.proximo_mantenimiento);
    siguiente.setMonth(siguiente.getMonth() + Number(equipo.meses_intervalo));
    const { error } = await supabase
      .from('equipos')
      .update({ proximo_mantenimiento: siguiente.toISOString().slice(0, 10), aviso_enviado: false })
      .eq('id', id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('equipos').update({ aviso_enviado: true }).eq('id', id);
    if (error) throw error;
  }
}

module.exports = { registrarEquipo, editarEquipo, eliminarEquipo, equiposPorCliente, mantenimientosDelDia, marcarAvisoEnviado };
