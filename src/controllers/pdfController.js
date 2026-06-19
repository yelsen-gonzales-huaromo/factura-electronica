/**
 * Generador de PDF para facturas electrónicas con QR
 * Usa pdfkit + qrcode
 */
const PDFDocument = require('pdfkit');
const QRCode     = require('qrcode');
const { pool }   = require('../config/db');

/* ── Colores y textos por país ───────────────────────────────── */
const PAIS_COLOR = {
  MX: [22, 163, 74],
  CO: [37, 99, 235],
  PE: [220, 38, 38],
  CL: [8, 145, 178],
  EC: [202, 138, 4],
};

const AUTHORITY_LABEL = {
  MX: 'SAT - Servicio de Administración Tributaria',
  CO: 'DIAN - Dirección de Impuestos y Aduanas Nacionales',
  PE: 'SUNAT - Superintendencia Nacional de Aduanas y de Administración Tributaria',
  CL: 'SII - Servicio de Impuestos Internos',
  EC: 'SRI - Servicio de Rentas Internas',
};

/* URL de verificación simulada por país */
const VERIFY_URL = {
  MX: (f) => `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${f.uuid}&re=${f.empresa_id_fiscal}&rr=${f.cliente_identificacion}&tt=${Number(f.total).toFixed(6)}&fe=${(f.uuid || '').slice(-8)}`,
  CO: (f) => `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${f.uuid}`,
  PE: (f) => `https://www.sunat.gob.pe/ol-ti-itconsultacpe/ui/main.html?ruc=${f.empresa_id_fiscal}&tipo=01&serie=${f.serie}&numero=${f.folio}`,
  CL: (f) => `https://maullin.sii.cl/cgi_dte/UF_Vale.cgi?CSRUT=${f.empresa_id_fiscal}&TIPODOC=33&FOLIO=${f.folio}&MNTOTAL=${Math.round(f.total)}&FCHEMIS=${(f.fecha_emision||'').slice(0,10)}`,
  EC: (f) => `https://cel.sri.gob.ec/comprobantes-electronicos-internet/main/autorizacion/initial/${f.uuid}`,
};

/* ── Helpers ─────────────────────────────────────────────────── */
function fmtMoney(amount, simbolo) {
  return `${simbolo || '$'} ${Number(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}
function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
}

/* ── Generador QR → Buffer PNG ───────────────────────────────── */
async function buildQR(text, color) {
  const hex = `#${color.map(c => c.toString(16).padStart(2,'0')).join('')}`;
  return QRCode.toBuffer(text, {
    type: 'png',
    width: 140,
    margin: 1,
    color: { dark: hex, light: '#ffffff' }
  });
}

/* ── Controlador principal ───────────────────────────────────── */
exports.generarPDF = async (req, res) => {
  try {
    const { id } = req.params;

    const [facRows] = await pool.query(
      `SELECT f.*, c.razon_social AS cliente_nombre, c.identificacion AS cliente_identificacion,
              c.email AS cliente_email, c.direccion AS cliente_direccion, c.ciudad AS cliente_ciudad,
              c.tipo_identificacion AS cliente_tipo_id,
              e.razon_social AS empresa_nombre, e.identificacion_fiscal AS empresa_id_fiscal,
              e.direccion AS empresa_direccion, e.ciudad AS empresa_ciudad,
              e.email AS empresa_email, e.telefono AS empresa_telefono,
              p.nombre AS pais, p.codigo AS pais_codigo, p.autoridad_fiscal,
              p.moneda_codigo, p.moneda_simbolo
         FROM facturas f
         JOIN clientes c ON c.id = f.cliente_id
         JOIN empresas e ON e.id = f.empresa_id
         JOIN paises p ON p.id = f.pais_id
        WHERE f.id = ?`, [id]);

    if (!facRows.length)
      return res.status(404).json({ success: false, message: 'Factura no encontrada' });
    const f = facRows[0];

    const [items] = await pool.query(
      'SELECT * FROM factura_items WHERE factura_id = ? ORDER BY id', [id]);

    // Verificar permisos
    if (req.user.rol !== 'admin') {
      const [check] = await pool.query(
        'SELECT 1 FROM usuario_empresa WHERE usuario_id=? AND empresa_id=?',
        [req.user.id, f.empresa_id]);
      if (!check.length)
        return res.status(403).json({ success: false, message: 'Sin permiso' });
    }

    const simbolo    = f.moneda_simbolo || '$';
    const paisCodigo = f.pais_codigo || 'MX';
    const color      = PAIS_COLOR[paisCodigo] || [37, 99, 235];
    const auth       = AUTHORITY_LABEL[paisCodigo] || f.autoridad_fiscal || '';

    /* ── Construir texto QR ──────────────────────────────────── */
    let qrText;
    const verifyFn = VERIFY_URL[paisCodigo];
    if (f.uuid && verifyFn) {
      qrText = verifyFn(f);                           // URL de verificación oficial
    } else {
      // Fallback: datos clave de la factura en formato estándar
      qrText = [
        `EMISOR:${f.empresa_id_fiscal}`,
        `RECEPTOR:${f.cliente_identificacion}`,
        `FOLIO:${f.serie}-${f.folio}`,
        `FECHA:${(f.fecha_emision || '').slice(0, 10)}`,
        `TOTAL:${Number(f.total).toFixed(2)}`,
        `PAIS:${paisCodigo}`,
        f.uuid ? `UUID:${f.uuid}` : null,
      ].filter(Boolean).join('|');
    }

    const qrBuffer = await buildQR(qrText, color);

    /* ── Crear documento PDF ─────────────────────────────────── */
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: 50, left: 50, right: 50 }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="factura-${f.serie}-${f.folio}.pdf"`);
    doc.pipe(res);

    const W = 495;   // ancho útil (595 - 100)
    const L = 50;    // margen izquierdo

    /* ── Barra superior ─────────────────────────────────────── */
    doc.rect(0, 0, 595, 8).fill(color);

    /* ── Nombre empresa ─────────────────────────────────────── */
    doc.fontSize(17).font('Helvetica-Bold').fillColor(color)
       .text(f.empresa_nombre, L, 26);
    doc.fontSize(9).font('Helvetica').fillColor('#64748b')
       .text(f.empresa_id_fiscal, L, 48)
       .text([f.empresa_direccion, f.empresa_ciudad].filter(Boolean).join(' · '), L, 60);

    /* ── Caja folio (derecha) ───────────────────────────────── */
    const boxX = 370, boxY = 22;
    doc.rect(boxX, boxY, 175, 82).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.fontSize(10).font('Helvetica-Bold').fillColor(color)
       .text('FACTURA ELECTRÓNICA', boxX + 10, boxY + 10, { width: 155, align: 'center' });
    doc.fontSize(19).font('Helvetica-Bold').fillColor('#1e293b')
       .text(`${f.serie}-${f.folio}`, boxX + 10, boxY + 27, { width: 155, align: 'center' });
    const estadoColor = f.estado === 'emitida' || f.estado === 'timbrada'
      ? [22, 163, 74] : f.estado === 'cancelada' ? [220, 38, 38] : [100, 116, 139];
    doc.fontSize(9).font('Helvetica-Bold').fillColor(estadoColor)
       .text(f.estado.toUpperCase(), boxX + 10, boxY + 54, { width: 155, align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor('#64748b')
       .text(`Fecha: ${fmtDate(f.fecha_emision)}`, boxX + 10, boxY + 68, { width: 155, align: 'center' });

    /* ── Autoridad fiscal ───────────────────────────────────── */
    doc.rect(L, 112, W, 18).fill('#f1f5f9');
    doc.fontSize(8).font('Helvetica').fillColor('#475569')
       .text(auth, L + 8, 118, { width: W - 16 });

    /* ── Emisor / Receptor ──────────────────────────────────── */
    let y = 140;
    const colW = (W - 12) / 2;

    // Emisor
    doc.rect(L, y, colW, 72).fillAndStroke('white', '#e2e8f0');
    doc.rect(L, y, colW, 16).fill(color);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('white').text('EMISOR', L + 8, y + 4);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e293b')
       .text(f.empresa_nombre, L + 8, y + 22, { width: colW - 16 });
    doc.fontSize(8).font('Helvetica').fillColor('#475569')
       .text(f.empresa_id_fiscal, L + 8, y + 37, { width: colW - 16 })
       .text([f.empresa_ciudad, f.empresa_email].filter(Boolean).join(' · '), L + 8, y + 49, { width: colW - 16 });

    // Receptor
    const rxX = L + colW + 12;
    doc.rect(rxX, y, colW, 72).fillAndStroke('white', '#e2e8f0');
    doc.rect(rxX, y, colW, 16).fill(color);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('white').text('RECEPTOR', rxX + 8, y + 4);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e293b')
       .text(f.cliente_nombre, rxX + 8, y + 22, { width: colW - 16 });
    doc.fontSize(8).font('Helvetica').fillColor('#475569')
       .text(`${f.cliente_tipo_id || 'ID'}: ${f.cliente_identificacion}`, rxX + 8, y + 37, { width: colW - 16 })
       .text([f.cliente_direccion, f.cliente_ciudad].filter(Boolean).join(' · ') || '', rxX + 8, y + 49, { width: colW - 16 });

    /* ── Tabla de conceptos ─────────────────────────────────── */
    y = 224;
    doc.rect(L, y, W, 18).fill(color);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('white');
    const cols = { desc: L + 6, cant: L + 260, pu: L + 320, iva: L + 390, total: L + 440 };
    doc.text('DESCRIPCIÓN', cols.desc, y + 5);
    doc.text('CANT.',    cols.cant,  y + 5, { width: 55, align: 'right' });
    doc.text('PRECIO U.', cols.pu,   y + 5, { width: 65, align: 'right' });
    doc.text('IVA',      cols.iva,   y + 5, { width: 45, align: 'right' });
    doc.text('TOTAL',    cols.total, y + 5, { width: 55, align: 'right' });

    y += 18;
    let rowBg = false;
    items.forEach(item => {
      const rH = 22;
      if (rowBg) doc.rect(L, y, W, rH).fill('#f8fafc');
      doc.rect(L, y, W, rH).stroke('#e2e8f0');
      rowBg = !rowBg;
      doc.fontSize(8).font('Helvetica').fillColor('#1e293b')
         .text(item.descripcion || '', cols.desc, y + 7, { width: 248, lineBreak: false });
      doc.text(Number(item.cantidad).toFixed(2), cols.cant, y + 7, { width: 55, align: 'right' });
      doc.text(fmtMoney(item.precio_unitario, simbolo), cols.pu,    y + 7, { width: 65, align: 'right' });
      doc.text(fmtMoney(item.iva_monto, simbolo),       cols.iva,   y + 7, { width: 45, align: 'right' });
      doc.font('Helvetica-Bold')
         .text(fmtMoney(item.total, simbolo), cols.total, y + 7, { width: 55, align: 'right' });
      y += rH;
    });

    /* ── Zona QR + Totales ──────────────────────────────────── */
    y += 10;

    // --- QR (izquierda) ---
    const qrX = L, qrY = y;
    const qrSize = 120;

    // Marco QR
    doc.rect(qrX, qrY, qrSize + 16, qrSize + 36).fillAndStroke('#fafafa', '#e2e8f0');
    doc.image(qrBuffer, qrX + 8, qrY + 8, { width: qrSize, height: qrSize });

    // Etiqueta bajo el QR
    doc.fontSize(7).font('Helvetica-Bold').fillColor(color)
       .text('VERIFICAR DOCUMENTO', qrX + 8, qrY + qrSize + 12, { width: qrSize, align: 'center' });

    // URL corta bajo el QR (si es URL la mostramos truncada)
    const qrLabel = qrText.startsWith('http')
      ? qrText.replace('https://', '').split('/')[0]
      : `${paisCodigo} · ${(f.uuid || '').slice(0, 16)}${f.uuid ? '…' : ''}`;
    doc.fontSize(6).font('Helvetica').fillColor('#94a3b8')
       .text(qrLabel, qrX + 4, qrY + qrSize + 22, { width: qrSize + 8, align: 'center' });

    // --- Totales (derecha) ---
    const totX = L + W - 210;
    const totW = 210;
    let ty = y;

    const drawRow = (label, value, bold, bg) => {
      if (bg) doc.rect(totX, ty, totW, 20).fill(bg);
      doc.fontSize(9)
         .font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .fillColor(bold && bg ? 'white' : '#1e293b')
         .text(label, totX + 8, ty + 5, { width: 115 })
         .text(value, totX + 8, ty + 5, { width: totW - 16, align: 'right' });
      ty += 20;
    };

    doc.rect(totX, ty, totW, 60 + (Number(f.descuento) > 0 ? 20 : 0)).stroke('#e2e8f0');
    drawRow('Subtotal:', fmtMoney(f.subtotal, simbolo), false, null);
    if (Number(f.descuento) > 0)
      drawRow('Descuento:', `-${fmtMoney(f.descuento, simbolo)}`, false, null);
    drawRow('IVA:', fmtMoney(f.total_iva, simbolo), false, null);
    drawRow('TOTAL:', fmtMoney(f.total, simbolo), true, color);

    /* ── UUID / CUFE ────────────────────────────────────────── */
    y = Math.max(qrY + qrSize + 40, ty) + 14;

    if (f.uuid) {
      doc.rect(L, y, W, 30).fill('#f0f9ff').stroke('#bae6fd');
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#0369a1')
         .text('UUID / CUFE / CLAVE DE ACCESO:', L + 8, y + 6);
      doc.fontSize(7).font('Helvetica').fillColor('#0c4a6e')
         .text(f.uuid, L + 8, y + 17, { width: W - 16 });
      y += 30;
    }

    /* ── Forma de pago ──────────────────────────────────────── */
    y += 10;
    const pagoMap   = { '01':'Efectivo','02':'Cheque','03':'Transferencia','04':'Tarjeta crédito','28':'Tarjeta débito','99':'Por definir' };
    const metodoMap = { PUE: 'PUE - Una sola exhibición', PPD: 'PPD - Parcialidades' };
    doc.fontSize(8).font('Helvetica').fillColor('#64748b')
       .text(
         `Forma de pago: ${pagoMap[f.forma_pago] || f.forma_pago || '-'}   |   Método: ${metodoMap[f.metodo_pago] || f.metodo_pago || '-'}   |   Tipo: ${f.tipo_documento || 'factura'}   |   Moneda: ${f.moneda_codigo || ''}`,
         L, y, { width: W }
       );

    /* ── Footer ─────────────────────────────────────────────── */
    const footerY = 770;
    doc.rect(0, footerY, 595, 1).fill('#e2e8f0');
    doc.fontSize(7).font('Helvetica').fillColor('#94a3b8')
       .text(
         'Este documento es una representación impresa de un Comprobante Fiscal Digital Electrónico.',
         L, footerY + 6, { width: W, align: 'center' }
       )
       .text(
         `${auth} · Generado por FactuElectrónica Multi-País`,
         L, footerY + 16, { width: W, align: 'center' }
       );

    doc.rect(0, 787, 595, 8).fill(color);

    doc.end();
  } catch (err) {
    if (!res.headersSent)
      res.status(500).json({ success: false, message: err.message });
  }
};
