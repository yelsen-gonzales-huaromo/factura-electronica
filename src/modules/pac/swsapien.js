/**
 * PAC SW Sapien — México
 * Timbrado de CFDI usando la API REST de SW Sapien (stamp.mx)
 * Documentación: https://developers.sw.com.mx/
 *
 * Ventaja: Ofrece cuentas gratuitas para desarrollo y tiene API REST (no SOAP).
 *
 * Ambientes:
 *   Demo:       https://services.test.sw.com.mx
 *   Producción: https://services.sw.com.mx
 */
const axios = require('axios');

const ENDPOINTS = {
  pruebas:    'https://services.test.sw.com.mx',
  produccion: 'https://services.sw.com.mx',
};

/**
 * Autentica con SW Sapien y obtiene token temporal
 * @param {object} config { usuario, password, ambiente }
 * @returns {string} token JWT de SW
 */
async function authenticate(config) {
  const { usuario, password, ambiente = 'pruebas' } = config;
  const base = ENDPOINTS[ambiente] || ENDPOINTS.pruebas;

  const res = await axios.get(`${base}/security/authenticate`, {
    auth: { username: usuario, password },
    timeout: 15000,
  });

  if (res.data.status !== 'success') {
    throw new Error(`SW Sapien auth error: ${res.data.message}`);
  }
  return res.data.data.token;
}

/**
 * Timba un CFDI usando SW Sapien con token directo del usuario
 * (modalidad token de usuario)
 * @param {string} xmlCFDI   XML del CFDI firmado
 * @param {object} config    { token, ambiente } o { usuario, password, ambiente }
 * @returns {object}         { uuid, xmlTimbrado, qrCode, cadenaOriginalSAT, noCertificadoSAT, selloSAT }
 */
async function timbraCFDI(xmlCFDI, config) {
  const { ambiente = 'pruebas' } = config;
  const base = ENDPOINTS[ambiente] || ENDPOINTS.pruebas;

  // Obtener token
  let swToken = config.token;
  if (!swToken && config.usuario && config.password) {
    swToken = await authenticate(config);
  }
  if (!swToken) throw new Error('SW Sapien: se requiere token o credenciales');

  // Timbrado v4 — acepta XML sin sello (SW lo firma internamente si se configura)
  const res = await axios.post(
    `${base}/cfdi33/stamp/v4`,
    xmlCFDI,
    {
      headers: {
        'Content-Type':  'application/xml',
        'Authorization': `Bearer ${swToken}`,
      },
      timeout: 30000,
    }
  );

  const d = res.data;
  if (d.status !== 'success') {
    const err = d.errors?.[0];
    throw new Error(`SW Sapien timbrado error ${err?.codeError || ''}: ${err?.moreInfo || d.message}`);
  }

  const xmlTimbrado = d.data?.cfdi || d.data?.xml;
  const uuidMatch   = xmlTimbrado?.match(/UUID="([^"]*)"/i);

  return {
    uuid:                 uuidMatch?.[1],
    xmlTimbrado,
    qrCode:               d.data?.qr,
    cadenaOriginalSAT:    d.data?.cadenaOriginalSAT,
    noCertificadoSAT:     d.data?.noCertificadoSAT,
    selloSAT:             d.data?.selloSAT,
  };
}

module.exports = { timbraCFDI, authenticate };
