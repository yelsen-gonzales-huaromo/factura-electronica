/**
 * Módulo Perú - SUNAT UBL 2.1
 */
const { create } = require('xmlbuilder2');
const crypto = require('crypto');

function getMetadata() {
  return {
    pais: 'Perú',
    codigo: 'PE',
    autoridad: 'SUNAT',
    formato: 'UBL 2.1',
    moneda: 'PEN',
    iva_general: 18,
    documentos: ['factura', 'boleta', 'nota_credito', 'nota_debito']
  };
}

function generarUUID(factura, empresa) {
  const data = `${empresa?.identificacion_fiscal || ''}${factura.serie}${factura.folio}${factura.fecha_emision}${factura.total}`;
  return crypto.createHash('sha256').update(data).digest('hex').toUpperCase().substring(0, 40);
}

function fmtFecha(d) { return new Date(d).toISOString().slice(0, 10); }
function fmtHora(d) { return new Date(d).toISOString().slice(11, 19); }

function generarXML({ empresa, cliente, factura, items }) {
  const tipoDoc = factura.tipo_documento === 'boleta' ? '03'
                : factura.tipo_documento === 'nota_credito' ? '07'
                : factura.tipo_documento === 'nota_debito' ? '08'
                : '01'; // factura

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('Invoice', {
      xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
      'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'
    });

  doc.ele('cbc:UBLVersionID').txt('2.1').up();
  doc.ele('cbc:CustomizationID').txt('2.0').up();
  doc.ele('cbc:ID').txt(`${factura.serie}-${factura.folio}`).up();
  doc.ele('cbc:IssueDate').txt(fmtFecha(factura.fecha_emision)).up();
  doc.ele('cbc:IssueTime').txt(fmtHora(factura.fecha_emision)).up();
  doc.ele('cbc:InvoiceTypeCode', { listID: '0101' }).txt(tipoDoc).up();
  doc.ele('cbc:DocumentCurrencyCode').txt(factura.moneda || 'PEN').up();

  // Emisor
  const supplier = doc.ele('cac:AccountingSupplierParty');
  supplier.ele('cac:Party').ele('cac:PartyIdentification')
    .ele('cbc:ID', { schemeID: '6' }).txt(empresa.identificacion_fiscal);
  supplier.ele('cac:Party').ele('cac:PartyName').ele('cbc:Name').txt(empresa.razon_social);
  supplier.ele('cac:Party').ele('cac:PartyLegalEntity')
    .ele('cbc:RegistrationName').txt(empresa.razon_social);

  // Cliente
  const customer = doc.ele('cac:AccountingCustomerParty');
  const tipoIdCliente = cliente.tipo_identificacion === 'RUC' ? '6' : '1';
  customer.ele('cac:Party').ele('cac:PartyIdentification')
    .ele('cbc:ID', { schemeID: tipoIdCliente }).txt(cliente.identificacion);
  customer.ele('cac:Party').ele('cac:PartyLegalEntity')
    .ele('cbc:RegistrationName').txt(cliente.razon_social);

  // Impuestos
  if (factura.total_iva > 0) {
    const taxTotal = doc.ele('cac:TaxTotal');
    taxTotal.ele('cbc:TaxAmount', { currencyID: factura.moneda || 'PEN' }).txt(factura.total_iva.toFixed(2));
    const sub = taxTotal.ele('cac:TaxSubtotal');
    sub.ele('cbc:TaxableAmount', { currencyID: factura.moneda || 'PEN' }).txt(factura.subtotal.toFixed(2));
    sub.ele('cbc:TaxAmount', { currencyID: factura.moneda || 'PEN' }).txt(factura.total_iva.toFixed(2));
    sub.ele('cac:TaxCategory').ele('cac:TaxScheme')
       .ele('cbc:ID').txt('1000').up()
       .ele('cbc:Name').txt('IGV').up()
       .ele('cbc:TaxTypeCode').txt('VAT');
  }

  // Totales
  const totals = doc.ele('cac:LegalMonetaryTotal');
  totals.ele('cbc:LineExtensionAmount', { currencyID: factura.moneda || 'PEN' }).txt(factura.subtotal.toFixed(2));
  totals.ele('cbc:TaxInclusiveAmount', { currencyID: factura.moneda || 'PEN' }).txt(factura.total.toFixed(2));
  totals.ele('cbc:PayableAmount', { currencyID: factura.moneda || 'PEN' }).txt(factura.total.toFixed(2));

  // Líneas
  items.forEach((it, idx) => {
    const line = doc.ele('cac:InvoiceLine');
    line.ele('cbc:ID').txt(String(idx + 1));
    line.ele('cbc:InvoicedQuantity', { unitCode: it.unidad_medida || 'NIU' }).txt(Number(it.cantidad).toFixed(2));
    line.ele('cbc:LineExtensionAmount', { currencyID: factura.moneda || 'PEN' }).txt(Number(it.importe).toFixed(2));
    line.ele('cac:Item').ele('cbc:Description').txt(it.descripcion);
    line.ele('cac:Price').ele('cbc:PriceAmount', { currencyID: factura.moneda || 'PEN' }).txt(Number(it.precio_unitario).toFixed(2));
    if (it.iva_monto > 0) {
      const tt = line.ele('cac:TaxTotal');
      tt.ele('cbc:TaxAmount', { currencyID: factura.moneda || 'PEN' }).txt(Number(it.iva_monto).toFixed(2));
    }
  });

  return doc.end({ prettyPrint: true });
}

/**
 * Modo PRODUCCIÓN: firma UBL con XMLDSig y envía a SUNAT/OSE
 * @param {object} params      { empresa, cliente, factura, items }
 * @param {object} certConfig  { certPem, keyPem } o { p12Path, password }
 *                             + { ruc, usuario, password, oseEndpoint, oseToken }
 * @returns {object}           { aceptado, responseCode, description, nombreArchivo, xmlFirmado }
 */
async function emitirProduccion(params, certConfig) {
  const certMgr = require('./signing/certificateManager');
  const { signXmlPeru } = require('./signing/xmlSigner');
  const { enviarSUNAT, enviarOSE, generarNombreArchivo } = require('./submission/sunatPeru');

  // Resolver certificado
  let certPem = certConfig.certPem;
  let keyPem  = certConfig.keyPem;
  if (!certPem && certConfig.p12Path) {
    const p12 = certMgr.loadP12(certConfig.p12Path, certConfig.password);
    certPem = p12.certPem;
    keyPem  = p12.keyPem;
  }

  const { empresa, factura } = params;
  const ambiente = empresa.ambiente === 'produccion' ? 'produccion' : 'beta';

  // Generar XML UBL
  const xmlBase = generarXML(params);

  // Firmar con XMLDSig RSA-SHA256
  const xmlFirmado = signXmlPeru(xmlBase, certPem, keyPem);

  // Enviar a SUNAT o OSE
  const envFn = certConfig.oseEndpoint ? enviarOSE : enviarSUNAT;
  const resultado = await envFn(xmlFirmado, {
    ruc:          empresa.identificacion_fiscal,
    usuario:      certConfig.sunatUsuario || empresa.pac_usuario || 'MODDATOS',
    password:     certConfig.sunatPassword || empresa.pac_password,
    ambiente,
    tipoDocumento: factura.tipo_documento || 'factura',
    serie:        factura.serie,
    folio:        factura.folio,
    oseEndpoint:  certConfig.oseEndpoint,
    oseToken:     certConfig.oseToken,
  });

  return {
    uuid:          generarNombreArchivo(
                     empresa.identificacion_fiscal,
                     factura.tipo_documento || 'factura',
                     factura.serie, factura.folio),
    aceptado:      resultado.aceptado,
    responseCode:  resultado.responseCode,
    description:   resultado.description,
    nombreArchivo: resultado.nombreArchivo,
    cdrBase64:     resultado.cdrBase64,
    xmlFirmado,
  };
}

module.exports = { getMetadata, generarUUID, generarXML, emitirProduccion };
