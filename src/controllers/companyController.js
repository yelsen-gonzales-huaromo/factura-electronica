const { pool }  = require('../config/db');
const path       = require('path');
const fs         = require('fs');
const certMgr    = require('../modules/signing/certificateManager');

exports.list = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT e.*, p.nombre AS pais, p.codigo AS pais_codigo, p.moneda_codigo, p.autoridad_fiscal
         FROM empresas e
         JOIN paises p ON p.id = e.pais_id
         JOIN usuario_empresa ue ON ue.empresa_id = e.id
        WHERE ue.usuario_id = ? AND e.activo = 1
        ORDER BY e.razon_social`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.get = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT e.*, p.nombre AS pais, p.codigo AS pais_codigo, p.moneda_codigo, p.autoridad_fiscal
         FROM empresas e JOIN paises p ON p.id = e.pais_id
        WHERE e.id = ?`,
      [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'No encontrado' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const e = req.body;
    const [r] = await pool.query(
      `INSERT INTO empresas (pais_id, identificacion_fiscal, razon_social, nombre_comercial,
        direccion, ciudad, estado_provincia, codigo_postal, telefono, email, regimen_fiscal,
        ambiente, pac_proveedor, pac_usuario)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [e.pais_id, e.identificacion_fiscal, e.razon_social, e.nombre_comercial || null,
       e.direccion || null, e.ciudad || null, e.estado_provincia || null, e.codigo_postal || null,
       e.telefono || null, e.email || null, e.regimen_fiscal || null,
       e.ambiente || 'pruebas', e.pac_proveedor || null, e.pac_usuario || null]
    );
    // Asociar al usuario
    await pool.query(
      'INSERT INTO usuario_empresa (usuario_id, empresa_id, es_principal) VALUES (?, ?, 0)',
      [req.user.id, r.insertId]);
    res.status(201).json({ success: true, id: r.insertId });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.update = async (req, res) => {
  try {
    const e = req.body;
    await pool.query(
      `UPDATE empresas SET razon_social=?, nombre_comercial=?, direccion=?, ciudad=?,
         estado_provincia=?, codigo_postal=?, telefono=?, email=?, regimen_fiscal=?,
         ambiente=?, pac_proveedor=?, pac_usuario=?
       WHERE id = ?`,
      [e.razon_social, e.nombre_comercial || null, e.direccion || null, e.ciudad || null,
       e.estado_provincia || null, e.codigo_postal || null, e.telefono || null, e.email || null,
       e.regimen_fiscal || null, e.ambiente || 'pruebas',
       e.pac_proveedor || null, e.pac_usuario || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ─── CONFIGURACIÓN PAC / CERTIFICADO ─────────────────────────────────────────

/**
 * GET /api/companies/:id/certificado
 * Retorna el estado del certificado de la empresa (sin datos sensibles)
 */
exports.getCertificado = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, certificado_path, llave_privada_path, no_certificado,
              cert_vencimiento, pac_proveedor, pac_usuario, modo_emision, ambiente
         FROM empresas WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'No encontrado' });

    const emp = rows[0];
    const estado = {
      tiene_certificado:    !!emp.certificado_path,
      tiene_llave_privada:  !!emp.llave_privada_path,
      no_certificado:       emp.no_certificado,
      cert_vencimiento:     emp.cert_vencimiento,
      pac_proveedor:        emp.pac_proveedor,
      pac_usuario:          emp.pac_usuario,
      modo_emision:         emp.modo_emision || 'simulado',
      ambiente:             emp.ambiente,
    };

    // Si hay certificado, leer info adicional
    if (emp.certificado_path) {
      try {
        const certPath = certMgr.getCertPath(req.params.id, path.basename(emp.certificado_path));
        if (fs.existsSync(certPath)) {
          const cert = certMgr.loadCer(certPath);
          const forge = require('node-forge');
          const validity = cert.validity;
          estado.cert_sujeto       = cert.subject?.getField('CN')?.value;
          estado.cert_emisor       = cert.issuer?.getField('CN')?.value;
          estado.cert_valido_desde = validity?.notBefore;
          estado.cert_valido_hasta = validity?.notAfter;
          estado.cert_vencido      = validity?.notAfter < new Date();
        }
      } catch(_) {}
    }

    res.json({ success: true, data: estado });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/**
 * POST /api/companies/:id/certificado
 * Sube certificado digital (P12/PFX o CER+KEY) y configura PAC
 * Content-Type: multipart/form-data
 * Campos:
 *   - certificado: archivo .p12 / .pfx / .cer
 *   - llave_privada: archivo .key (si no es P12)
 *   - password: contraseña del certificado
 *   - pac_proveedor: finkok | sw_sapien | dian | sunat | sii | sri
 *   - pac_usuario: usuario del PAC
 *   - pac_password: contraseña del PAC
 *   - no_certificado: número de certificado (México)
 */
exports.uploadCertificado = async (req, res) => {
  try {
    const empresaId = req.params.id;
    const { password, pac_proveedor, pac_usuario, pac_password, no_certificado } = req.body;

    const updates = {};

    // Guardar certificado principal (P12 o CER)
    if (req.files?.certificado?.[0]) {
      const file = req.files.certificado[0];
      const savedPath = certMgr.saveCertFile(empresaId, file.originalname, file.buffer);
      updates.certificado_path       = savedPath;
      if (password) updates.certificado_password = password;
    }

    // Guardar llave privada (.key)
    if (req.files?.llave_privada?.[0]) {
      const file = req.files.llave_privada[0];
      const savedPath = certMgr.saveCertFile(empresaId, file.originalname, file.buffer);
      updates.llave_privada_path = savedPath;
    }

    // Datos PAC
    if (pac_proveedor) updates.pac_proveedor = pac_proveedor;
    if (pac_usuario)   updates.pac_usuario   = pac_usuario;
    if (pac_password)  updates.pac_password  = pac_password;
    if (no_certificado) updates.no_certificado = no_certificado;

    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, message: 'No se recibieron archivos ni datos' });
    }

    // Validar certificado si se subió
    if (updates.certificado_path) {
      try {
        const certPath = certMgr.getCertPath(empresaId, path.basename(updates.certificado_path));
        const ext = path.extname(updates.certificado_path).toLowerCase();
        let certInfo = {};

        if (['.p12', '.pfx'].includes(ext)) {
          const p12 = certMgr.loadP12(certPath, password);
          certInfo.no_certificado = certMgr.getCertificadoNumero(p12.certificate) || no_certificado;
          certInfo.cert_vencimiento = p12.certificate?.validity?.notAfter;
        } else if (['.cer', '.crt', '.pem'].includes(ext)) {
          const cert = certMgr.loadCer(certPath);
          certInfo.no_certificado = certMgr.getCertificadoNumero(cert) || no_certificado;
          certInfo.cert_vencimiento = cert?.validity?.notAfter;
        }

        if (certInfo.no_certificado) updates.no_certificado = certInfo.no_certificado;
        if (certInfo.cert_vencimiento) updates.cert_vencimiento = certInfo.cert_vencimiento;
      } catch (certErr) {
        console.warn('[CERT WARNING]', certErr.message);
        // No fallar si no se puede validar, solo guardar
      }
    }

    // Construir SET dinámico
    const setClauses = Object.keys(updates).map(k => `${k}=?`).join(', ');
    const setValues  = Object.values(updates);
    setValues.push(empresaId);

    await pool.query(`UPDATE empresas SET ${setClauses} WHERE id=?`, setValues);

    res.json({
      success: true,
      message: 'Certificado configurado correctamente',
      campos_actualizados: Object.keys(updates),
    });
  } catch (err) {
    console.error('[CERTIFICADO]', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/companies/:id/modo-emision
 * Activa/desactiva modo producción
 * Body: { modo_emision: 'simulado' | 'produccion' }
 */
exports.setModoEmision = async (req, res) => {
  try {
    const { modo_emision } = req.body;
    if (!['simulado', 'produccion'].includes(modo_emision)) {
      return res.status(400).json({ success: false, message: 'Modo inválido. Use: simulado | produccion' });
    }

    // Verificar que tenga certificado si quiere activar producción
    if (modo_emision === 'produccion') {
      const [rows] = await pool.query(
        'SELECT certificado_path FROM empresas WHERE id=?', [req.params.id]);
      if (!rows[0]?.certificado_path) {
        return res.status(400).json({
          success: false,
          message: 'Debe cargar un certificado digital antes de activar modo producción'
        });
      }
    }

    await pool.query(
      'UPDATE empresas SET modo_emision=? WHERE id=?',
      [modo_emision, req.params.id]);

    res.json({
      success: true,
      modo_emision,
      message: `Modo ${modo_emision} activado correctamente`
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/**
 * DELETE /api/companies/:id/certificado
 * Elimina el certificado (vuelve a modo simulado)
 */
exports.deleteCertificado = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT certificado_path, llave_privada_path FROM empresas WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'No encontrado' });

    // Eliminar archivos físicos
    for (const field of ['certificado_path', 'llave_privada_path']) {
      if (rows[0][field]) {
        try {
          const certPath = certMgr.getCertPath(req.params.id, path.basename(rows[0][field]));
          if (fs.existsSync(certPath)) fs.unlinkSync(certPath);
        } catch(_) {}
      }
    }

    await pool.query(
      `UPDATE empresas
          SET certificado_path=NULL, llave_privada_path=NULL,
              certificado_password=NULL, no_certificado=NULL,
              cert_vencimiento=NULL, modo_emision='simulado'
        WHERE id=?`,
      [req.params.id]);

    res.json({ success: true, message: 'Certificado eliminado. Modo simulado activado.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.remove = async (req, res) => {
  try {
    await pool.query('UPDATE empresas SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getSeries = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM series_documentos WHERE empresa_id = ? AND activo = 1',
      [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
