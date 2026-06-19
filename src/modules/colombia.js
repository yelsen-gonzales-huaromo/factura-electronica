/**
 * Módulo Colombia - DIAN UBL 2.1
 */
const { create } = require('xmlbuilder2');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

function getMetadata() {
  return {
    pais: 'Colombia',
    codigo: 'CO',
    autoridad: 'DIAN',
    formato: 'UBL 2.1',
    moneda: 'COP',
    iva_general: 19,
    documentos: ['factura', 'nota_credito', 'nota_debito']
  };
}

// CUFE: Código Único de Facturación Electrónica
function generarUUID(factura, empresa) {
  const data = `${factura.serie || ''}${factura.folio}${factura.fecha_emision}${factura.subtotal}${empresa?.identificacion_fiscal || ''}`;
  return crypto.createHash('sha384').update(data).digest('hex');
}

function fmtFecha(d) { return new Date(d).toISOString().slice(0, 10); }
function fmtHora(d) { return new Date(d).toISOString().slice(11, 19); }

function generarXML({ empresa, cliente, factura, items }) {
  const cufe = generarUUID(factura, empresa);

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('Invoice', {
      xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
      'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'
    });

  doc.ele('cbc:UBLVersionID').txt('UBL 2.1').up();
  doc.ele('cbc:CustomizationID').txt('10').up();
  doc.ele('cbc:ProfileID').txt('DIAN 2.1').up();
  doc.ele('cbc:ID').txt(`${factura.serie}${factura.folio}`).up();
  doc.ele('cbc:UUID', { schemeID: '2', schemeName: 'CUFE-SHA384' }).txt(cufe).up();
  doc.ele('cbc:IssueDate').txt(fmtFecha(factura.fecha_emision)).up();
  doc.ele('cbc:IssueTime').txt(fmtHora(factura.fecha_emision)).up();
  doc.ele('cbc:InvoiceTypeCode').txt(factura.tipo_documento === 'nota_credito' ? '91' : '01').up();
  doc.ele('cbc:DocumentCurrencyCode').txt(factura.moneda || 'COP').up();

  // Emisor
  const supplier = doc.ele('cac:AccountingSupplierParty').ele('cac:Party');
  const supTax = supplier.ele('cac:PartyTaxScheme');
  supTax.ele('cbc:RegistrationName').txt(empresa.razon_social);
  supTax.ele('cbc:CompanyID', { schemeID: '0', schemeName: '31' }).txt(empresa.identificacion_fiscal);
  supTax.ele('cac:TaxScheme').ele('cbc:ID').txt('01').up().ele('cbc:Name').txt('IVA');
  supplier.ele('cac:PhysicalLocation').ele('cac:Address').ele('cbc:CityName').txt(empresa.ciudad || '');

  // Cliente
  const customer = doc.ele('cac:AccountingCustomerParty').ele('cac:Party');
  const cusTax = customer.ele('cac:PartyTaxScheme');
  cusTax.ele('cbc:RegistrationName').txt(cliente.razon_social);
  cusTax.ele('cbc:CompanyID', { schemeID: '0', schemeName: '31' }).txt(cliente.identificacion);
  cusTax.ele('cac:TaxScheme').ele('cbc:ID').txt('01').up().ele('cbc:Name').txt('IVA');

  // Total impuestos
  if (factura.total_iva > 0) {
    const taxTotal = doc.ele('cac:TaxTotal');
    taxTotal.ele('cbc:TaxAmount', { currencyID: factura.moneda || 'COP' }).txt(factura.total_iva.toFixed(2));
    const sub = taxTotal.ele('cac:TaxSubtotal');
    sub.ele('cbc:TaxableAmount', { currencyID: factura.moneda || 'COP' }).txt(factura.subtotal.toFixed(2));
    sub.ele('cbc:TaxAmount', { currencyID: factura.moneda || 'COP' }).txt(factura.total_iva.toFixed(2));
    sub.ele('cac:TaxCategory').ele('cbc:Percent').txt('19.00').up()
       .ele('cac:TaxScheme').ele('cbc:ID').txt('01').up().ele('cbc:Name').txt('IVA');
  }

  // Totales
  const monetaryTotal = doc.ele('cac:LegalMonetaryTotal');
  monetaryTotal.ele('cbc:LineExtensionAmount', { currencyID: factura.moneda || 'COP' }).txt(factura.subtotal.toFixed(2));
  monetaryTotal.ele('cbc:TaxExclusiveAmount', { currencyID: factura.moneda || 'COP' }).txt(factura.subtotal.toFixed(2));
  monetaryTotal.ele('cbc:TaxInclusiveAmount', { currencyID: factura.moneda || 'COP' }).txt(factura.total.toFixed(2));
  monetaryTotal.ele('cbc:PayableAmount', { currencyID: factura.moneda || 'COP' }).txt(factura.total.toFixed(2));

  // Líneas
  items.forEach((it, idx) => {
    const line = doc.ele('cac:InvoiceLine');
    line.ele('cbc:ID').txt(String(idx + 1));
    line.ele('cbc:InvoicedQuantity', { unitCode: it.unidad_medida || 'UND' }).txt(Number(it.cantidad).toFixed(2));
    line.ele('cbc:LineExtensionAmount', { currencyID: factura.moneda || 'COP' }).txt(Number(it.importe).toFixed(2));
    const item = line.ele('cac:Item');
    item.ele('cbc:Description').txt(it.descripcion);
    if (it.codigo) item.ele('cac:StandardItemIdentification').ele('cbc:ID', { schemeID: '999' }).txt(it.codigo);
    line.ele('cac:Price').ele('cbc:PriceAmount', { currencyID: factura.moneda || 'COP' }).txt(Number(it.precio_unitario).toFixed(2));
  });

  return doc.end({ prettyPrint: true });
}

/**
 * Modo PRODUCCIÓN: firma UBL con XMLDSig y envía a la DIAN
 * @param {object} params      { empresa, cliente, factura, items }
 * @param {object} certConfig  { certPem, keyPem, softwareId, softwarePin } o { p12Path, password, ... }
 * @returns {object}           { cufe, valido, codigo, mensaje, xmlFirmado }
 */
async function emitirProduccion(params, certConfig) {
  const certMgr = require('./signing/certificateManager');
  const { signXmlColombia } = require('./signing/xmlSigner');
  const { enviarDIAN, generarCUFE } = require('./submission/dianColombia');

  // Resolver certificado
  let certPem = certConfig.certPem;
  let keyPem  = certConfig.keyPem;
  if (!certPem && certConfig.p12Path) {
    const p12 = certMgr.loadP12(certConfig.p12Path, certConfig.password);
    certPem = p12.certPem;
    keyPem  = p12.keyPem;
  }

  const { empresa, cliente, factura } = params;
  const ambiente = empresa.ambiente === 'produccion' ? 'produccion' : 'habilitacion';

  // Generar CUFE
  const cufe = generarCUFE(factura, empresa, certConfig.softwarePin || '');

  // Generar XML UBL
  const xmlBase = generarXML(params);

  // Firmar con XMLDSig RSA-SHA256
  const xmlFirmado = signXmlColombia(xmlBase, certPem, keyPem);

  // Enviar a DIAN
  const resultado = await enviarDIAN(xmlFirmado, {
    nit:          empresa.identificacion_fiscal,
    softwareId:   certConfig.softwareId   || empresa.pac_usuario,
    softwarePin:  certConfig.softwarePin  || empresa.pac_password,
    ambiente,
    cufe,
    consecutivo:  `${factura.serie}-${factura.folio}`,
  });

  return {
    uuid:      cufe,
    cufe,
    valido:    resultado.valido,
    codigo:    resultado.codigo,
    mensaje:   resultado.mensaje,
    xmlFirmado,
  };
}

module.exports = { getMetadata, generarUUID, generarXML, emitirProduccion };
