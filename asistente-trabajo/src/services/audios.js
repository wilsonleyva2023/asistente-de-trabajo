const { supabase } = require('../db');

async function guardarAudio({ cliente_id, url, transcripcion }) {
  const { data, error } = await supabase.from('audios_guardados').insert([{ cliente_id: cliente_id || null, url, transcripcion: transcripcion || null }]).select().single();
  if (error) throw error;
  return data;
}

async function audiosDeCliente(cliente_id) {
  const { data, error } = await supabase.from('audios_guardados').select('*').eq('cliente_id', cliente_id).order('creado_en', { ascending: false });
  if (error) throw error;
  return data;
}

module.exports = { guardarAudio, audiosDeCliente };
