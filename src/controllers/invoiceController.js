const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { getAdapter } = require('../modules');

const STORAGE_XML = path.join(__dirname, '..', '..', 'storage', 'xml');
const STORAGE_PDF = path.join(__dirname, '..', '..', 'storage', 'pdf');
[STORAGE_XML, STORAGE_PDF].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ----------------------------- LIST -----------------------------
exports.list = async (req, res) => {
  try {
    const empresa_id = req.query.empresa_id || req.user.empresa_id;
    const { estado, fecha_desde, fecha_hasta, cliente_id } = req.query;

    let sql = `SELECT f.*, c.razon_social AS cliente_nombre, c.identificacion AS cliente_id_fiscal,
                      p.nombre AS pais, p.codigo AS pais_codigo
                 FROM facturas f
                 JOIN clientes c ON c.id = f.cliente_id
                 JOIN paises p ON p.id = f.pais_id
                WHERE f.empresa_id = ?`;
    const params = [empresa_id];

    if (estado)       { sql += ' AND f.estado = ?'; params.push(estado); }
    if (cliente_id)   { sql += ' AND f.cliente_id = ?'; params.push(cliente_id); }
    if (fecha_desde)  { sql += ' AND f.fecha_emision >= ?'; params.push(fecha_desde); }
    if (fecha_hasta)  { sql += ' AND f.fecha_emision <= ?'; params.push(fecha_hasta + ' 23:59:59'); }

    sql += ' ORDER BY f.fecha_emision DESC, f.id DESC LIMIT 500';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ----------------------------- GET -----------------------------
exports.get = async (req, res) => {
  try {
    const [facRows] = await pool.query(
      `SELECT f.*, c.razon_social AS cliente_nombre, c.identificacion AS cliente_identificacion,
              c.email AS cliente_email, c.direccion AS cliente_direccion, c.ciudad AS cliente_ciudad,
              c.codigo_postal AS cliente_cp, c.tipo_identificacion AS cliente_tipo_id,
              c.uso_cfdi AS cliente_uso_cfdi, c.regimen_fiscal AS cliente_regimen,
              e.razon_social AS empresa_nombre, e.identificacion_fiscal AS empresa_id_fiscal,
              e.direccion AS empresa_direccion, e.ciudad AS empresa_ciudad,
              p.nombre AS pais, p.codigo AS pais_codigo, p.autoridad_fiscal, p.moneda_simbolo
         FROM facturas f
         JOIN clientes c ON c.id = f.cliente_id
         JOIN empresas e ON e.id = f.empresa_id
         JOIN paises p ON p.id = f.pais_id
        WHERE f.id = ?`, [req.params.id]);
    if (!facRows.length) return res.status(404).json({ success: false, message: 'No encontrada' });

    const [items] = await pool.query(
      'SELECT * FROM factura_items WHERE factura_id = ? ORDER BY id', [req.params.id]);

    res.json({ success: true, data: { ...facRows[0], items } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ----------------------------- CREATE -----------------------------
exports.create = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const f = req.body;
    if (!f.empresa_id || !f.cliente_id || !f.items || !f.items.length) {
      conn.release();
      return res.status(400).json({ success: false, message: 'Datos incompletos' });
    }

    await conn.beginTransaction();

    // Obtener pais_id de la empresa
    const [emp] = await conn.query(
      `SELECT e.*, p.codigo AS pais_codigo, p.moneda_codigo
         FROM empresas e JOIN paises p ON p.id = e.pais_id WHERE e.id = ?`,
      [f.empresa_id]);
    if (!emp.length) throw new Error('Empresa no encontrada');
    const empresa = emp[0];

    // Folio siguiente
    const tipoDoc = f.tipo_documento || 'factura';
    let serie = f.serie;
    if (!serie) {
      const [s] = await conn.query(
        'SELECT serie FROM series_documentos WHERE empresa_id=? AND tipo_documento=? AND activo=1 LIMIT 1',
        [f.empresa_id, tipoDoc]);
      if (!s.length) throw new Error(`No hay serie configurada para ${tipoDoc}`);
      serie = s[0].serie;
    }

    const [serieRows] = await conn.query(
      `SELECT * FROM series_documentos
        WHERE empresa_id=? AND tipo_documento=? AND serie=? AND activo=1 FOR UPDATE`,
      [f.empresa_id, tipoDoc, serie]);
    if (!serieRows.length) throw new Error('Serie no configurada');
    const folio = (serieRows[0].folio_actual || 0) + 1;

    // Cálculo de totales
    let subtotal = 0, total_iva = 0, total_ieps = 0, descuento = 0;
    const itemsCalc = f.items.map(it => {
      const cant = Number(it.cantidad);
      const pu   = Number(it.precio_unitario);
      const desc = Number(it.descuento || 0);
      const importe = +(cant * pu - desc).toFixed(2);
      const iva_monto  = +(importe * (Number(it.iva_porcentaje || 0) / 100)).toFixed(2);
      const ieps_monto = +(importe * (Number(it.ieps_porcentaje || 0) / 100)).toFixed(2);
      const total      = +(importe + iva_monto + ieps_monto).toFixed(2);
      subtotal  += importe;
      total_iva += iva_monto;
      total_ieps+= ieps_monto;
      descuento += desc;
      return { ...it, importe, iva_monto, ieps_monto, total };
    });

    const total = +(subtotal + total_iva + total_ieps).toFixed(2);

    // Insertar factura
    const [r] = await conn.query(
      `INSERT INTO facturas (empresa_id, cliente_id, pais_id, tipo_documento, serie, folio,
        fecha_emision, fecha_vencimiento, moneda, tipo_cambio, forma_pago, metodo_pago,
        condiciones_pago, uso_cfdi, lugar_expedicion, subtotal, descuento, total_iva,
        total_ieps, total, estado, observaciones, usuario_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [f.empresa_id, f.cliente_id, empresa.pais_id, tipoDoc, serie, folio,
       f.fecha_emision || new Date(), f.fecha_vencimiento || null,
       f.moneda || empresa.moneda_codigo, f.tipo_cambio || 1,
       f.forma_pago || '01', f.metodo_pago || 'PUE',
       f.condiciones_pago || 'Contado', f.uso_cfdi || null,
       f.lugar_expedicion || empresa.codigo_postal,
       subtotal, descuento, total_iva, total_ieps, total,
       f.estado || 'borrador', f.observaciones || null, req.user.id]
    );
    const facturaId = r.insertId;

    // Insertar items
    for (const it of itemsCalc) {
      await conn.query(
        `INSERT INTO factura_items (factura_id, producto_id, codigo, descripcion,
           unidad_medida, cantidad, precio_unitario, descuento, iva_porcentaje, iva_monto,
           ieps_porcentaje, ieps_monto, importe, total)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [facturaId, it.producto_id || null, it.codigo || null, it.descripcion,
         it.unidad_medida || 'PZA', it.cantidad, it.precio_unitario, it.descuento || 0,
         it.iva_porcentaje || 0, it.iva_monto, it.ieps_porcentaje || 0, it.ieps_monto,
         it.importe, it.total]
      );
    }

    // Actualizar folio
    await conn.query(
      'UPDATE series_documentos SET folio_actual = ? WHERE id = ?',
      [folio, serieRows[0].id]);

    await conn.commit();
    conn.release();

    res.status(201).json({ success: true, id: facturaId, serie, folio });
  } catch (err) {
    await conn.rollback(); conn.release();
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ----------------------------- EMITIR (modo dual: simulado / producción) -----------------------------
exports.emitir = async (req, res) => {
  try {
    const id = req.params.id;
    const [facRows] = await pool.query(
      `SELECT f.*, p.codigo AS pais_codigo, p.autoridad_fiscal
         FROM facturas f JOIN paises p ON p.id = f.pais_id WHERE f.id = ?`, [id]);
    if (!facRows.length) return res.status(404).json({ success: false, message: 'No encontrada' });

    const factura = facRows[0];
    if (factura.estado !== 'borrador')
      return res.status(400).json({ success: false, message: 'Solo se pueden emitir facturas en borrador' });

    const [empRows] = await pool.query('SELECT * FROM empresas WHERE id = ?', [factura.empresa_id]);
    const [cliRows] = await pool.query('SELECT * FROM clientes WHERE id = ?', [factura.cliente_id]);
    const [items]   = await pool.query('SELECT * FROM factura_items WHERE factura_id=? ORDER BY id', [id]);
    const empresa = empRows[0], cliente = cliRows[0];

    const adapter = getAdapter(factura.pais_codigo);
    const params  = { empresa, cliente, factura, items };

    // ── Detectar modo de emisión ──────────────────────────────────────────────
    const modoProduccion = empresa.modo_emision === 'produccion' &&
                           (empresa.certificado_path || empresa.llave_privada_path);

    let uuid, xml, xmlTimbrado, modoUsado, extraInfo = {};

    if (modoProduccion && adapter.emitirProduccion) {
      // ── MODO PRODUCCIÓN ─────────────────────────────────────────────────────
      modoUsado = 'produccion';

      const certMgr = require('../modules/signing/certificateManager');
      const certConfig = {
        p12Path:     empresa.certificado_path  ? certMgr.getCertPath(empresa.id, path.basename(empresa.certificado_path)) : null,
        cerPath:     empresa.certificado_path  ? certMgr.getCertPath(empresa.id, path.basename(empresa.certificado_path)) : null,
        keyPath:     empresa.llave_privada_path ? certMgr.getCertPath(empresa.id, path.basename(empresa.llave_privada_path)) : null,
        password:    empresa.certificado_password,
        noCertificado: empresa.no_certificado,
        // PAC / configuración adicional
        softwareId:  empresa.pac_usuario,
        softwarePin: empresa.pac_password,
        sunatUsuario: empresa.pac_usuario,
        sunatPassword: empresa.pac_password,
      };

      // Para México: incluir config PAC
      const pacConfig = {
        proveedor: empresa.pac_proveedor || 'finkok',
        usuario:   empresa.pac_usuario,
        password:  empresa.pac_password,
        ambiente:  empresa.ambiente || 'pruebas',
      };

      let resultado;
      if (factura.pais_codigo === 'MX') {
        resultado = await adapter.emitirProduccion(params, certConfig, pacConfig);
        uuid        = resultado.uuid;
        xml         = resultado.xmlFirmado;
        xmlTimbrado = resultado.xmlTimbrado;
        extraInfo   = {
          sello:         resultado.sello,
          no_certificado: resultado.noCertificado,
          cadena_original: resultado.cadenaOriginal,
        };
      } else {
        resultado   = await adapter.emitirProduccion(params, certConfig);
        uuid        = resultado.uuid || resultado.claveAcceso || resultado.trackId;
        xml         = resultado.xmlFirmado || resultado.xmlAutorizado;
        xmlTimbrado = resultado.xmlAutorizado || resultado.xmlFirmado;
        extraInfo   = {
          numero_autorizacion: resultado.numeroAutorizacion,
          fecha_autorizacion:  resultado.fechaAutorizacion,
          cufe:  resultado.cufe,
          track_id: resultado.trackId,
          cdr_base64: resultado.cdrBase64,
          valido: resultado.valido,
        };
      }

      // Registrar log de emisión
      await pool.query(
        `INSERT INTO emision_log
           (factura_id, empresa_id, pais_codigo, autoridad, modo, estado, uuid_fiscal, pac_proveedor, respuesta_codigo, respuesta_mensaje)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id, factura.empresa_id, factura.pais_codigo, factura.autoridad_fiscal,
         'produccion', 'aceptado', uuid,
         empresa.pac_proveedor || 'directo',
         extraInfo.valido !== undefined ? (extraInfo.valido ? '200' : '400') : '200',
         'Emitido en modo producción']
      );

    } else {
      // ── MODO SIMULADO (fallback o sin certificado) ───────────────────────────
      modoUsado = 'simulado';
      uuid = adapter.generarUUID(factura, empresa);
      xml  = adapter.generarXML(params);
      xmlTimbrado = xml;
    }

    // ── Guardar XML principal ─────────────────────────────────────────────────
    const uuidShort  = String(uuid || 'SIM').replace(/[^A-Z0-9\-]/gi, '').substring(0, 36);
    const fiscalId   = empresa.identificacion_fiscal.replace(/[^A-Z0-9]/gi, '');
    const filename   = `${fiscalId}_${factura.serie}_${factura.folio}_${uuidShort.substring(0, 8)}.xml`;
    const xmlPath    = path.join(STORAGE_XML, filename);
    fs.writeFileSync(xmlPath, xml, 'utf8');

    // Guardar XML timbrado/autorizado si es diferente
    let xmlTimbradoPath = null;
    if (xmlTimbrado && xmlTimbrado !== xml) {
      const filenameTim = `${fiscalId}_${factura.serie}_${factura.folio}_${uuidShort.substring(0,8)}_timbrado.xml`;
      const xmlTimPath  = path.join(STORAGE_XML, filenameTim);
      fs.writeFileSync(xmlTimPath, xmlTimbrado, 'utf8');
      xmlTimbradoPath = `/storage/xml/${filenameTim}`;
    }

    // ── Actualizar factura ────────────────────────────────────────────────────
    await pool.query(
      `UPDATE facturas
          SET uuid=?, xml_path=?, xml_timbrado_path=?,
              estado='emitida', fecha_timbrado=NOW()
        WHERE id=?`,
      [uuid, `/storage/xml/${filename}`, xmlTimbradoPath, id]);

    // ── Auditoría ─────────────────────────────────────────────────────────────
    await pool.query(
      `INSERT INTO auditoria
         (usuario_id, empresa_id, accion, entidad, entidad_id, detalles, ip)
       VALUES (?,?,?,?,?,?,?)`,
      [req.user.id, factura.empresa_id, 'EMITIR', 'factura', id,
       `${factura.serie}-${factura.folio} → ${factura.autoridad_fiscal} [${modoUsado}]`, req.ip]);

    res.json({
      success:           true,
      uuid,
      xml_path:          `/storage/xml/${filename}`,
      xml_timbrado_path: xmlTimbradoPath,
      estado:            'emitida',
      modo:              modoUsado,
      message:           `Factura emitida (${factura.autoridad_fiscal} - modo ${modoUsado})`,
      ...extraInfo,
    });
  } catch (err) {
    console.error('[EMITIR]', err);
    // Si falla en producción, registrar el error
    try {
      const [fRows] = await pool.query('SELECT empresa_id, pais_codigo FROM facturas WHERE id=?', [req.params.id]);
      if (fRows.length) {
        await pool.query(
          `INSERT INTO emision_log
             (factura_id, empresa_id, pais_codigo, autoridad, modo, estado, respuesta_mensaje)
           VALUES (?,?,?,'DESCONOCIDO','produccion','error',?)`,
          [req.params.id, fRows[0].empresa_id, fRows[0].pais_codigo, err.message]
        );
      }
    } catch(_) {}
    res.status(500).json({ success: false, message: err.message });
  }
};

// ----------------------------- CANCELAR -----------------------------
exports.cancelar = async (req, res) => {
  try {
    const { motivo } = req.body;
    await pool.query(
      `UPDATE facturas SET estado='cancelada', motivo_cancelacion=? WHERE id=?`,
      [motivo || 'Solicitud del usuario', req.params.id]);
    await pool.query(
      'INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalles, ip) VALUES (?,?,?,?,?,?)',
      [req.user.id, 'CANCELAR', 'factura', req.params.id, motivo || 'Sin motivo', req.ip]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ----------------------------- DESCARGAR XML -----------------------------
exports.descargarXML = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT xml_path FROM facturas WHERE id=?', [req.params.id]);
    if (!rows.length || !rows[0].xml_path)
      return res.status(404).json({ success: false, message: 'XML no disponible' });
    const fullPath = path.join(__dirname, '..', '..', rows[0].xml_path);
    if (!fs.existsSync(fullPath))
      return res.status(404).json({ success: false, message: 'Archivo no encontrado' });
    res.download(fullPath);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
