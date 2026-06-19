/**
 * PAC Finkok — México
 * Integración con el PAC Finkok para timbrado de CFDI 4.0
 * Documentación: https://wiki.finkok.com/
 *
 * Ambientes:
 *   Pruebas:    https://demo-facturacion.finkok.com/servicios/soap/stamp.wsdl
 *   Producción: https://facturacion.finkok.com/servicios/soap/stamp.wsdl
 */
const axios = require('axios');

const ENDPOINTS = {
  pruebas:    'https://demo-facturacion.finkok.com/servicios/soap/stamp.wsdl',
  produccion: 'https://facturacion.finkok.com/servicios/soap/stamp.wsdl',
};

const QUICKSTAMP_ENDPOINTS = {
  pruebas:    'https://demo-facturacion.finkok.com/servicios/soap/quickstamp.wsdl',
  produccion: 'https://facturacion.finkok.com/servicios/soap/quickstamp.wsdl',
};

/**
 * Construye el SOAP body para el método stamp (timbrado)
 */
function buildStampSoap(xmlBase64, usuario, password) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Header>
    <Credentials xmlns="http://facturacion.finkok.com/servicios/stamp">
      <Username>${usuario}</Username>
      <Password>${password}</Password>
    </Credentials>
  </soap:Header>
  <soap:Body>
    <stamp xmlns="http://facturacion.finkok.com/servicios/stamp">
      <xml>${xmlBase64}</xml>
    </stamp>
  </soap:Body>
</soap:Envelope>`;
}

/**
 * Extrae el TFD (TimbreFiscalDigital) de la respuesta SOAP de Finkok
 */
function extractTFD(soapResponse) {
  const uuidMatch = soapResponse.match(/NoCertificadoSAT="([^"]*)"/);
  const tfdMatch  = soapResponse.match(/<tfd:TimbreFiscalDigital[^>]*\/>/s) ||
                    soapResponse.match(/<tfd:TimbreFiscalDigital[^>]*>.*?<\/tfd:TimbreFiscalDigital>/s);
  const errorMatch = soapResponse.match(/<Incidencias>.*?<\/Incidencias>/s);

  if (errorMatch) {
    const codeMatch   = errorMatch[0].match(/<CodigoError>([^<]*)<\/CodigoError>/);
    const msgMatch    = errorMatch[0].match(/<MensajeIncidencia>([^<]*)<\/MensajeIncidencia>/);
    throw new Error(`Finkok error ${codeMatch?.[1] || ''}: ${msgMatch?.[1] || 'Error desconocido'}`);
  }

  return tfdMatch ? tfdMatch[0] : null;
}

/**
 * Extrae el XML timbrado completo de la respuesta Finkok
 */
function extractXmlTimbrado(soapResponse) {
  const xmlMatch = soapResponse.match(/<xml>([^<]*(?:<(?!\/xml)[^<]*)*)<\/xml>/s) ||
                   soapResponse.match(/<stampResult>[\s\S]*?<xml>([\s\S]*?)<\/xml>/);
  if (xmlMatch) {
    const b64 = xmlMatch[1].trim();
    return Buffer.from(b64, 'base64').toString('utf8');
  }
  return null;
}

/**
 * Timba un CFDI con Finkok
 * @param {string} xmlCFDI     XML del CFDI firmado (con sello digital)
 * @param {object} config      { usuario, password, ambiente }
 * @returns {object}           { uuid, xmlTimbrado, tfd }
 */
async function timbraCFDI(xmlCFDI, config) {
  const { usuario, password, ambiente = 'pruebas' } = config;

  if (!usuario || !password) {
    throw new Error('Configuración PAC Finkok incompleta: se requiere usuario y password');
  }

  const xmlBase64 = Buffer.from(xmlCFDI, 'utf8').toString('base64');
  const endpoint  = ENDPOINTS[ambiente] || ENDPOINTS.pruebas;
  const soapBody  = buildStampSoap(xmlBase64, usuario, password);

  const response = await axios.post(
    endpoint.replace('.wsdl', ''),
    soapBody,
    {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction':   '"http://facturacion.finkok.com/servicios/stamp/stamp"',
      },
      timeout: 30000,
    }
  );

  const xmlTimbrado = extractXmlTimbrado(response.data);
  if (!xmlTimbrado) throw new Error('Finkok no devolvió XML timbrado');

  // Extraer UUID del TFD
  const uuidMatch = xmlTimbrado.match(/UUID="([^"]*)"/i);
  const uuid = uuidMatch ? uuidMatch[1] : null;

  return { uuid, xmlTimbrado, raw: response.data };
}

module.exports = { timbraCFDI };
