/**
 * Certificate Manager
 * Carga, valida y gestiona certificados digitales (.cer/.key/.p12/.pfx)
 * para firma de documentos fiscales por país.
 */
const forge   = require('node-forge');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const CERTS_DIR = path.join(__dirname, '..', '..', '..', 'storage', 'certs');
if (!fs.existsSync(CERTS_DIR)) fs.mkdirSync(CERTS_DIR, { recursive: true });

/**
 * Carga un P12/PFX y extrae certificado + llave privada
 * @param {string} p12Path   Ruta al archivo .p12 / .pfx
 * @param {string} password  Contraseña del P12
 * @returns {{ privateKey, certificate, certPem, keyPem, serialNumber, notAfter }}
 */
function loadP12(p12Path, password = '') {
  const p12Buffer = fs.readFileSync(p12Path);
  const p12Der    = forge.util.createBuffer(p12Buffer.toString('binary'));
  const p12Asn1   = forge.asn1.fromDer(p12Der);
  const p12       = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  let privateKey  = null;
  let certificate = null;

  for (const safeContent of p12.safeContents) {
    for (const safeBag of safeContent.safeBags) {
      if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag ||
          safeBag.type === forge.pki.oids.keyBag) {
        privateKey = safeBag.key;
      }
      if (safeBag.type === forge.pki.oids.certBag) {
        if (!certificate) certificate = safeBag.cert;
      }
    }
  }

  if (!privateKey || !certificate) {
    throw new Error('No se pudo extraer la clave privada o el certificado del P12');
  }

  const certPem = forge.pki.certificateToPem(certificate);
  const keyPem  = forge.pki.privateKeyToPem(privateKey);

  return {
    privateKey,
    certificate,
    certPem,
    keyPem,
    serialNumber: certificate.serialNumber,
    notAfter:     certificate.validity.notAfter,
    subject:      certificate.subject.getField('CN')?.value || '',
  };
}

/**
 * Carga un .cer (DER o PEM) y retorna el objeto certificado
 */
function loadCer(cerPath) {
  const buf = fs.readFileSync(cerPath);
  // Intentar como PEM primero
  if (buf.toString().includes('-----BEGIN')) {
    return forge.pki.certificateFromPem(buf.toString());
  }
  // DER binario → convertir
  const der   = forge.util.createBuffer(buf.toString('binary'));
  const asn1  = forge.asn1.fromDer(der);
  return forge.pki.certificateFromAsn1(asn1);
}

/**
 * Carga una llave privada .key (DER o PEM, protegida o no)
 * @param {string} keyPath
 * @param {string} password  Contraseña si está encriptada
 */
function loadKey(keyPath, password = '') {
  const buf = fs.readFileSync(keyPath);
  if (buf.toString().includes('-----BEGIN')) {
    if (password) return forge.pki.decryptRsaPrivateKey(buf.toString(), password);
    return forge.pki.privateKeyFromPem(buf.toString());
  }
  // DER cifrado — descifrar
  const der    = forge.util.createBuffer(buf.toString('binary'));
  const asn1   = forge.asn1.fromDer(der);
  if (password) {
    const decrypted = forge.pki.decryptPrivateKeyInfo(asn1, password);
    return forge.pki.privateKeyFromAsn1(decrypted);
  }
  return forge.pki.privateKeyFromAsn1(asn1);
}

/**
 * Firma con RSA-SHA256 y retorna base64
 */
function signSHA256(data, privateKey) {
  const md = forge.md.sha256.create();
  md.update(data, 'utf8');
  const sig = privateKey.sign(md);
  return forge.util.encode64(sig);
}

/**
 * Firma con RSA-SHA1 y retorna base64 (Chile SII)
 */
function signSHA1(data, privateKey) {
  const md = forge.md.sha1.create();
  md.update(data, 'utf8');
  const sig = privateKey.sign(md);
  return forge.util.encode64(sig);
}

/**
 * Extrae el número de serie del certificado como lo usa el SAT (solo dígitos)
 */
function getCertificadoNumero(certificate) {
  const serial = certificate.serialNumber;
  // El SAT usa los bytes del serial convertidos a decimal
  const buf = Buffer.from(serial, 'hex');
  return buf.toString('ascii').replace(/[^0-9]/g, '').padStart(20, '0').slice(-20);
}

/**
 * Convierte certificado a base64 sin saltos de línea (SAT MX)
 */
function certToBase64(certificate) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
  return forge.util.encode64(der);
}

/**
 * Guarda un archivo de certificado en storage/certs/{empresaId}/
 */
function saveCertFile(empresaId, filename, buffer) {
  const dir = path.join(CERTS_DIR, String(empresaId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, filename);
  fs.writeFileSync(dest, buffer);
  return dest;
}

/**
 * Retorna la ruta de un certificado guardado
 */
function getCertPath(empresaId, filename) {
  return path.join(CERTS_DIR, String(empresaId), filename);
}

module.exports = {
  loadP12,
  loadCer,
  loadKey,
  signSHA256,
  signSHA1,
  getCertificadoNumero,
  certToBase64,
  saveCertFile,
  getCertPath,
  CERTS_DIR,
};
