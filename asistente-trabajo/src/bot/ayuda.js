const { Markup } = require('telegraf');

const CATEGORIAS = {
  clientes: {
    titulo: '👥 Clientes',
    temas: {
      crear: { titulo: 'Cargar un cliente', texto: '👥 CARGAR UN CLIENTE\n\nDecile algo como:\n"Creame un cliente Roberto Fernández, tel 221-555-1234, en Calle 12 N°845"\n\nSi hay riesgo de que se repita el nombre, agregale una referencia:\n"Sandra, la de Barrio Norte"\n\nCon el nombre solo alcanza, podés completar el resto después.' },
      editar: { titulo: 'Corregir datos', texto: '✏️ CORREGIR DATOS\n\n"Corregile la dirección a Roberto, es Calle 12 N°850"\n"Está mal escrito, es Berisso no Berizo"\n\nCorrige el cliente ya cargado, no crea uno nuevo. También tolera errores de tipeo al buscar.' },
      borrar: { titulo: 'Borrar / restaurar', texto: '🗑️ BORRAR O RESTAURAR\n\n"Borrá a Roberto" → queda archivado, se puede recuperar\n"Borralo definitivamente" → no se puede deshacer\n"Restaurá a Roberto" → lo recupera si lo borraste temporal' },
      buscar: { titulo: 'Buscar / ver ficha', texto: '🔍 BUSCAR UN CLIENTE\n\n"Buscame a Roberto" te da un resumen corto.\n"Dame la ficha completa de Roberto" te muestra todo el detalle.' },
      categoria: { titulo: 'Categorías propias', texto: '🏷️ CATEGORÍAS\n\nCreás las categorías que quieras, libres:\n"Marcá a Roberto como arquitecto"\n"Es administrador de consorcio"\n\nDespués: "Dame todos los arquitectos" o "los comercios que me deben"' },
      prioridad: { titulo: 'VIP / bloqueado', texto: '⭐🚫 PRIORIDAD Y BLOQUEO\n\n"Roberto es un cliente de confianza" → lo marca prioritario\n"No quiero trabajar más con Fulano" → lo marca bloqueado, para que te avise si intentás agendarle algo' },
      datosextra: { titulo: 'Cumpleaños, horario, descuento', texto: '🎂⏰💵 DATOS EXTRA\n\n"El cumpleaños de Roberto es el 15 de marzo"\n"Roberto solo puede a la tarde"\n"A Roberto siempre le hago 10% de descuento"\n"Otro contacto de Roberto es Jennifer, 221-555-9999"' },
      direcciones: { titulo: 'Varias direcciones', texto: '📍 VARIAS DIRECCIONES\n\n"Agregale a Roberto otra dirección, su local en Calle 50"\n\nÚtil si le hacés trabajos en más de un lugar.' },
      duplicados: { titulo: 'Unir duplicados', texto: '🔗 UNIR CLIENTES DUPLICADOS\n\n"Combiná a Roberto y Roberto Fernández, son la misma persona"\n\nUne todo el historial en uno solo, sin perder nada.' },
      telefono: { titulo: 'Buscar por teléfono', texto: '📞 BUSCAR POR TELÉFONO\n\n"¿Quién es el 221-555-1234?"\n\nÚtil si te llama un número que no tenés guardado en el celular.' },
      silencio: { titulo: 'Clientes en silencio', texto: '🔇 CLIENTES EN SILENCIO\n\nEl asistente te avisa solo en el resumen semanal si un cliente lleva mucho tiempo sin contacto.\n\nTambién podés pedirlo: "dame los clientes en silencio"' },
      satisfaccion: { titulo: 'Satisfacción', texto: '😊 SATISFACCIÓN\n\n"Roberto quedó muy conforme con el último trabajo"\n\nQueda registrado en su historial.' },
    },
  },
  presupuestos: {
    titulo: '📋 Presupuestos y recibos',
    temas: {
      crear: { titulo: 'Crear un presupuesto', texto: '📋 CREAR UN PRESUPUESTO\n\n"Hacele un presupuesto a Roberto por destapación $20000 y cambio de sifón $8000"\n\nPor defecto no genera el PDF, solo confirma en texto. Si lo querés en PDF, agregá "y pasámelo en pdf".' },
      items: { titulo: 'Agregar / sacar ítems', texto: '➕➖ AGREGAR O SACAR ÍTEMS\n\n"Agregale al presupuesto de Roberto el cambio de válvula, $5000"\n"Sacale el ítem de la silicona"\n\nEl total se actualiza solo, y la deuda también.' },
      estado: { titulo: 'Aceptado / rechazado', texto: '✅❌ MARCAR EL ESTADO\n\n"Roberto aceptó el presupuesto"\n"Jennifer rechazó el trabajo"\n\nSi no lo marcás, el sistema va a seguir sugiriendo recontactar aunque ya esté cerrado.' },
      recibo: { titulo: 'Generar un recibo', texto: '🧾 GENERAR UN RECIBO\n\n"Pasame el recibo de Roberto"\n\nSi tiene un presupuesto activo, usa esos datos solo. La deuda se salda automáticamente.' },
      plantillas: { titulo: 'Plantillas reutilizables', texto: '📑 PLANTILLAS\n\n"Guardá este presupuesto como plantilla: mantenimiento AC estándar"\n\nDespués: "Hacele a Roberto el presupuesto de mantenimiento AC estándar" y se arma solo.' },
      repetir: { titulo: 'Repetir el último', texto: '🔁 REPETIR UN PRESUPUESTO\n\n"Repetile a Roberto el mismo presupuesto que la última vez, pero a $50000"\n\nÚtil para trabajos parecidos que se repiten.' },
      lote: { titulo: 'Varios de una', texto: '📦 PRESUPUESTOS EN LOTE\n\n"Hacé el mismo presupuesto de mantenimiento a Roberto, Jennifer y Marcos"\n\nCrea varios de una sola vez.' },
      validez: { titulo: 'Validez y vencimiento', texto: '⏳ VALIDEZ\n\nPor defecto un presupuesto vale 15 días. Podés cambiarlo: "este presupuesto vale 30 días".\n\nSi nadie respondió al vencer, te avisa solo con un mensaje listo para reenviar.' },
      fotos: { titulo: 'Fotos en el presupuesto', texto: '📷 FOTOS\n\nMandale una foto y decile "guardala en el presupuesto de Roberto"\n\nQueda asociada para siempre a ese cliente/presupuesto.' },
      numeros: { titulo: 'Números del negocio', texto: '📊 NÚMEROS\n\n"¿Cuántos presupuestos hice hoy?"\n"¿Qué tasa de conversión tengo este mes?"\n"¿Cuánto gané en el último trabajo de Roberto?" (rentabilidad neta)\n"Dame todos los presupuestos de julio en PDF"' },
      rapido: { titulo: 'Modo rápido', texto: '⚡ MODO RÁPIDO\n\n"Activá el modo rápido"\n\nLas confirmaciones quedan más cortas y directas, sin explicaciones de más.' },
    },
  },
  cobros: {
    titulo: '💰 Cobros y pagos',
    temas: {
      pendientes: { titulo: 'Ver lo que me deben', texto: '💰 COBROS PENDIENTES\n\n"¿Qué me deben?" o "mostrame los pendientes"\n\nTe lista cliente, monto y vencimiento.' },
      parcial: { titulo: 'Pago parcial', texto: '💵 PAGO PARCIAL\n\n"Roberto me pagó $20000 de los $45000"\n\nQueda el saldo restante pendiente, se marca solo como cobrado cuando se completa. Si decís "pagó todo", se cierra directo.' },
      metodo: { titulo: 'Método de pago', texto: '💳 MÉTODO DE PAGO\n\n"Roberto me pagó en efectivo"\n"Cobré por transferencia"\n\nQueda registrado para tus reportes.' },
      cuotas: { titulo: 'Plan de cuotas', texto: '📅 CUOTAS\n\n"Roberto va a pagar en 3 cuotas"\n"Pagó la cuota 2"\n\nDivide la deuda en cuotas mensuales con su propia fecha cada una.' },
      comprobante: { titulo: 'Comprobante de pago', texto: '📎 COMPROBANTE\n\nMandale la foto de la transferencia y decile "guardalo como comprobante de Roberto"' },
      reclamo: { titulo: 'Reclamar deuda vencida', texto: '📢 RECLAMAR\n\n"Mandame el mensaje para reclamarle a Jennifer"\n\nTe arma un mensaje respetuoso listo para reenviar.' },
      caja: { titulo: 'Caja y proyección', texto: '📊 CAJA\n\n"¿Cómo estoy de plata?" → pendiente + cobrado hoy + proyección, todo junto\n"¿Cuánto cobré hoy?"\n"¿Cuánto voy a cobrar en 15 días?"' },
      antiguedad: { titulo: 'Deudas por antigüedad', texto: '⏳ ANTIGÜEDAD\n\n"Dame las deudas más viejas primero"\n\nAgrupa por recientes, 30+ y 60+ días vencidas.' },
      extras: { titulo: 'Recargo y descuento', texto: '➕➖ RECARGO Y DESCUENTO\n\n"Aplicale un 5% de recargo a Roberto por atraso"\n"Si Jennifer paga antes del viernes, 10% menos"' },
      exportar: { titulo: 'Exportar / contador', texto: '📤 EXPORTAR\n\n"Dame los cobros de julio para el contador"\n\nListo para monotributo o tus propios registros.' },
      puntualidad: { titulo: 'Puntualidad del cliente', texto: '⭐ PUNTUALIDAD\n\n"¿Qué tan puntual es Roberto pagando?"\n\nTe dice cuántas veces pagó a tiempo vs. tarde.' },
      rapidos: { titulo: 'Comandos rápidos', texto: '⚡ COMANDOS RÁPIDOS\n\n/pendiente — cobros pendientes al toque\n/cobrado — cuánto cobraste hoy' },
    },
  },
  agenda: {
    titulo: '📅 Agenda y visitas',
    temas: {
      agendar: { titulo: 'Agendar un trabajo', texto: '🗓️ AGENDAR UN TRABAJO\n\n"Agendame a Roberto el jueves a las 14hs para revisar el aire"\n"Avisame 2 horas antes" o "avisame el día anterior"' },
      ver: { titulo: 'Ver mi agenda', texto: '📆 VER LA AGENDA\n\n"Qué tengo hoy" / "qué tengo mañana" / "mi agenda de la semana"' },
      completar: { titulo: 'Terminar o reagendar', texto: '✅🔁 TERMINAR O REAGENDAR\n\n"Terminé lo de Roberto" → lo marca hecho y te ofrece cargar el trabajo, cobrar y la satisfacción\n"Tengo que volver a lo de Jennifer, pasalo para el jueves" → lo reagenda\n"Cancelá lo de Roberto, no tenía el material" → cancela con motivo' },
      llevar: { titulo: 'Qué llevar', texto: '📦 QUÉ LLEVAR\n\n"Para lo de Roberto llevate la llave inglesa grande"\n\nTe aparece junto con esa visita en la agenda del día.' },
      confirmar: { titulo: 'Confirmación del cliente', texto: '✅ CONFIRMACIÓN\n\n"Roberto confirmó que va a estar"\n\nDistinto de solo agendado.' },
      recurrente: { titulo: 'Visita recurrente', texto: '🔁 RECURRENTE\n\n"Agendale una visita a Roberto cada 3 meses para revisión"\n\nCuando termine cada una, se programa sola la siguiente.' },
      historial: { titulo: 'Historial de visitas', texto: '📜 HISTORIAL\n\n"Mostrame todas las visitas que le hice a Roberto"' },
      bloqueo: { titulo: 'Horarios bloqueados', texto: '🚫 HORARIOS BLOQUEADOS\n\n"Bloqueame de 12 a 13, es mi almuerzo"\n\nTe avisa si intentás agendar algo ahí.' },
      export: { titulo: 'Exportar agenda', texto: '📤 EXPORTAR\n\n"Mandame la agenda de la semana en PDF"\n"Exportala para Google Calendar"' },
      horas: { titulo: 'Horas trabajadas', texto: '⏱️ HORAS TRABAJADAS\n\n"¿Cuántas horas trabajé esta semana?"' },
      resumen: { titulo: 'Cómo viene mi día', texto: '☀️ RESUMEN DEL DÍA\n\n"¿Cómo viene mi día?"\n\nTe junta agenda + cobros que vencen hoy + alertas, todo en una sola respuesta.' },
      rapidos: { titulo: 'Comandos rápidos', texto: '⚡ COMANDOS RÁPIDOS\n\n/hoy /manana /semana — agenda al toque, sin esperar a la IA' },
    },
  },
  equipos: {
    titulo: '🔧 Equipos y mantenimiento',
    temas: {
      registrar: { titulo: 'Registrar un equipo', texto: '🔧 REGISTRAR UN EQUIPO\n\nCualquier tipo: termotanque, bomba de agua, calefón, split de aire, cámara de seguridad, etc.\n\n"Le instalé un termotanque a Roberto, marca Rheem, mantenimiento cada 12 meses"\n"Le puse una bomba de agua a Jennifer" (simple, sin mantenimiento si no lo mencionás)\n\nEl aviso se repite solo, no hace falta cargarlo de nuevo cada vez.' },
      editar: { titulo: 'Corregir un equipo', texto: '✏️ CORREGIR UN EQUIPO\n\n"Corregile la marca al termotanque de Roberto, es Rheem no Escorial"\n"Agregale el número de serie"' },
      lista: { titulo: 'Ver equipos de un cliente', texto: '📋 VER EQUIPOS\n\n"¿Qué equipos tiene instalados Roberto?"' },
      historial: { titulo: 'Historial de mantenimientos', texto: '📜 HISTORIAL\n\n"Mostrame los mantenimientos que le hice a la bomba de Roberto"\n\nRegistra fecha y gasto en repuestos de cada uno.' },
      mantenimiento: { titulo: 'Registrar mantenimiento hecho', texto: '✅ MANTENIMIENTO REALIZADO\n\n"Le hice el mantenimiento al calefón de Roberto, gasté $3000 en repuestos"\n\nSe guarda en el historial y reprograma la próxima fecha sola.' },
      vencidos: { titulo: 'Mantenimientos vencidos', texto: '⚠️ VENCIDOS SIN HACER\n\n"¿Qué mantenimientos tengo vencidos?"\n\nDistinto del aviso del día: esto te muestra los que ya se pasaron y quedaron sin hacer.' },
      repuestos: { titulo: 'Repuestos necesarios', texto: '🔩 REPUESTOS\n\n"Para el próximo mantenimiento de Roberto vas a necesitar el filtro tal"' },
      garantia: { titulo: 'Garantía de fábrica', texto: '📄 GARANTÍA DE FÁBRICA\n\n"El termotanque de Roberto tiene garantía de fábrica hasta marzo de 2027"\n\nDistinta de la garantía de tu mano de obra.' },
      reemplazo: { titulo: 'Vida útil y reemplazo', texto: '♻️ VIDA ÚTIL\n\n"El termotanque de Roberto tiene una vida útil de 10 años"\n\nTe avisa un año antes de que se cumpla, para ofrecer el cambio a tiempo.' },
      ficha: { titulo: 'Ficha técnica en PDF', texto: '📄 FICHA TÉCNICA\n\n"Dame la ficha técnica del equipo de Roberto en PDF"\n\nÚtil para dejarle una copia al cliente.' },
      estadisticas: { titulo: 'Estadísticas', texto: '📊 ESTADÍSTICAS\n\n"¿Cuántos equipos de cada tipo instalé?"\n"¿Qué equipos tengo cerca de necesitar reemplazo?"' },
      agrupar: { titulo: 'Agrupar mantenimientos', texto: '📦 AGRUPAR VISITAS\n\n"¿Qué clientes tienen varios mantenimientos para agrupar en una sola visita?"' },
      rapido: { titulo: 'Comando rápido', texto: '⚡ COMANDO RÁPIDO\n\n/equipos — mantenimientos próximos o vencidos, al toque' },
    },
  },
  notas: {
    titulo: '📝 Notas',
    temas: {
      guardar: { titulo: 'Guardar una nota', texto: '📝 GUARDAR UNA NOTA\n\n"Anotá que para mañana necesito 2 caños de 1/2 y silicona"\n\nSe guarda directo, sin preguntas de más. Si mencionás un cliente o estás hablando de una visita, queda ligada sola.' },
      editar: { titulo: 'Corregir una nota', texto: '✏️ CORREGIR\n\n"Corregí la última nota, en vez de 3 caños son 5"' },
      buscar: { titulo: 'Buscar notas', texto: '🔍 BUSCAR\n\n"Mostrame la lista que anoté ayer" / "dame todas mis notas"\n\nPor defecto no muestra las ya tildadas como hechas.' },
      categoria: { titulo: 'Categorías', texto: '🏷️ CATEGORÍAS\n\nSe asignan solas según el contenido, o pedilo vos: "guardá esto en compras"\n\nDespués: "dame las notas de compras"' },
      completar: { titulo: 'Marcar como hecha', texto: '✅ COMPLETAR\n\n"Ya compré los caños, tildá esa nota"\n\nQueda guardada pero no aparece en la lista activa.' },
      fijar: { titulo: 'Fijar una nota', texto: '📌 FIJAR\n\n"Fijá esta nota, es importante"\n\nAparece primero en la lista.' },
      foto: { titulo: 'Foto en una nota', texto: '📷 FOTO\n\nMandale una foto y decile "guardala con esta nota"' },
      exportar: { titulo: 'Exportar / combinar', texto: '📤 EXPORTAR Y COMBINAR\n\n"Mandame esta nota en PDF"\n"Juntá la nota de materiales de ayer con la de hoy"' },
      borrar: { titulo: 'Borrar notas', texto: '🗑️ BORRAR\n\n"Borrá esa nota"\n"Borrá todas las que ya tildé" (borrado múltiple)' },
      rapido: { titulo: 'Comando rápido', texto: '⚡ COMANDO RÁPIDO\n\n/notas — tu lista activa al toque' },
    },
  },
  reportes: {
    titulo: '📊 Reportes y negocio',
    temas: {
      general: { titulo: 'Cómo va mi negocio', texto: '☀️ RESUMEN GENERAL\n\n"¿Cómo va mi negocio?" / "¿cómo ando?"\n\nTe junta facturación, pendientes, mejores clientes y alertas en una sola respuesta.' },
      mensual: { titulo: 'Reporte del mes', texto: '📊 REPORTE MENSUAL\n\n"¿Cómo vengo este mes?"\n\nTotal facturado, cobrado y pendiente. Respuesta corta en texto, PDF solo si lo pedís.' },
      comparar: { titulo: 'Comparar meses', texto: '📈 COMPARAR\n\n"¿Cómo vengo comparado al mes pasado?"\n\nTe dice si vas mejor, peor o similar, no solo el número.' },
      anual: { titulo: 'Reporte anual', texto: '📅 REPORTE ANUAL\n\n"Dame el reporte del año" / "exportalo en pdf para el contador"' },
      ranking: { titulo: 'Mejores clientes', texto: '🏆 RANKING\n\n"¿Quiénes son mis mejores clientes este mes?"' },
      rentabilidad: { titulo: 'Rentabilidad', texto: '💵 RENTABILIDAD\n\n"¿Cuánto me quedó limpio este mes?" (facturado menos gastos en materiales)' },
      proyeccion: { titulo: 'Proyección', texto: '🔮 PROYECCIÓN\n\n"¿Cómo voy a terminar el mes al ritmo actual?"' },
      grafico: { titulo: 'Gráfico de facturación', texto: '📊 GRÁFICO\n\n"Mostrame un gráfico de facturación de los últimos meses"' },
      categoria_rubro: { titulo: 'Por categoría / rubro', texto: '🏷️ POR CATEGORÍA O RUBRO\n\n"¿Cuánto facturé por categoría de cliente?"\n"¿Cuánto facturé por rubro este mes?"' },
      clientes_nr: { titulo: 'Nuevos vs. recurrentes', texto: '👥 NUEVOS VS. RECURRENTES\n\n"¿Cuántos clientes nuevos tuve este mes?"' },
      tiempo: { titulo: 'Tiempo de cierre', texto: '⏱️ TIEMPO DE CIERRE\n\n"¿Cuánto tardan en aceptarme un presupuesto en promedio?"' },
      extracto: { titulo: 'Extracto de un cliente', texto: '📄 EXTRACTO DE CUENTA\n\n"Dame el extracto de Roberto"\n\nPDF con todo lo que le hiciste y cobraste.' },
      bitacora: { titulo: 'Bitácora de trabajo', texto: '📓 BITÁCORA\n\n"Dame mi bitácora de julio"\n\nPDF con todos los trabajos del mes, cliente por cliente.' },
      rapido: { titulo: 'Comando rápido', texto: '⚡ COMANDO RÁPIDO\n\n/reporte — el reporte del mes al toque' },
    },
  },
  adjuntos: {
    titulo: '🎙️ Fotos, audio y docs',
    temas: {
      audio: { titulo: 'Mandar un audio', texto: '🎙️ AUDIOS\n\nMandale una nota de voz como si le hablaras a una persona. Te transcribe y actúa igual que si lo hubieras escrito.\n\n"Guardá este audio con Roberto" — guarda el audio original, no solo el texto.' },
      foto: { titulo: 'Mandar una foto', texto: '📷 FOTOS\n\nMandale una foto de un problema o trabajo. La mira y te ayuda con lo que corresponda.\n\n"Guardala con Roberto" — queda para siempre en su ficha.\n"Es de antes/después" — la etiqueta así.' },
      galeria: { titulo: 'Ver fotos de un cliente', texto: '🖼️ GALERÍA\n\n"Mostrame las fotos de Roberto"' },
      ticket: { titulo: 'Foto de un ticket', texto: '🧾 TICKETS\n\nFotografiá el ticket de la ferretería y decile "anotá este gasto"\n\nLee el monto solo, sin que lo tipees.' },
      chapita: { titulo: 'Datos de un equipo por foto', texto: '🔧 CHAPITA DEL EQUIPO\n\nFotografiá la etiqueta del equipo (marca, modelo, serie) y decile "cargá estos datos"\n\nLos extrae y los guarda en el equipo del cliente.' },
      doc: { titulo: 'Mandar un documento', texto: '📎 DOCUMENTOS\n\nMandale un PDF u otro documento y te ayuda a leerlo o resumirlo (resumen corto por defecto).\n\n"Guardalo con Roberto" — queda disponible para siempre.' },
      firma: { titulo: 'Firma como respaldo', texto: '✍️ FIRMA\n\nFotografiá la firma del cliente en el papel y decile "guardala como respaldo del presupuesto"' },
      rapido: { titulo: 'Comando rápido', texto: '⚡ COMANDO RÁPIDO\n\n/fotos — tus últimos archivos guardados' },
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
