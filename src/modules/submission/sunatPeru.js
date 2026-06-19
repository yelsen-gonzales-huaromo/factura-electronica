/**
 * Perú SUNAT/OSE — Envío de comprobantes electrónicos UBL 2.1
 * Documentación: https://cpe.sunat.gob.pe/
 *
 * Modos de envío:
 *   1. SUNAT directa (SEE-SOL): https://e-beta.sunat.gob.pe/ol-ti-itconsesact/billService
 *   2. OSE (Operador de Servicios Electrónicos): cada OSE tiene su propio endpoint
 *
 * Flujo:
 *   1. Firmar XML UBL 2.1 con XMLDSig RSA-SHA256
 *   2. Comprimir en ZIP con nombre = RUC-TipoDoc-Serie-Numero.xml
 *   3. Enviar ZIP en base64 al web service SOAP
 *   4. Procesar ApplicationResponse (CDR)
 */
const axios = require('axios');
const AdmZip = require('adm-zip');

const WS_SUNAT = {
  beta:       'https://e-beta.sunat.gob.pe/ol-ti-itconsesact/billService',
  produccion: 'https://e-factura.sunat.gob.pe/ol-ti-itcpsegfirmcpe/billService',
};

// Tipos de comprobante SUNAT
const TIPO_DOC = {
  factura:     '01',
  boleta:      '03',
  nota_credito: '07',
  nota_debito:  '08',
};

/**
 * Genera el hash de autenticación SUNAT
 */
function buildAuthHeader(ruc, usuario, password) {
  const usrPass = `${ruc}${usuario}:${password}`;
  return 'Basic ' + Buffer.from(usrPass).toString('base64');
}

/**
 * Construye el SOAP para sendBill (envío de comprobante)
 */
function buildSendBillSoap(zipBase64, fileName) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ser="http://service.sunat.gob.pe"
                  xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:sendBill>
      <fileName>${fileName}</fileName>
      <contentFile>${zipBase64}</contentFile>
    </ser:sendBill>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Parsea el CDR (Constancia de Recepción) de SUNAT
 */
function parseCDR(soapXml) {
  // Buscar el ApplicationResponse en base64 dentro del ZIP
  const appRespB64 = soapXml.match(/<applicationResponse>([^<]*)<\/applicationResponse>/i);
  const ticket     = soapXml.match(/<ticket>([^<]*)<\/ticket>/i);
  const faultStr   = soapXml.match(/<faultstring>([^<]*)<\/faultstring>/i);

  if (faultStr) {
    throw new Error(`SUNAT error: ${faultStr[1]}`);
  }

  let responseCode = null, description = null;
  if (appRespB64) {
    // El CDR es un ZIP en base64 que contiene el ApplicationResponse XML
    try {
      const zip = new AdmZip(Buffer.from(appRespB64[1], 'base64'));
      const entries = zip.getEntries();
      if (entries.length > 0) {
        const cdrXml = entries[0].getData().toString('utf8');
        const codeMatch = cdrXml.match(/<cbc:ResponseCode>([^<]*)<\/cbc:ResponseCode>/i);
        const descMatch = cdrXml.match(/<cbc:Description>([^<]*)<\/cbc:Description>/i);
        responseCode = codeMatch ? codeMatch[1].trim() : null;
        description  = descMatch ? descMatch[1].trim() : null;
      }
    } catch(e) {
      // Si falla el parse del CDR, intentar leer directamente
    }
  }

  return {
    ticket:       ticket ? ticket[1].trim() : null,
    responseCode,
    description,
    aceptado:     responseCode === '0',
    cdrBase64:    appRespB64 ? appRespB64[1].trim() : null,
  };
}

/**
 * Genera el nombre del archivo ZIP según nomenclatura SUNAT
 * Formato: RUC-TipoDoc-Serie-Correlativo.zip
 */
function generarNombreArchivo(ruc, tipoDocumento, serie, folio) {
  const tipo = TIPO_DOC[tipoDocumento] || '01';
  return `${ruc}-${tipo}-${serie}-${String(folio).padStart(8,'0')}`;
}

/**
 * Envía comprobante a SUNAT
 * @param {string} xmlFirmado   XML UBL 2.1 firmado
 * @param {object} config       { ruc, usuario, password, ambiente, tipoDocumento, serie, folio }
 * @returns {object}            { aceptado, responseCode, description, ticket, cdrBase64 }
 */
async function enviarSUNAT(xmlFirmado, config) {
  const {
    ruc,
    usuario    = 'MODDATOS',
    password,
    ambiente   = 'beta',
    tipoDocumento = 'factura',
    serie,
    folio,
    endpoint: customEndpoint,
  } = config;

  const wsUrl = customEndpoint || WS_SUNAT[ambiente] || WS_SUNAT.beta;

  // 1. Construir nombre del archivo
  const nombreBase = generarNombreArchivo(ruc, tipoDocumento, serie, folio);
  const xmlFileName = `${nombreBase}.xml`;
  const zipFileName = `${nombreBase}.zip`;

  // 2. Crear ZIP
  const zip = new AdmZip();
  zip.addFile(xmlFileName, Buffer.from(xmlFirmado, 'utf8'));
  const zipBase64 = zip.toBuffer().toString('base64');

  // 3. SOAP envelope
  const soap = buildSendBillSoap(zipBase64, zipFileName);

  // 4. Enviar con autenticación SUNAT
  const authHeader = buildAuthHeader(ruc, usuario, password);
  const res = await axios.post(wsUrl, soap, {
    headers: {
      'Content-Type':  'text/xml; charset=utf-8',
      'SOAPAction':    '',
      'Authorization': authHeader,
    },
    timeout: 45000,
  });

  const cdr = parseCDR(res.data);

  return {
    ...cdr,
    nombreArchivo: zipFileName,
  };
}

/**
 * Envía a un OSE (Operador de Servicios Electrónicos)
 * La mayoría de OSEs tienen APIs REST propias, pero el patrón es similar
 */
async function enviarOSE(xmlFirmado, config) {
  const { oseEndpoint, oseToken, ...rest } = config;

  if (!oseEndpoint) {
    // Si no hay OSE configurado, usar SUNAT directa
    return enviarSUNAT(xmlFirmado, rest);
  }

  // Envío REST genérico a OSE
  const res = await axios.post(oseEndpoint, xmlFirmado, {
    headers: {
      'Content-Type':  'application/xml',
      'Authorization': `Bearer ${oseToken}`,
    },
    timeout: 45000,
  });

  return {
    aceptado:     res.data?.success || res.status === 200,
    responseCode: String(res.status),
    description:  res.data?.message || 'Enviado',
    rawResponse:  res.data,
  };
}

module.exports = { enviarSUNAT, enviarOSE, generarNombreArchivo };
