/**
 * Módulo Chile - SII (Documento Tributario Electrónico - DTE)
 */
const { create } = require('xmlbuilder2');
const crypto = require('crypto');

function getMetadata() {
  return {
    pais: 'Chile',
    codigo: 'CL',
    autoridad: 'SII',
    formato: 'DTE',
    moneda: 'CLP',
    iva_general: 19,
    documentos: ['factura', 'boleta', 'nota_credito', 'nota_debito']
  };
}

function generarUUID(factura, empresa) {
  const data = `${empresa?.identificacion_fiscal || ''}-${factura.folio}-${factura.fecha_emision}`;
  return crypto.createHash('sha1').update(data).digest('hex').toUpperCase();
}

function fmtFecha(d) { return new Date(d).toISOString().slice(0, 10); }

function generarXML({ empresa, cliente, factura, items }) {
  // Tipo DTE: 33 factura electrónica, 39 boleta, 61 nota crédito, 56 nota débito
  const tipoDTE = factura.tipo_documento === 'boleta' ? 39
                : factura.tipo_documento === 'nota_credito' ? 61
                : factura.tipo_documento === 'nota_debito' ? 56
                : 33;

  const doc = create({ version: '1.0', encoding: 'ISO-8859-1' })
    .ele('DTE', { version: '1.0', xmlns: 'http://www.sii.cl/SiiDte' });

  const documento = doc.ele('Documento', { ID: `F${factura.folio}T${tipoDTE}` });

  const enc = documento.ele('Encabezado');
  const idDoc = enc.ele('IdDoc');
  idDoc.ele('TipoDTE').txt(String(tipoDTE));
  idDoc.ele('Folio').txt(String(factura.folio));
  idDoc.ele('FchEmis').txt(fmtFecha(factura.fecha_emision));
  idDoc.ele('FmaPago').txt(factura.forma_pago === '01' ? '1' : '2');

  const emisor = enc.ele('Emisor');
  emisor.ele('RUTEmisor').txt(empresa.identificacion_fiscal);
  emisor.ele('RznSoc').txt(empresa.razon_social);
  emisor.ele('GiroEmis').txt(empresa.regimen_fiscal || 'Servicios');
  if (empresa.direccion) emisor.ele('DirOrigen').txt(empresa.direccion);
  if (empresa.ciudad)    emisor.ele('CmnaOrigen').txt(empresa.ciudad);

  const receptor = enc.ele('Receptor');
  receptor.ele('RUTRecep').txt(cliente.identificacion);
  receptor.ele('RznSocRecep').txt(cliente.razon_social);
  if (cliente.direccion) receptor.ele('DirRecep').txt(cliente.direccion);
  if (cliente.ciudad)    receptor.ele('CmnaRecep').txt(cliente.ciudad);

  const totales = enc.ele('Totales');
  totales.ele('MntNeto').txt(Math.round(factura.subtotal));
  totales.ele('TasaIVA').txt('19');
  totales.ele('IVA').txt(Math.round(factura.total_iva));
  totales.ele('MntTotal').txt(Math.round(factura.total));

  // Detalle
  items.forEach((it, idx) => {
    const det = documento.ele('Detalle');
    det.ele('NroLinDet').txt(String(idx + 1));
    det.ele('NmbItem').txt(it.descripcion);
    det.ele('QtyItem').txt(Number(it.cantidad).toFixed(0));
    det.ele('UnmdItem').txt(it.unidad_medida || 'UN');
    det.ele('PrcItem').txt(Number(it.precio_unitario).toFixed(0));
    det.ele('MontoItem').txt(Math.round(Number(it.importe)));
  });

  return doc.end({ prettyPrint: true });
}

/**
 * Modo PRODUCCIÓN: firma DTE con RSA-SHA1 y envía al SII
 * @param {object} params      { empresa, cliente, factura, items }
 * @param {object} certConfig  { certPem, keyPem } o { p12Path, password }
 * @returns {object}           { trackId, estado, glosa, aceptado, xmlFirmado }
 */
async function emitirProduccion(params, certConfig) {
  const certMgr = require('./signing/certificateManager');
  const { signXmlChile } = require('./signing/xmlSigner');
  const { emitirChile } = require('./submission/siiChile');

  // Resolver certificado
  let certPem = certConfig.certPem;
  let keyPem  = certConfig.keyPem;
  if (!certPem && certConfig.p12Path) {
    const p12 = certMgr.loadP12(certConfig.p12Path, certConfig.password);
    certPem = p12.certPem;
    keyPem  = p12.keyPem;
  }

  const { empresa } = params;
  const ambiente = empresa.ambiente === 'produccion' ? 'produccion' : 'certificacion';

  // Generar XML DTE
  const xmlBase = generarXML(params);

  // Firmar con RSA-SHA1 (requerido por SII)
  const xmlFirmado = signXmlChile(xmlBase, certPem, keyPem);

  // Enviar al SII
  const resultado = await emitirChile(
    xmlFirmado,
    empresa,
    { certPem, keyPem },
    ambiente
  );

  return {
    uuid:      resultado.trackId,
    trackId:   resultado.trackId,
    estado:    resultado.estado,
    glosa:     resultado.glosa,
    aceptado:  resultado.aceptado,
    xmlFirmado,
  };
}

module.exports = { getMetadata, generarUUID, generarXML, emitirProduccion };
