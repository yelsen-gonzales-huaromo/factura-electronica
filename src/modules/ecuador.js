/**
 * Módulo Ecuador - SRI (XML según ficha técnica del SRI)
 */
const { create } = require('xmlbuilder2');

function getMetadata() {
  return {
    pais: 'Ecuador',
    codigo: 'EC',
    autoridad: 'SRI',
    formato: 'XML SRI',
    moneda: 'USD',
    iva_general: 12,
    documentos: ['factura', 'nota_credito', 'nota_debito']
  };
}

// Clave de acceso del SRI: 49 dígitos
function generarUUID(factura, empresa) {
  const fecha = new Date(factura.fecha_emision);
  const ddmmaaaa = `${String(fecha.getDate()).padStart(2,'0')}${String(fecha.getMonth()+1).padStart(2,'0')}${fecha.getFullYear()}`;
  const tipoComp = '01';
  const ruc = (empresa?.identificacion_fiscal || '').padStart(13, '0').slice(0, 13);
  const ambiente = '1';
  const serie = (factura.serie || '001-001').replace(/-/g, '').padStart(6, '0');
  const numero = String(factura.folio).padStart(9, '0');
  const codNum = '12345678';
  const tipoEmis = '1';
  const base = `${ddmmaaaa}${tipoComp}${ruc}${ambiente}${serie}${numero}${codNum}${tipoEmis}`;
  // Dígito verificador (módulo 11) - sólo dígitos
  const baseDigits = base.replace(/\D/g, '');
  let suma = 0; let factor = 2;
  for (let i = baseDigits.length - 1; i >= 0; i--) {
    suma += parseInt(baseDigits[i], 10) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0; if (dv === 10) dv = 1;
  return base + dv;
}

function fmtFecha(d) {
  const f = new Date(d);
  return `${String(f.getDate()).padStart(2,'0')}/${String(f.getMonth()+1).padStart(2,'0')}/${f.getFullYear()}`;
}

function generarXML({ empresa, cliente, factura, items }) {
  const claveAcceso = generarUUID(factura, empresa);
  const serieParts = (factura.serie || '001-001').split('-');
  const estab = serieParts[0] || '001';
  const ptoEmi = serieParts[1] || '001';

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('factura', { id: 'comprobante', version: '1.1.0' });

  const info = doc.ele('infoTributaria');
  info.ele('ambiente').txt(empresa.ambiente === 'produccion' ? '2' : '1');
  info.ele('tipoEmision').txt('1');
  info.ele('razonSocial').txt(empresa.razon_social);
  info.ele('nombreComercial').txt(empresa.nombre_comercial || empresa.razon_social);
  info.ele('ruc').txt(empresa.identificacion_fiscal);
  info.ele('claveAcceso').txt(claveAcceso);
  info.ele('codDoc').txt('01');
  info.ele('estab').txt(estab);
  info.ele('ptoEmi').txt(ptoEmi);
  info.ele('secuencial').txt(String(factura.folio).padStart(9, '0'));
  info.ele('dirMatriz').txt(empresa.direccion || 'N/A');

  const infoFactura = doc.ele('infoFactura');
  infoFactura.ele('fechaEmision').txt(fmtFecha(factura.fecha_emision));
  infoFactura.ele('dirEstablecimiento').txt(empresa.direccion || 'N/A');
  infoFactura.ele('obligadoContabilidad').txt('SI');
  infoFactura.ele('tipoIdentificacionComprador').txt(cliente.tipo_identificacion === 'RUC' ? '04' : '05');
  infoFactura.ele('razonSocialComprador').txt(cliente.razon_social);
  infoFactura.ele('identificacionComprador').txt(cliente.identificacion);
  infoFactura.ele('totalSinImpuestos').txt(factura.subtotal.toFixed(2));
  infoFactura.ele('totalDescuento').txt((factura.descuento || 0).toFixed(2));

  const totalConImpuestos = infoFactura.ele('totalConImpuestos');
  if (factura.total_iva > 0) {
    const ti = totalConImpuestos.ele('totalImpuesto');
    ti.ele('codigo').txt('2');
    ti.ele('codigoPorcentaje').txt('2');
    ti.ele('baseImponible').txt(factura.subtotal.toFixed(2));
    ti.ele('valor').txt(factura.total_iva.toFixed(2));
  }
  infoFactura.ele('propina').txt('0.00');
  infoFactura.ele('importeTotal').txt(factura.total.toFixed(2));
  infoFactura.ele('moneda').txt('DOLAR');

  const detalles = doc.ele('detalles');
  items.forEach(it => {
    const det = detalles.ele('detalle');
    det.ele('codigoPrincipal').txt(it.codigo || '');
    det.ele('descripcion').txt(it.descripcion);
    det.ele('cantidad').txt(Number(it.cantidad).toFixed(2));
    det.ele('precioUnitario').txt(Number(it.precio_unitario).toFixed(2));
    det.ele('descuento').txt(Number(it.descuento || 0).toFixed(2));
    det.ele('precioTotalSinImpuesto').txt(Number(it.importe).toFixed(2));
    if (it.iva_monto > 0) {
      const imp = det.ele('impuestos').ele('impuesto');
      imp.ele('codigo').txt('2');
      imp.ele('codigoPorcentaje').txt('2');
      imp.ele('tarifa').txt(Number(it.iva_porcentaje).toFixed(2));
      imp.ele('baseImponible').txt(Number(it.importe).toFixed(2));
      imp.ele('valor').txt(Number(it.iva_monto).toFixed(2));
    }
  });

  return doc.end({ prettyPrint: true });
}

/**
 * Modo PRODUCCIÓN: firma con XAdES-BES y envía al SRI
 * @param {object} params      { empresa, cliente, factura, items }
 * @param {object} certConfig  { certPem, keyPem } o { p12Path, password }
 * @returns {object}           { claveAcceso, numeroAutorizacion, fechaAutorizacion, xmlAutorizado, xmlFirmado }
 */
async function emitirProduccion(params, certConfig) {
  const certMgr = require('./signing/certificateManager');
  const { emitirEcuador } = require('./submission/sriEcuador');

  // Resolver certificado
  let certPem = certConfig.certPem;
  let keyPem  = certConfig.keyPem;
  if (!certPem && certConfig.p12Path) {
    const p12 = certMgr.loadP12(certConfig.p12Path, certConfig.password);
    certPem = p12.certPem;
    keyPem  = p12.keyPem;
  }

  const { empresa, factura } = params;
  const ambiente = empresa.ambiente === 'produccion' ? 'produccion' : 'pruebas';
  const claveAcceso = generarUUID(factura, empresa);

  // Generar XML (ya usa ambiente real desde empresa.ambiente)
  const xmlBase = generarXML(params);

  // Firmar y enviar al SRI
  const resultado = await emitirEcuador(xmlBase, { certPem, keyPem }, claveAcceso, ambiente);

  return {
    uuid:               resultado.claveAcceso,
    claveAcceso:        resultado.claveAcceso,
    numeroAutorizacion: resultado.numeroAutorizacion,
    fechaAutorizacion:  resultado.fechaAutorizacion,
    xmlFirmado:         resultado.xmlFirmado,
    xmlAutorizado:      resultado.xmlAutorizado,
    estado:             resultado.estado,
  };
}

module.exports = { getMetadata, generarUUID, generarXML, emitirProduccion };
