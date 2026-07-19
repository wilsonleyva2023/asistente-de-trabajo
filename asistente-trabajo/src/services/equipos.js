const { supabase } = require('../db');

async function registrarEquipo({ cliente_id, tipo, descripcion, fecha_instalacion, meses_para_mantenimiento, aviso_automatico, marca, modelo, numero_serie, garantia_fabrica_meses, vida_util_anios, presupuesto_id }) {
  let proximo_mantenimiento = null;
  if (meses_para_mantenimiento) {
    const f = new Date(fecha_instalacion);
    f.setMonth(f.getMonth() + Number(meses_para_mantenimiento));
    proximo_mantenimiento = f.toISOString().slice(0, 10);
  }
  let garantia_fabrica_vencimiento = null;
  if (garantia_fabrica_meses) {
    const g = new Date(fecha_instalacion);
    g.setMonth(g.getMonth() + Number(garantia_fabrica_meses));
    garantia_fabrica_vencimiento = g.toISOString().slice(0, 10);
  }
  const { data, error } = await supabase
    .from('equipos')
    .insert([{
      cliente_id, tipo, descripcion, fecha_instalacion, proximo_mantenimiento,
      meses_intervalo: meses_para_mantenimiento || null, aviso_automatico: !!aviso_automatico,
      marca: marca || null, modelo: modelo || null, numero_serie: numero_serie || null,
      garantia_fabrica_vencimiento, vida_util_anios: vida_util_anios || null, presupuesto_id: presupuesto_id || null,
    }])
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

// Busca el equipo de un cliente que mejor coincida con un texto (tipo, marca, o "el de <tipo>")
async function buscarEquipoDeCliente(cliente_id, texto) {
  const lista = await equiposPorCliente(cliente_id);
  if (!texto) return lista[0] || null;
  const t = texto.toLowerCase();
  return lista.find((e) => e.tipo.toLowerCase().includes(t) || (e.marca || '').toLowerCase().includes(t)) || lista[0] || null;
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

// Mantenimientos que ya vencieron hace tiempo y siguen sin hacerse (distinto del aviso del día)
async function mantenimientosVencidosSinHacer(diasMinimo = 7) {
  const limite = new Date();
  limite.setDate(limite.getDate() - diasMinimo);
  const { data, error } = await supabase
    .from('equipos')
    .select('*, clientes(nombre, telefono)')
    .eq('activo', true)
    .not('proximo_mantenimiento', 'is', null)
    .lt('proximo_mantenimiento', limite.toISOString().slice(0, 10));
  if (error) throw error;
  return data;
}

async function marcarAvisoEnviado(id) {
  const { data: equipo, error: errGet } = await supabase.from('equipos').select('*').eq('id', id).single();
  if (errGet) throw errGet;

  // Guardamos el mantenimiento en el historial antes de reprogramar
  await supabase.from('mantenimientos_historial').insert([{ equipo_id: id, fecha: new Date().toISOString().slice(0, 10) }]);

  if (equipo.meses_intervalo) {
    const siguiente = new Date(equipo.proximo_mantenimiento);
    siguiente.setMonth(siguiente.getMonth() + Number(equipo.meses_intervalo));
    const { error } = await supabase.from('equipos').update({ proximo_mantenimiento: siguiente.toISOString().slice(0, 10), aviso_enviado: false }).eq('id', id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('equipos').update({ aviso_enviado: true }).eq('id', id);
    if (error) throw error;
  }
}

// Se llama cuando se completa una visita de mantenimiento manualmente (desde el chat)
async function registrarMantenimientoRealizado(equipo_id, gasto_repuestos, descripcion) {
  await supabase.from('mantenimientos_historial').insert([{ equipo_id, gasto_repuestos: gasto_repuestos || 0, descripcion: descripcion || null }]);
  return marcarAvisoEnviado(equipo_id);
}

async function historialMantenimientos(equipo_id) {
  const { data, error } = await supabase.from('mantenimientos_historial').select('*').eq('equipo_id', equipo_id).order('fecha', { ascending: false });
  if (error) throw error;
  return data;
}

// Cuenta equipos por tipo (para estadística/reportes)
async function estadisticaPorTipo() {
  const { data, error } = await supabase.from('equipos').select('tipo, marca').eq('activo', true);
  if (error) throw error;
  const conteo = {};
  (data || []).forEach((e) => {
    conteo[e.tipo] = (conteo[e.tipo] || 0) + 1;
  });
  return conteo;
}

// Equipos que se acercan al fin de su vida útil estimada
async function equiposParaReemplazo() {
  const { data, error } = await supabase.from('equipos').select('*, clientes(nombre)').eq('activo', true).not('vida_util_anios', 'is', null);
  if (error) throw error;
  const hoy = new Date();
  return (data || []).filter((e) => {
    const instalado = new Date(e.fecha_instalacion);
    const anios = (hoy - instalado) / (1000 * 60 * 60 * 24 * 365);
    return anios >= e.vida_util_anios - 1; // avisamos 1 año antes
  });
}

// Clientes con varios equipos que vencen mantenimiento cerca uno del otro (para agrupar visita)
async function clientesConMantenimientosAgrupables(diasVentana = 15) {
  const hoy = new Date();
  const limite = new Date(); limite.setDate(limite.getDate() + diasVentana);
  const { data, error } = await supabase
    .from('equipos')
    .select('*, clientes(nombre)')
    .eq('activo', true)
    .not('proximo_mantenimiento', 'is', null)
    .gte('proximo_mantenimiento', hoy.toISOString().slice(0, 10))
    .lte('proximo_mantenimiento', limite.toISOString().slice(0, 10));
  if (error) throw error;
  const porCliente = {};
  (data || []).forEach((e) => {
    const key = e.cliente_id;
    if (!porCliente[key]) porCliente[key] = { nombre: e.clientes?.nombre, equipos: [] };
    porCliente[key].equipos.push(e.tipo);
  });
  return Object.values(porCliente).filter((c) => c.equipos.length > 1);
}

module.exports = {
  registrarEquipo,
  editarEquipo,
  eliminarEquipo,
  equiposPorCliente,
  buscarEquipoDeCliente,
  mantenimientosDelDia,
  mantenimientosVencidosSinHacer,
  marcarAvisoEnviado,
  registrarMantenimientoRealizado,
  historialMantenimientos,
  estadisticaPorTipo,
  equiposParaReemplazo,
  clientesConMantenimientosAgrupables,
};
