/**
 * Colombia DIAN — Envío de documentos electrónicos UBL 2.1
 * Documentación: https://www.dian.gov.co/impuestos/factura-electronica/
 *
 * La DIAN usa un modelo de habilitación + envío a Proveedor Tecnológico (PT).
 * Este módulo implementa envío directo vía API REST del proveedor tecnológico.
 *
 * Proveedores tecnológicos soportados:
 *   - API DIAN directa (ambiente habilitación): https://vpfe-hab.dian.gov.co/
 *   - Producción: https://vpfe.dian.gov.co/
 *
 * Flujo:
 *   1. Firmar UBL XML con XMLDSig RSA-SHA256
 *   2. Comprimir ZIP con nombre = CUFE (o consecutivo)
 *   3. Codificar ZIP en base64
 *   4. Enviar al WS DIAN (SendBillSync o SendTestSetAsync)
 *   5. Procesar respuesta con ApplicationResponse
 */
const axios = require('axios');
const AdmZip = require('adm-zip');

const WS_DIAN = {
  habilitacion: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
  produccion:   'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc',
};

/**
 * Genera CUFE (Código Único de Factura Electrónica)
 * CUFE = SHA-384 de cadena definida por DIAN
 */
function generarCUFE(factura, empresa, clavePrivada) {
  const crypto = require('crypto');
  // Cadena CUFE: NumFac + FecFac + HorFac + ValFac + ... + ClavePrivada
  const cadena = [
    factura.folio,
    factura.fecha_emision?.toISOString?.()?.slice(0,10)?.replace(/-/g,'') || '',
    factura.fecha_emision?.toISOString?.()?.slice(11,19)?.replace(/:/g,'') || '',
    Number(factura.subtotal || 0).toFixed(2),
    '01', // Código impuesto 1 (IVA)
    Number(factura.total_iva || 0).toFixed(2),
    Number(factura.total || 0).toFixed(2),
    empresa.identificacion_fiscal || '',
    empresa.tipo_doc || '31', // NIT
    (factura.cliente?.identificacion || '').replace(/[^0-9]/g,''),
    factura.cliente?.tipo_id_fiscal || '13',
    clavePrivada || '',
  ].join('');

  return crypto.createHash('sha384').update(cadena).digest('hex');
}

/**
 * Construye SOAP envelope para SendBillSync (envío directo)
 */
function buildSendBillSoap(zipBase64, fileName, nit, softwareId, softwarePin) {
  // Password de integración = SHA-384(SoftwareId + SoftwarePin)
  const crypto = require('crypto');
  const passHash = crypto.createHash('sha384')
    .update(softwareId + softwarePin)
    .digest('hex');

  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:a="http://www.w3.org/2005/08/addressing"
            xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
  <s:Header>
    <a:Action s:mustUnderstand="1">http://wcf.dian.colombia/IWcfDianCustomerServices/SendBillSync</a:Action>
    <Security xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <UsernameToken>
        <Username>${nit}</Username>
        <Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${passHash}</Password>
        <Nonce>${Buffer.from(softwareId).toString('base64')}</Nonce>
      </UsernameToken>
    </Security>
  </s:Header>
  <s:Body>
    <SendBillSync xmlns="http://wcf.dian.colombia/">
      <fileName>${fileName}</fileName>
      <contentFile>${zipBase64}</contentFile>
    </SendBillSync>
  </s:Body>
</s:Envelope>`;
}

/**
 * Parsea la respuesta ApplicationResponse de la DIAN
 */
function parseRespuestaDIAN(soapXml) {
  const statusCode    = soapXml.match(/<b:StatusCode>([^<]*)<\/b:StatusCode>/i);
  const statusMsg     = soapXml.match(/<b:StatusDescription>([^<]*)<\/b:StatusDescription>/i);
  const isValid       = soapXml.match(/<b:IsValid>([^<]*)<\/b:IsValid>/i);
  const processedDoc  = soapXml.match(/<b:XmlDocumentKey>([^<]*)<\/b:XmlDocumentKey>/i);

  return {
    codigo:    statusCode   ? statusCode[1].trim()   : null,
    mensaje:   statusMsg    ? statusMsg[1].trim()    : null,
    valido:    isValid      ? isValid[1].trim() === 'true' : false,
    docKey:    processedDoc ? processedDoc[1].trim() : null,
  };
}

/**
 * Envía factura UBL firmada a la DIAN
 * @param {string} xmlFirmado   XML UBL 2.1 firmado
 * @param {object} config       { nit, softwareId, softwarePin, ambiente, cufe, consecutivo }
 * @returns {object}            { cufe, valido, codigo, mensaje, xmlRespuesta }
 */
async function enviarDIAN(xmlFirmado, config) {
  const {
    nit,
    softwareId,
    softwarePin,
    ambiente   = 'habilitacion',
    cufe,
    consecutivo,
  } = config;

  const endpoint = WS_DIAN[ambiente] || WS_DIAN.habilitacion;

  // 1. Crear ZIP con el XML
  const zip = new AdmZip();
  const fileName = `${consecutivo || cufe?.slice(0,20) || 'factura'}.xml`;
  zip.addFile(fileName, Buffer.from(xmlFirmado, 'utf8'));
  const zipBuffer = zip.toBuffer();
  const zipBase64 = zipBuffer.toString('base64');
  const zipName   = `${consecutivo || 'fac'}.zip`;

  // 2. Construir SOAP
  const soap = buildSendBillSoap(zipBase64, zipName, nit, softwareId, softwarePin);

  // 3. Enviar
  const res = await axios.post(endpoint, soap, {
    headers: {
      'Content-Type': 'application/soap+xml; charset=utf-8',
      'SOAPAction':   'http://wcf.dian.colombia/IWcfDianCustomerServices/SendBillSync',
    },
    timeout: 45000,
  });

  const parsed = parseRespuestaDIAN(res.data);

  return {
    cufe:     cufe || parsed.docKey,
    valido:   parsed.valido,
    codigo:   parsed.codigo,
    mensaje:  parsed.mensaje,
    xmlRespuesta: res.data,
  };
}

module.exports = { enviarDIAN, generarCUFE };
