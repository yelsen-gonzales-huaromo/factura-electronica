/**
 * Chile SII — Envío de Documentos Tributarios Electrónicos (DTE)
 * Documentación: https://www.sii.cl/factura_electronica/
 *
 * Flujo:
 *   1. Obtener token SII (semilla + firma RSA-SHA1)
 *   2. Generar DTE con firma RSA-SHA1 (XMLDSig)
 *   3. Generar EnvioDTE (set de documentos)
 *   4. Enviar al SII por HTTP POST
 *   5. Consultar estado del envío con trackid
 *
 * URLs SII:
 *   Certificación: https://maullin.sii.cl/DTEWS/
 *   Producción:    https://palena.sii.cl/DTEWS/
 */
const axios = require('axios');

const WS_SII = {
  certificacion: {
    semilla:   'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
    token:     'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
    envio:     'https://maullin.sii.cl/cgi_dte/UPL/DTEUpload',
    consulta:  'https://maullin.sii.cl/DTEWS/QueryEstDteUpload.jws',
  },
  produccion: {
    semilla:   'https://palena.sii.cl/DTEWS/GetTokenFromSeed.jws',
    token:     'https://palena.sii.cl/DTEWS/GetTokenFromSeed.jws',
    envio:     'https://palena.sii.cl/cgi_dte/UPL/DTEUpload',
    consulta:  'https://palena.sii.cl/DTEWS/QueryEstDteUpload.jws',
  },
};

/**
 * Obtiene semilla del SII
 */
async function obtenerSemilla(ambiente = 'certificacion') {
  const url = WS_SII[ambiente]?.semilla || WS_SII.certificacion.semilla;
  const soap = `<?xml version="1.0"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP-ENV:Body><getSeed/></SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

  const res = await axios.post(url, soap, {
    headers: { 'Content-Type': 'text/xml' },
    timeout: 15000,
  });

  const semillaMatch = res.data.match(/<SEMILLA>([^<]*)<\/SEMILLA>/i) ||
                       res.data.match(/<semilla>([^<]*)<\/semilla>/i);

  if (!semillaMatch) throw new Error('SII: No se pudo obtener semilla');
  return semillaMatch[1].trim();
}

/**
 * Firma la semilla y obtiene token SII
 * La semilla se firma con RSA-SHA1 en un XML específico
 */
async function obtenerToken(semilla, certPem, keyPem, ambiente = 'certificacion') {
  const { signXmlChile } = require('../signing/xmlSigner');
  const url = WS_SII[ambiente]?.token || WS_SII.certificacion.token;

  // XML de semilla para firmar
  const semillaXml = `<?xml version="1.0"?>
<getToken>
  <item>
    <Semilla>${semilla}</Semilla>
  </item>
</getToken>`;

  // Firmar con RSA-SHA1 (requerido por SII)
  const semillaFirmada = signXmlChile(semillaXml, certPem, keyPem);
  const semillaB64 = Buffer.from(semillaFirmada, 'utf8').toString('base64');

  const soap = `<?xml version="1.0"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP-ENV:Body>
    <getToken>
      <pszXml>${semillaB64}</pszXml>
    </getToken>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

  const res = await axios.post(url, soap, {
    headers: { 'Content-Type': 'text/xml' },
    timeout: 15000,
  });

  const tokenMatch = res.data.match(/<TOKEN>([^<]*)<\/TOKEN>/i) ||
                     res.data.match(/<token>([^<]*)<\/token>/i);

  if (!tokenMatch) {
    const errMatch = res.data.match(/<DESCRIPCION>([^<]*)<\/DESCRIPCION>/i);
    throw new Error(`SII token error: ${errMatch?.[1] || 'No se pudo obtener token'}`);
  }

  return tokenMatch[1].trim();
}

/**
 * Construye el XML EnvioDTE (conjunto de DTEs)
 */
function buildEnvioDTE(dteFirmado, empresa, rutEnviador) {
  const now = new Date();
  const fmtDate = now.toISOString().slice(0, 10);
  const fmtTime = now.toISOString().slice(11, 19);

  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<EnvioDTE version="1.0"
  xmlns="http://www.sii.cl/SiiDte"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sii.cl/SiiDte EnvioDTE_v10.xsd">
  <SetDTE ID="SetDoc">
    <Caratula version="1.0">
      <RutEmisor>${empresa.identificacion_fiscal}</RutEmisor>
      <RutEnvia>${rutEnviador || empresa.identificacion_fiscal}</RutEnvia>
      <RutReceptor>60803000-K</RutReceptor>
      <FchResol>${fmtDate}</FchResol>
      <NroResol>0</NroResol>
      <TmstFirmaEnv>${fmtDate}T${fmtTime}</TmstFirmaEnv>
      <SubTotDTE>
        <TpoDTE>33</TpoDTE>
        <NroDTE>1</NroDTE>
      </SubTotDTE>
    </Caratula>
    ${dteFirmado}
  </SetDTE>
</EnvioDTE>`;
}

/**
 * Envía DTE al SII
 */
async function enviarDTE(envioDTE, rutEmpresa, token, ambiente = 'certificacion') {
  const url = WS_SII[ambiente]?.envio || WS_SII.certificacion.envio;

  // El SII espera multipart/form-data
  const FormData = require('form-data');
  const form = new FormData();
  form.append('rutSender', rutEmpresa.replace('-', ''));
  form.append('rutCompany', rutEmpresa.replace('-', ''));
  form.append('archivo', Buffer.from(envioDTE, 'utf8'), {
    filename: 'envio.xml',
    contentType: 'application/xml',
  });

  const res = await axios.post(url, form, {
    headers: {
      ...form.getHeaders(),
      'Cookie': `TOKEN=${token}`,
    },
    timeout: 45000,
  });

  const trackIdMatch = res.data.match(/TRACKID=(\d+)/i) ||
                       res.data.match(/<TRACKID>(\d+)<\/TRACKID>/i);
  const estadoMatch  = res.data.match(/ESTADO=([^&\s<]*)/i) ||
                       res.data.match(/<ESTADO>([^<]*)<\/ESTADO>/i);

  return {
    trackId: trackIdMatch ? trackIdMatch[1] : null,
    estado:  estadoMatch  ? estadoMatch[1]  : null,
    raw:     res.data,
  };
}

/**
 * Consulta el estado de un envío por trackId
 */
async function consultarEstado(rutEmpresa, trackId, token, ambiente = 'certificacion') {
  const url = WS_SII[ambiente]?.consulta || WS_SII.certificacion.consulta;

  const soap = `<?xml version="1.0"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP-ENV:Body>
    <getEstUp>
      <Rut>${rutEmpresa.split('-')[0]}</Rut>
      <Dv>${rutEmpresa.split('-')[1] || ''}</Dv>
      <TrackId>${trackId}</TrackId>
    </getEstUp>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

  const res = await axios.post(url, soap, {
    headers: {
      'Content-Type': 'text/xml',
      'Cookie': `TOKEN=${token}`,
    },
    timeout: 15000,
  });

  const estadoMatch = res.data.match(/<ESTADO>([^<]*)<\/ESTADO>/i);
  const glosaMatch  = res.data.match(/<GLOSA_ESTADO>([^<]*)<\/GLOSA_ESTADO>/i);

  return {
    trackId,
    estado:  estadoMatch ? estadoMatch[1].trim() : null,
    glosa:   glosaMatch  ? glosaMatch[1].trim()  : null,
    aceptado: estadoMatch?.[1]?.includes('EPR') || estadoMatch?.[1] === '0',
  };
}

/**
 * Flujo completo de envío al SII Chile
 * @param {string} dteXmlFirmado   DTE XML firmado con RSA-SHA1
 * @param {object} empresa         { identificacion_fiscal, ... }
 * @param {object} certConfig      { certPem, keyPem }
 * @param {string} ambiente        'certificacion' | 'produccion'
 * @returns {object}               { trackId, estado, glosa, aceptado }
 */
async function emitirChile(dteXmlFirmado, empresa, certConfig, ambiente = 'certificacion') {
  // 1. Obtener semilla y token SII
  const semilla = await obtenerSemilla(ambiente);
  const token   = await obtenerToken(semilla, certConfig.certPem, certConfig.keyPem, ambiente);

  // 2. Construir EnvioDTE
  const envioDTE = buildEnvioDTE(dteXmlFirmado, empresa, empresa.identificacion_fiscal);

  // 3. Enviar al SII
  const envio = await enviarDTE(envioDTE, empresa.identificacion_fiscal, token, ambiente);

  if (!envio.trackId) {
    throw new Error(`SII no devolvió trackId. Estado: ${envio.estado}`);
  }

  // 4. Consultar estado inicial
  await new Promise(r => setTimeout(r, 2000));
  const estadoEnvio = await consultarEstado(
    empresa.identificacion_fiscal,
    envio.trackId,
    token,
    ambiente
  );

  return {
    trackId:  envio.trackId,
    estado:   estadoEnvio.estado,
    glosa:    estadoEnvio.glosa,
    aceptado: estadoEnvio.aceptado,
    token,
  };
}

module.exports = { obtenerSemilla, obtenerToken, enviarDTE, consultarEstado, emitirChile };
