/**
 * Módulo México - CFDI 4.0 (SAT)
 * Genera XML conforme al esquema del CFDI versión 4.0
 * Soporta modo SIMULADO y modo PRODUCCIÓN (con certificado + PAC)
 */
const { create } = require('xmlbuilder2');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

function getMetadata() {
  return {
    pais: 'México',
    codigo: 'MX',
    autoridad: 'SAT',
    formato: 'CFDI 4.0',
    moneda: 'MXN',
    iva_general: 16,
    documentos: ['factura', 'nota_credito', 'nota_debito', 'recibo']
  };
}

function generarUUID() {
  return uuidv4().toUpperCase();
}

function fmtFecha(d) {
  return new Date(d).toISOString().slice(0, 19);
}

/**
 * Genera el XML base del CFDI 4.0 (sin sello ni timbrado)
 */
function generarXMLBase({ empresa, cliente, factura, items }, certData = null) {
  const tipoComprobante = factura.tipo_documento === 'nota_credito' ? 'E' : 'I';

  const attrs = {
    'xmlns:cfdi': 'http://www.sat.gob.mx/cfd/4',
    'xmlns:xsi':  'http://www.w3.org/2001/XMLSchema-instance',
    'xsi:schemaLocation': 'http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd',
    Version:           '4.0',
    Serie:             factura.serie,
    Folio:             String(factura.folio),
    Fecha:             fmtFecha(factura.fecha_emision),
    FormaPago:         factura.forma_pago || '01',
    MetodoPago:        factura.metodo_pago || 'PUE',
    SubTotal:          Number(factura.subtotal).toFixed(2),
    Descuento:         Number(factura.descuento || 0).toFixed(2),
    Moneda:            factura.moneda || 'MXN',
    TipoCambio:        Number(factura.tipo_cambio || 1).toFixed(4),
    Total:             Number(factura.total).toFixed(2),
    TipoDeComprobante: tipoComprobante,
    Exportacion:       '01',
    LugarExpedicion:   factura.lugar_expedicion || empresa.codigo_postal || '00000',
  };

  if (factura.condiciones_pago) attrs.CondicionesDePago = factura.condiciones_pago;

  if (certData) {
    attrs.NoCertificado = certData.noCertificado;
    attrs.Certificado   = certData.certBase64;
    attrs.Sello         = certData.sello || '';
  } else {
    attrs.NoCertificado = empresa.no_certificado || '00000000000000000000';
    attrs.Sello         = '';
  }

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('cfdi:Comprobante', attrs);

  // Emisor
  doc.ele('cfdi:Emisor', {
    Rfc:           empresa.identificacion_fiscal,
    Nombre:        empresa.razon_social,
    RegimenFiscal: empresa.regimen_fiscal || '601'
  });

  // Receptor
  doc.ele('cfdi:Receptor', {
    Rfc:                     cliente.identificacion,
    Nombre:                  cliente.razon_social,
    DomicilioFiscalReceptor: cliente.codigo_postal || '00000',
    RegimenFiscalReceptor:   cliente.regimen_fiscal || '616',
    UsoCFDI:                 cliente.uso_cfdi || factura.uso_cfdi || 'G03'
  });

  // Conceptos
  const conceptos = doc.ele('cfdi:Conceptos');
  for (const it of items) {
    const conceptoAttrs = {
      ClaveProdServ: it.codigo_sat || '01010101',
      Cantidad:      Number(it.cantidad).toFixed(4),
      ClaveUnidad:   it.unidad_medida || 'PZA',
      Unidad:        it.unidad_medida || 'PZA',
      Descripcion:   it.descripcion,
      ValorUnitario: Number(it.precio_unitario).toFixed(4),
      Importe:       Number(it.importe).toFixed(2),
      Descuento:     Number(it.descuento || 0).toFixed(2),
      ObjetoImp:     Number(it.iva_porcentaje) > 0 ? '02' : '01'
    };
    if (it.codigo) conceptoAttrs.NoIdentificacion = it.codigo;

    const concepto = conceptos.ele('cfdi:Concepto', conceptoAttrs);

    if (Number(it.iva_porcentaje) > 0) {
      const traslados = concepto.ele('cfdi:Impuestos').ele('cfdi:Traslados');
      traslados.ele('cfdi:Traslado', {
        Base:       Number(it.importe).toFixed(2),
        Impuesto:   '002',
        TipoFactor: 'Tasa',
        TasaOCuota: (Number(it.iva_porcentaje) / 100).toFixed(6),
        Importe:    Number(it.iva_monto).toFixed(2)
      });
    }
    if (Number(it.ieps_porcentaje) > 0) {
      const impCon = concepto.ele('cfdi:Impuestos');
      const traslIeps = impCon.ele('cfdi:Traslados');
      traslIeps.ele('cfdi:Traslado', {
        Base:       Number(it.importe).toFixed(2),
        Impuesto:   '003',
        TipoFactor: 'Tasa',
        TasaOCuota: (Number(it.ieps_porcentaje) / 100).toFixed(6),
        Importe:    Number(it.ieps_monto).toFixed(2)
      });
    }
  }

  // Impuestos totales
  if (Number(factura.total_iva) > 0 || Number(factura.total_ieps) > 0) {
    const impAttrs = {};
    if (Number(factura.total_iva)  > 0) impAttrs.TotalImpuestosTrasladados = Number(factura.total_iva).toFixed(2);
    if (Number(factura.total_retenciones) > 0) impAttrs.TotalImpuestosRetenidos = Number(factura.total_retenciones).toFixed(2);
    const imp = doc.ele('cfdi:Impuestos', impAttrs);
    const trasladosRoot = imp.ele('cfdi:Traslados');
    if (Number(factura.total_iva) > 0) {
      trasladosRoot.ele('cfdi:Traslado', {
        Base:       Number(factura.subtotal).toFixed(2),
        Impuesto:   '002',
        TipoFactor: 'Tasa',
        TasaOCuota: '0.160000',
        Importe:    Number(factura.total_iva).toFixed(2)
      });
    }
  }

  return doc.end({ prettyPrint: true });
}

/**
 * Modo SIMULADO: genera XML sin firma real
 */
function generarXML(params) {
  return generarXMLBase(params, null);
}

/**
 * Modo PRODUCCIÓN: firma el CFDI con el certificado de la empresa
 * y envía al PAC para timbrado.
 *
 * @param {object} params       { empresa, cliente, factura, items }
 * @param {object} certConfig   { p12Path, cerPath, keyPath, password, noCertificado }
 * @param {object} pacConfig    { proveedor, usuario, password, ambiente }
 * @returns {object}            { uuid, xmlTimbrado, xmlFirmado, sello, noCertificado }
 */
async function emitirProduccion(params, certConfig, pacConfig) {
  const certMgr   = require('./signing/certificateManager');
  const { generarCadenaOriginal } = require('./signing/cadenaOriginal');
  const { getPAC }  = require('./pac');

  // 1. Cargar certificado y llave
  let privateKey, certificate;
  if (certConfig.p12Path) {
    const p12Data = certMgr.loadP12(certConfig.p12Path, certConfig.password);
    privateKey   = p12Data.privateKey;
    certificate  = p12Data.certificate;
  } else {
    certificate = certMgr.loadCer(certConfig.cerPath);
    privateKey  = certMgr.loadKey(certConfig.keyPath, certConfig.password);
  }

  const certBase64     = certMgr.certToBase64(certificate);
  const noCertificado  = certConfig.noCertificado || certMgr.getCertificadoNumero(certificate);

  // 2. Generar XML sin sello (sello vacío)
  const xmlSinSello = generarXMLBase(params, {
    noCertificado,
    certBase64,
    sello: '',
  });

  // 3. Generar cadena original
  const cadenaOriginal = generarCadenaOriginal(xmlSinSello);

  // 4. Firmar con RSA-SHA256
  const sello = certMgr.signSHA256(cadenaOriginal, privateKey);

  // 5. Insertar sello en el XML
  const xmlFirmado = xmlSinSello.replace('Sello=""', `Sello="${sello}"`);

  // 6. Enviar al PAC para timbrado
  const pac       = getPAC(pacConfig.proveedor || 'finkok');
  const resultado = await pac.timbraCFDI(xmlFirmado, pacConfig);

  return {
    uuid:            resultado.uuid,
    xmlTimbrado:     resultado.xmlTimbrado,
    xmlFirmado,
    sello,
    noCertificado,
    cadenaOriginal,
  };
}

module.exports = { getMetadata, generarUUID, generarXML, generarXMLBase, emitirProduccion };
