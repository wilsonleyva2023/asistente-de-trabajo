const { Markup } = require('telegraf');

const CATEGORIAS = {
  clientes: {
    titulo: '👥 Clientes',
    temas: {
      crear: { titulo: 'Cargar un cliente', texto: '👥 CARGAR UN CLIENTE\n\nDecile algo como:\n"Creame un cliente Roberto Fernández, tel 221-555-1234, en Calle 12 N°845"\n\nSi hay riesgo de que se repita el nombre, agregale una referencia:\n"Sandra, la de Barrio Norte"' },
      editar: { titulo: 'Corregir datos', texto: '✏️ CORREGIR DATOS\n\n"Corregile la dirección a Roberto, es Calle 12 N°850"\n"Está mal escrito, es Berisso no Berizo"\n\nCorrige el cliente ya cargado, no crea uno nuevo.' },
      borrar: { titulo: 'Borrar / restaurar', texto: '🗑️ BORRAR O RESTAURAR\n\n"Borrá a Roberto" → queda archivado, se puede recuperar\n"Borralo definitivamente" → no se puede deshacer\n"Restaurá a Roberto" → lo recupera si lo borraste temporal' },
      buscar: { titulo: 'Buscar / ver ficha', texto: '🔍 BUSCAR UN CLIENTE\n\n"Buscame a Roberto" o "mostrame la ficha de Roberto"\n\nTe muestra sus datos, presupuestos, trabajos y deudas.' },
    },
  },
  presupuestos: {
    titulo: '📋 Presupuestos y recibos',
    temas: {
      crear: { titulo: 'Crear un presupuesto', texto: '📋 CREAR UN PRESUPUESTO\n\n"Hacele un presupuesto a Roberto por destapación $20000 y cambio de sifón $8000"\n\nPor defecto no genera el PDF, solo confirma en texto. Si lo querés en PDF, agregá "y pasámelo en pdf".' },
      items: { titulo: 'Agregar / sacar ítems', texto: '➕➖ AGREGAR O SACAR ÍTEMS\n\n"Agregale al presupuesto de Roberto el cambio de válvula, $5000"\n"Sacale el ítem de la silicona"\n\nEl total se actualiza solo, y la deuda también.' },
      estado: { titulo: 'Aceptado / rechazado', texto: '✅❌ MARCAR EL ESTADO\n\n"Roberto aceptó el presupuesto"\n"Jennifer rechazó el trabajo"\n\nSi no lo marcás, el sistema va a seguir sugiriendo recontactar aunque ya esté cerrado.' },
      recibo: { titulo: 'Generar un recibo', texto: '🧾 GENERAR UN RECIBO\n\n"Pasame el recibo de Roberto"\n\nSi tiene un presupuesto activo, usa esos datos solo. La deuda se salda automáticamente.' },
    },
  },
  cobros: {
    titulo: '💰 Cobros y pagos',
    temas: {
      pendientes: { titulo: 'Ver lo que me deben', texto: '💰 COBROS PENDIENTES\n\n"¿Qué me deben?" o "mostrame los pendientes"\n\nTe lista cliente, monto y vencimiento.' },
      parcial: { titulo: 'Pago parcial', texto: '💵 PAGO PARCIAL\n\n"Roberto me pagó $20000 de los $45000"\n\nQueda el saldo restante pendiente, se marca solo como cobrado cuando se completa.' },
    },
  },
  agenda: {
    titulo: '📅 Agenda y visitas',
    temas: {
      agendar: { titulo: 'Agendar un trabajo', texto: '🗓️ AGENDAR UN TRABAJO\n\n"Agendame a Roberto el jueves a las 14hs para revisar el aire"\n"Avisame 2 horas antes" o "avisame el día anterior"' },
      ver: { titulo: 'Ver mi agenda', texto: '📆 VER LA AGENDA\n\n"Qué tengo hoy" / "qué tengo mañana" / "mi agenda de la semana"' },
      completar: { titulo: 'Terminar o reagendar', texto: '✅🔁 TERMINAR O REAGENDAR\n\n"Terminé lo de Roberto" → lo marca hecho\n"Tengo que volver a lo de Jennifer, pasalo para el jueves" → lo reagenda' },
    },
  },
  equipos: {
    titulo: '🔧 Equipos y mantenimiento',
    temas: {
      registrar: { titulo: 'Registrar un equipo', texto: '🔧 REGISTRAR UN EQUIPO\n\n"Le instalé un termotanque a Roberto, mantenimiento cada 12 meses"\n\nEl aviso se repite solo cada año, no hace falta cargarlo de nuevo.' },
    },
  },
  notas: {
    titulo: '📝 Notas',
    temas: {
      guardar: { titulo: 'Guardar una lista', texto: '📝 GUARDAR UNA NOTA\n\n"Anotá que para mañana necesito 2 caños de 1/2 y silicona"\n\nÚtil para listas de materiales, ideas sueltas.' },
      buscar: { titulo: 'Buscar una nota', texto: '🔍 BUSCAR UNA NOTA\n\n"Mostrame la lista que anoté ayer" / "dame todas mis notas"' },
    },
  },
  reportes: {
    titulo: '📊 Reportes y negocio',
    temas: {
      extracto: { titulo: 'Extracto de un cliente', texto: '📄 EXTRACTO DE CUENTA\n\n"Dame el extracto de Roberto"\n\nPDF con todo lo que le hiciste y cobraste.' },
      mensual: { titulo: 'Reporte del mes', texto: '📊 REPORTE MENSUAL\n\n"¿Cómo vengo este mes?"\n\nTotal facturado, cobrado y pendiente.' },
      bitacora: { titulo: 'Bitácora de trabajo', texto: '📓 BITÁCORA\n\n"Dame mi bitácora de julio"\n\nPDF con todos los trabajos del mes, cliente por cliente.' },
    },
  },
  adjuntos: {
    titulo: '🎙️ Fotos, audio y docs',
    temas: {
      audio: { titulo: 'Mandar un audio', texto: '🎙️ AUDIOS\n\nMandale una nota de voz como si le hablaras a una persona. Te transcribe y actúa igual que si lo hubieras escrito.' },
      foto: { titulo: 'Mandar una foto', texto: '📷 FOTOS\n\nMandale una foto de un problema o trabajo. La mira y te ayuda con lo que corresponda.' },
      doc: { titulo: 'Mandar un documento', texto: '📎 DOCUMENTOS\n\nMandale un PDF u otro documento y te ayuda a leerlo o resumirlo.' },
    },
  },
};

function tecladoCategorias() {
  const filas = [];
  const claves = Object.keys(CATEGORIAS);
  for (let i = 0; i < claves.length; i += 2) {
    const fila = [Markup.button.callback(CATEGORIAS[claves[i]].titulo, `cat:${claves[i]}`)];
    if (claves[i + 1]) fila.push(Markup.button.callback(CATEGORIAS[claves[i + 1]].titulo, `cat:${claves[i + 1]}`));
    filas.push(fila);
  }
  return Markup.inlineKeyboard(filas);
}

function tecladoTemas(catKey) {
  const cat = CATEGORIAS[catKey];
  const filas = Object.keys(cat.temas).map((temaKey) => [Markup.button.callback(cat.temas[temaKey].titulo, `tema:${catKey}:${temaKey}`)]);
  filas.push([Markup.button.callback('⬅️ Volver a categorías', 'top')]);
  return Markup.inlineKeyboard(filas);
}

function tecladoDetalle(catKey) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`⬅️ Volver a ${CATEGORIAS[catKey].titulo}`, `cat:${catKey}`)],
    [Markup.button.callback('🏠 Categorías', 'top')],
  ]);
}

function registrarAyuda(bot) {
  bot.command('ayuda', (ctx) => {
    ctx.reply('¿Sobre qué querés saber más? 🙂', tecladoCategorias());
  });

  bot.action('top', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('¿Sobre qué querés saber más? 🙂', tecladoCategorias());
  });

  bot.action(/^cat:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const catKey = ctx.match[1];
    const cat = CATEGORIAS[catKey];
    if (!cat) return;
    await ctx.editMessageText(`${cat.titulo}\n¿Qué querés saber?`, tecladoTemas(catKey));
  });

  bot.action(/^tema:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const [, catKey, temaKey] = ctx.match;
    const tema = CATEGORIAS[catKey]?.temas?.[temaKey];
    if (!tema) return;
    await ctx.editMessageText(tema.texto, tecladoDetalle(catKey));
  });
}

module.exports = { registrarAyuda };
