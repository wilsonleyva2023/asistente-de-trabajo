const PDFDocument = require('pdfkit');
const path = require('path');

const MARCA = process.env.NOMBRE_NEGOCIO || 'Mi Negocio';
const TITULAR = process.env.TITULAR_NEGOCIO || '';
const DIRECCION = process.env.DIRECCION_NEGOCIO || '';
const CUIT = process.env.CUIT_NEGOCIO || '';
const TELEFONO = process.env.TELEFONO_NEGOCIO || '';
const EMAIL = process.env.EMAIL_NEGOCIO || '';
const SITIO_WEB = process.env.SITIO_WEB || '';
const FACEBOOK = process.env.FACEBOOK || '';
const INSTAGRAM = process.env.INSTAGRAM || '';

const LOGO_PATH = path.join(__dirname, '..', 'logo.png');

const NEGRO = '#0d0d0d';
const DORADO = '#B98611';
const GRIS = '#414141';
const GRIS_CLARO = '#f2f2f2';
const BLANCO = '#ffffff';

function generarPDFBuffer(dibujarContenido) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    dibujarContenido(doc);
    doc.end();
  });
}

function encabezado(doc, titulo, numero, fecha) {
  const ancho = doc.page.width;
  const altoBanda = 100;

  doc.rect(0, 0, ancho, altoBanda).fill(NEGRO);

  try {
    doc.image(LOGO_PATH, 30, 12, { height: 76 });
  } catch (e) {
    // si no encuentra el logo, seguimos sin romper el PDF
  }

  const logoAncho = 76 * (680 / 642);
  const tx = 30 + logoAncho + 15;

  doc.fillColor(BLANCO).fontSize(15).font('Helvetica-Bold').text(MARCA, tx, 14);
  doc.fillColor(DORADO).fontSize(8).font('Helvetica-Bold').text('TÉCNICO MATRICULADO', tx, 32);

  let infoY = 44;
  doc.fillColor('#cccccc').fontSize(7.3).font('Helvetica');
  if (TITULAR) {
    doc.text(TITULAR, tx, infoY);
    infoY += 10;
  }
  if (DIRECCION) {
    doc.text(DIRECCION, tx, infoY);
    infoY += 10;
  }
  const linea3 = [CUIT ? `CUIT: ${CUIT}` : null, TELEFONO ? `Cel: ${TELEFONO}` : null].filter(Boolean).join('   ·   ');
  if (linea3) {
    doc.text(linea3, tx, infoY);
    infoY += 10;
  }
  const linea4 = [EMAIL, SITIO_WEB].filter(Boolean).join('   ·   ');
  if (linea4) {
    doc.text(linea4, tx, infoY);
  }

  doc.fillColor(DORADO).fontSize(19).font('Helvetica-Bold').text(titulo.toUpperCase(), 0, 14, { align: 'right', width: ancho - 30 });
  doc.fillColor(BLANCO).fontSize(9).font('Helvetica').text(`N° ${numero}`, 0, 38, { align: 'right', width: ancho - 30 });
  doc.text(`Fecha: ${fecha}`, 0, 50, { align: 'right', width: ancho - 30 });
  doc.fillColor('#cccccc').fontSize(7.5).font('Helvetica-Oblique').text('Validez: 15 días corridos', 0, 62, { align: 'right', width: ancho - 30 });

  doc.rect(0, altoBanda - 2, ancho, 2).fill(DORADO);

  return altoBanda + 20;
}

function datosCliente(doc, y, cliente) {
  const ancho = doc.page.width;
  doc.rect(30, y, ancho - 60, 50).fill(GRIS_CLARO);
  doc.fillColor(NEGRO).fontSize(9).font('Helvetica-Bold').text('CLIENTE', 38, y + 8);
  doc.fontSize(10).font('Helvetica').text(cliente.nombre || '', 38, y + 20);
  const linea = [cliente.direccion, cliente.telefono].filter(Boolean).join('   ·   ');
  doc.fillColor(GRIS).fontSize(8.3).text(linea, 38, y + 34);
  return y + 66;
}

function tablaItems(doc, y, items) {
  const ancho = doc.page.width;
  const x0 = 30;
  const x1 = ancho - 30;
  const filaH = 24;

  doc.rect(x0, y, x1 - x0, filaH).fill(DORADO);
  doc.fillColor(BLANCO).fontSize(8).font('Helvetica-Bold');
  doc.text('DESCRIPCIÓN', x0 + 8, y + 8, { width: (x1 - x0) * 0.6 });
  doc.text('MONTO', x0, y + 8, { width: x1 - x0 - 8, align: 'right' });
  y += filaH;

  let total = 0;
  items.forEach((item, i) => {
    const bg = i % 2 === 0 ? GRIS_CLARO : BLANCO;
    const alto = Math.max(filaH, 14 * Math.ceil(item.descripcion.length / 60) + 10);
    doc.rect(x0, y, x1 - x0, alto).fill(bg);
    doc.fillColor(NEGRO).fontSize(9).font('Helvetica').text(item.descripcion, x0 + 8, y + 7, { width: (x1 - x0) * 0.62 });
    doc.font('Helvetica').text(`$ ${Number(item.monto).toLocaleString('es-AR')}`, x0, y + 7, { width: x1 - x0 - 8, align: 'right' });
    total += Number(item.monto);
    y += alto;
  });

  doc.rect(x0, y, x1 - x0, 1).fill(DORADO);
  return { y: y + 4, total };
}

function totalFinal(doc, y, total, etiqueta = 'TOTAL') {
  const ancho = doc.page.width;
  const x1 = ancho - 30;
  const anchoCaja = 190;
  const altoCaja = 32;
  doc.rect(x1 - anchoCaja, y + 8, anchoCaja, altoCaja).fill(NEGRO);
  doc.fillColor(DORADO).fontSize(9.5).font('Helvetica-Bold').text(etiqueta, x1 - anchoCaja + 10, y + 20);
  doc.fillColor(BLANCO).fontSize(13).text(`$ ${Number(total).toLocaleString('es-AR')}`, x1 - anchoCaja, y + 18, { width: anchoCaja - 10, align: 'right' });
  return y + 8 + altoCaja + 10;
}

function bloqueTexto(doc, y, titulo, parrafo) {
  const ancho = doc.page.width;
  doc.fillColor(DORADO).fontSize(8.5).font('Helvetica-Bold').text(titulo, 30, y, { width: ancho - 60 });
  y = doc.y + 2;
  doc.fillColor(GRIS).fontSize(8).font('Helvetica').text(parrafo, 30, y, { width: ancho - 60 });
  return doc.y + 8;
}

function piePagina(doc) {
  const ancho = doc.page.width;
  const alto = doc.page.height;
  doc.rect(30, alto - 40, ancho - 60, 1).fill(DORADO);
  const partes = [MARCA, TITULAR, CUIT ? `CUIT ${CUIT}` : null, TELEFONO ? `Cel ${TELEFONO}` : null].filter(Boolean).join('  ·  ');
  doc.fillColor('#999999').fontSize(7.3).font('Helvetica').text(partes, 30, alto - 33, { width: ancho - 60, align: 'center' });
  const redes = [SITIO_WEB, FACEBOOK, INSTAGRAM].filter(Boolean).join('  ·  ');
  if (redes) {
    doc.fillColor('#999999').fontSize(7).text(redes, 30, alto - 22, { width: ancho - 60, align: 'center' });
  }
}

const TEXTO_ALCANCE_DEFECTO =
  'Este presupuesto cubre exclusivamente las tareas detalladas. Todo trabajo, reparación, repuesto o material adicional solicitado fuera de este documento será cotizado y cobrado por separado, previa autorización del cliente.';
const TEXTO_GARANTIA_DEFECTO =
  'De acuerdo con la Ley N° 24.240 de Defensa del Consumidor, la mano de obra cuenta con una garantía de 90 días corridos desde la finalización del servicio, cubriendo defectos derivados de la ejecución del trabajo aquí detallado.';
const TEXTO_FORMA_PAGO_DEFECTO = 'Se requiere un anticipo del 50% del total para iniciar los trabajos. El 50% restante se abona al finalizar el servicio.';

async function generarPresupuesto({
  cliente,
  descripcion,
  monto,
  numero = '0001',
  direccionTrabajo,
  alcance,
  incluirAlcance = true,
  garantia,
  incluirGarantia = true,
  formaPago,
  incluirFormaPago = true,
}) {
  return generarPDFBuffer((doc) => {
    let y = encabezado(doc, 'Presupuesto', numero, new Date().toLocaleDateString('es-AR'));
    const clienteMostrado = direccionTrabajo ? { ...cliente, direccion: direccionTrabajo } : cliente;
    y = datosCliente(doc, y, clienteMostrado);
    const { y: y2, total } = tablaItems(doc, y, [{ descripcion, monto }]);
    y = totalFinal(doc, y2, total);
    if (incluirAlcance) {
      y = bloqueTexto(doc, y, 'ALCANCE Y EXCLUSIONES', alcance || TEXTO_ALCANCE_DEFECTO);
    }
    if (incluirGarantia) {
      y = bloqueTexto(doc, y, 'GARANTÍA DEL SERVICIO', garantia || TEXTO_GARANTIA_DEFECTO);
    }
    if (incluirFormaPago) {
      bloqueTexto(doc, y, 'FORMA DE PAGO', formaPago || TEXTO_FORMA_PAGO_DEFECTO);
    }
    piePagina(doc);
  });
}

async function generarRecibo({ cliente, monto, concepto, numero = '0001' }) {
  return generarPDFBuffer((doc) => {
    let y = encabezado(doc, 'Recibo de Pago', numero, new Date().toLocaleDateString('es-AR'));
    y = datosCliente(doc, y, cliente);
    const { y: y2, total } = tablaItems(doc, y, [{ descripcion: concepto, monto }]);
    totalFinal(doc, y2, total, 'RECIBIDO');
    piePagina(doc);
  });
}

async function generarDocumentoLibre({ titulo, contenido }) {
  return generarPDFBuffer((doc) => {
    let y = encabezado(doc, titulo || 'Documento', '—', new Date().toLocaleDateString('es-AR'));
    const ancho = doc.page.width;
    doc.fillColor(NEGRO).fontSize(10).font('Helvetica').text(contenido, 30, y + 10, { width: ancho - 60, align: 'left' });
    piePagina(doc);
  });
}

module.exports = { generarRecibo, generarPresupuesto, generarDocumentoLibre };
