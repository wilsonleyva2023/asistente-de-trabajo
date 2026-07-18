const PDFDocument = require('pdfkit');

const NOMBRE_NEGOCIO = process.env.NOMBRE_NEGOCIO || 'Mi Negocio';

function generarPDFBuffer(dibujarContenido) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    dibujarContenido(doc);
    doc.end();
  });
}

function encabezado(doc, titulo) {
  doc.fontSize(20).text(NOMBRE_NEGOCIO, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(14).fillColor('#555').text(titulo, { align: 'center' });
  doc.fillColor('#000');
  doc.moveDown(1.5);
}

async function generarRecibo({ cliente, monto, concepto, fecha }) {
  return generarPDFBuffer((doc) => {
    encabezado(doc, 'Recibo de Pago');
    doc.fontSize(11);
    doc.text(`Fecha: ${fecha || new Date().toLocaleDateString('es-AR')}`);
    doc.text(`Cliente: ${cliente.nombre}`);
    if (cliente.direccion) doc.text(`Dirección: ${cliente.direccion}`);
    doc.moveDown();
    doc.text(`Concepto: ${concepto}`);
    doc.moveDown();
    doc.fontSize(16).text(`Monto recibido: $${monto}`, { align: 'right' });
    doc.moveDown(2);
    doc.fontSize(10).fillColor('#777').text('Gracias por su confianza.', { align: 'center' });
  });
}

async function generarPresupuesto({ cliente, descripcion, monto, validezDias = 15 }) {
  return generarPDFBuffer((doc) => {
    encabezado(doc, 'Presupuesto');
    doc.fontSize(11);
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-AR')}`);
    doc.text(`Cliente: ${cliente.nombre}`);
    if (cliente.direccion) doc.text(`Dirección: ${cliente.direccion}`);
    doc.moveDown();
    doc.text('Descripción del trabajo:');
    doc.fontSize(12).text(descripcion, { indent: 20 });
    doc.moveDown();
    doc.fontSize(16).text(`Total: $${monto}`, { align: 'right' });
    doc.moveDown();
    doc.fontSize(10).fillColor('#777').text(`Presupuesto válido por ${validezDias} días.`, { align: 'center' });
  });
}

module.exports = { generarRecibo, generarPresupuesto };
