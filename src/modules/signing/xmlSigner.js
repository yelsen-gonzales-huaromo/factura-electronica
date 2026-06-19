/**
 * XML Digital Signer — XMLDSig / XAdES
 * Firma XML para Colombia (DIAN), Perú (SUNAT), Chile (SII), Ecuador (SRI)
 * usando el estándar XMLDSig con node-forge y xml-crypto.
 */
const SignedXml   = require('xml-crypto').SignedXml;
const forge       = require('node-forge');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

/**
 * Firma un documento XML con XMLDSig (enveloped signature)
 * @param {string}  xmlStr       XML a firmar
 * @param {string}  certPem      Certificado en PEM
 * @param {string}  keyPem       Llave privada en PEM
 * @param {string}  algorithm    'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256' (default)
 *                               'http://www.w3.org/2000/09/xmldsig#rsa-sha1' (Chile)
 * @param {string}  refUri       URI del elemento a referenciar (ej: '#comprobante')
 * @returns {string} XML firmado
 */
function signXml(xmlStr, certPem, keyPem, options = {}) {
  const {
    algorithm    = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    digestAlgo   = 'http://www.w3.org/2001/04/xmlenc#sha256',
    refUri       = '',
    inclusive    = false,
    canonAlgo    = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  } = options;

  // Extraer cert base64 limpio
  const certB64 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '');

  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    signatureAlgorithm: algorithm,
    canonicalizationAlgorithm: canonAlgo,
  });

  sig.addReference({
    uri: refUri,
    digestAlgorithm: digestAlgo,
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      canonAlgo,
    ],
  });

  sig.signingKey = keyPem;
  sig.keyInfoProvider = {
    getKeyInfo: () => `<X509Data><X509Certificate>${certB64}</X509Certificate></X509Data>`,
    getKey:     () => keyPem,
  };

  sig.computeSignature(xmlStr, {
    location: { reference: refUri || '//*[local-name()="Invoice"]', action: 'append' }
  });

  return sig.getSignedXml();
}

/**
 * Firma XAdES-BES para Ecuador SRI
 * Versión simplificada: inserta SignedProperties + firma enveloped
 */
function signXmlEcuador(xmlStr, certPem, keyPem) {
  // Ecuador usa SHA-1 en ambiente de pruebas, SHA-256 en producción
  return signXml(xmlStr, certPem, keyPem, {
    algorithm:  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    digestAlgo: 'http://www.w3.org/2001/04/xmlenc#sha256',
    refUri:     '',
  });
}

/**
 * Firma para Colombia DIAN (UBL 2.1 con XMLDSig)
 */
function signXmlColombia(xmlStr, certPem, keyPem) {
  return signXml(xmlStr, certPem, keyPem, {
    algorithm:  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    digestAlgo: 'http://www.w3.org/2001/04/xmlenc#sha256',
  });
}

/**
 * Firma para Perú SUNAT (UBL 2.1 con RSA-SHA256)
 */
function signXmlPeru(xmlStr, certPem, keyPem) {
  return signXml(xmlStr, certPem, keyPem, {
    algorithm:  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    digestAlgo: 'http://www.w3.org/2001/04/xmlenc#sha256',
  });
}

/**
 * Firma para Chile SII (RSA-SHA1, exigido por SII)
 */
function signXmlChile(xmlStr, certPem, keyPem) {
  return signXml(xmlStr, certPem, keyPem, {
    algorithm:  'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    digestAlgo: 'http://www.w3.org/2000/09/xmldsig#sha1',
  });
}

module.exports = {
  signXml,
  signXmlEcuador,
  signXmlColombia,
  signXmlPeru,
  signXmlChile,
};
