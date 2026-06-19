/**
 * Ecuador SRI — Envío y autorización de comprobantes electrónicos
 * Documentación: https://www.sri.gob.ec/web/guest/facturacion-electronica
 *
 * Flujo:
 *   1. Firmar XML con XAdES-BES (xml-crypto)
 *   2. Enviar al WS de recepción (retorna estado RECIBIDA/DEVUELTA)
 *   3. Consultar WS de autorización → retorna XML con clave de acceso autorizada
 *
 * Ambientes:
 *   Pruebas:    https://celcer.sri.gob.ec/comprobantes-electronicos-internet/main/...
 *   Producción: https://cel.sri.gob.ec/comprobantes-electronicos-internet/main/...
 */
const axios = require('axios');

const WS = {
  pruebas: {
    recepcion:    'https://celcer.sri.gob.ec/comprobantes-electronicos-internet/main/mainInterfaceServlet',
    autorizacion: 'https://celcer.sri.gob.ec/comprobantes-electronicos-internet/main/mainInterfaceServlet',
  },
  produccion: {
    recepcion:    'https://cel.sri.gob.ec/comprobantes-electronicos-internet/main/mainInterfaceServlet',
    autorizacion: 'https://cel.sri.gob.ec/comprobantes-electronicos-internet/main/mainInterfaceServlet',
  },
};

/**
 * Construye SOAP envelope para recepción de comprobante
 */
function buildRecepcionSoap(xmlBase64) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:validarComprobante xmlns:ns2="http://ec.gob.sri.ws.recepcion">
      <xml>${xmlBase64}</xml>
    </ns2:validarComprobante>
  </soap:Body>
</soap:Envelope>`;
}

/**
 * Construye SOAP envelope para autorización de comprobante
 */
function buildAutorizacionSoap(claveAcceso) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:autorizacionComprobante xmlns:ns2="http://ec.gob.sri.ws.autorizacion">
      <claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante>
    </ns2:autorizacionComprobante>
  </soap:Body>
</soap:Envelope>`;
}

/**
 * Parsea respuesta de recepción SRI
 */
function parseRecepcion(soapXml) {
  const estadoMatch = soapXml.match(/<estado>([^<]*)<\/estado>/i);
  const errorMatch  = soapXml.match(/<mensajeError>([^<]*)<\/mensajeError>/gi);
  const infoMatch   = soapXml.match(/<informacionAdicional>([^<]*)<\/informacionAdicional>/gi);

  const estado = estadoMatch ? estadoMatch[1].trim() : 'DESCONOCIDO';
  const errores = errorMatch ? errorMatch.map(m => m.replace(/<\/?mensajeError>/gi, '').trim()) : [];
  const info    = infoMatch  ? infoMatch.map(m => m.replace(/<\/?informacionAdicional>/gi, '').trim()) : [];

  return { estado, errores, info };
}

/**
 * Parsea respuesta de autorización SRI
 */
function parseAutorizacion(soapXml) {
  const numAuth   = soapXml.match(/<numeroAutorizacion>([^<]*)<\/numeroAutorizacion>/i);
  const fechaAuth = soapXml.match(/<fechaAutorizacion>([^<]*)<\/fechaAutorizacion>/i);
  const estadoA   = soapXml.match(/<estado>([^<]*)<\/estado>/i);
  const compXml   = soapXml.match(/<comprobante><!\[CDATA\[([\s\S]*?)\]\]><\/comprobante>/i) ||
                    soapXml.match(/<comprobante>([\s\S]*?)<\/comprobante>/i);

  return {
    numeroAutorizacion: numAuth   ? numAuth[1].trim()   : null,
    fechaAutorizacion:  fechaAuth ? fechaAuth[1].trim() : null,
    estado:             estadoA   ? estadoA[1].trim()   : null,
    xmlAutorizado:      compXml   ? compXml[1].trim()   : null,
  };
}

/**
 * Envía comprobante al SRI (recepción)
 * @param {string} xmlFirmado  XML firmado con XAdES-BES
 * @param {string} ambiente    'pruebas' | 'produccion'
 * @returns {object}           { estado, errores, info }
 */
async function recibirComprobante(xmlFirmado, ambiente = 'pruebas') {
  const endpoint = WS[ambiente]?.recepcion || WS.pruebas.recepcion;
  const xmlBase64 = Buffer.from(xmlFirmado, 'utf8').toString('base64');
  const soap = buildRecepcionSoap(xmlBase64);

  const res = await axios.post(endpoint, soap, {
    headers: {
      'Content-Type': 'text/xml; charset=UTF-8',
      'SOAPAction': '"http://ec.gob.sri.ws.recepcion/validarComprobante"',
    },
    timeout: 30000,
  });

  return parseRecepcion(res.data);
}

/**
 * Consulta autorización en el SRI
 * @param {string} claveAcceso  49 dígitos
 * @param {string} ambiente     'pruebas' | 'produccion'
 * @param {number} maxIntentos  Máximo de reintentos (el SRI puede tardar)
 * @returns {object}            { numeroAutorizacion, fechaAutorizacion, estado, xmlAutorizado }
 */
async function autorizarComprobante(claveAcceso, ambiente = 'pruebas', maxIntentos = 5) {
  const endpoint = WS[ambiente]?.autorizacion || WS.pruebas.autorizacion;
  const soap = buildAutorizacionSoap(claveAcceso);

  for (let intento = 0; intento < maxIntentos; intento++) {
    if (intento > 0) {
      // Esperar antes de reintentar (SRI puede demorar en procesar)
      await new Promise(r => setTimeout(r, 3000 * intento));
    }

    const res = await axios.post(endpoint, soap, {
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8',
        'SOAPAction': '"http://ec.gob.sri.ws.autorizacion/autorizacionComprobante"',
      },
      timeout: 30000,
    });

    const result = parseAutorizacion(res.data);
    if (result.estado === 'AUTORIZADO' || result.estado === 'NO AUTORIZADO') {
      return result;
    }
    // Si está EN PROCESO, reintentar
  }

  return { estado: 'EN_PROCESO', numeroAutorizacion: null, xmlAutorizado: null };
}

/**
 * Flujo completo: firmar → enviar → autorizar
 * @param {string} xmlSinFirma  XML Ecuador generado por ecuador.js
 * @param {object} certConfig   { certPem, keyPem }
 * @param {string} claveAcceso  49 dígitos (generada por ecuador.js)
 * @param {string} ambiente     'pruebas' | 'produccion'
 * @returns {object}            { claveAcceso, numeroAutorizacion, fechaAutorizacion, xmlAutorizado, estado }
 */
async function emitirEcuador(xmlSinFirma, certConfig, claveAcceso, ambiente = 'pruebas') {
  const { signXmlEcuador } = require('../signing/xmlSigner');

  // 1. Firmar con XAdES-BES
  const xmlFirmado = signXmlEcuador(xmlSinFirma, certConfig.certPem, certConfig.keyPem);

  // 2. Enviar al SRI
  const recepcion = await recibirComprobante(xmlFirmado, ambiente);
  if (recepcion.estado === 'DEVUELTA') {
    throw new Error(`SRI rechazó comprobante: ${recepcion.errores.join('; ')}`);
  }

  // 3. Autorizar
  const autorizacion = await autorizarComprobante(claveAcceso, ambiente);
  if (autorizacion.estado === 'NO AUTORIZADO') {
    throw new Error(`SRI no autorizó: ${autorizacion.estado}`);
  }

  return {
    claveAcceso,
    numeroAutorizacion: autorizacion.numeroAutorizacion || claveAcceso,
    fechaAutorizacion:  autorizacion.fechaAutorizacion,
    xmlFirmado,
    xmlAutorizado: autorizacion.xmlAutorizado || xmlFirmado,
    estado: autorizacion.estado || 'AUTORIZADO',
  };
}

module.exports = { recibirComprobante, autorizarComprobante, emitirEcuador };
