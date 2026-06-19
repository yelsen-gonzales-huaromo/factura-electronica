const { pool } = require('../config/db');

exports.list = async (req, res) => {
  try {
    const empresa_id = req.query.empresa_id || req.user.empresa_id;
    const search = req.query.search || '';
    const [rows] = await pool.query(
      `SELECT c.*, p.nombre AS pais, p.codigo AS pais_codigo
         FROM clientes c JOIN paises p ON p.id = c.pais_id
        WHERE c.empresa_id = ? AND c.activo = 1
          AND (c.razon_social LIKE ? OR c.identificacion LIKE ? OR c.email LIKE ?)
        ORDER BY c.razon_social`,
      [empresa_id, `%${search}%`, `%${search}%`, `%${search}%`]
    );
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.get = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, p.nombre AS pais FROM clientes c
         JOIN paises p ON p.id = c.pais_id WHERE c.id = ?`,
      [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'No encontrado' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const c = req.body;
    const [r] = await pool.query(
      `INSERT INTO clientes (empresa_id, pais_id, tipo_identificacion, identificacion,
         tipo_persona, razon_social, nombre_comercial, email, telefono, direccion,
         ciudad, estado_provincia, codigo_postal, uso_cfdi, regimen_fiscal)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [c.empresa_id, c.pais_id, c.tipo_identificacion, c.identificacion,
       c.tipo_persona || 'fisica', c.razon_social, c.nombre_comercial || null,
       c.email || null, c.telefono || null, c.direccion || null,
       c.ciudad || null, c.estado_provincia || null, c.codigo_postal || null,
       c.uso_cfdi || null, c.regimen_fiscal || null]
    );
    res.status(201).json({ success: true, id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ success: false, message: 'Cliente ya existe' });
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const c = req.body;
    await pool.query(
      `UPDATE clientes SET tipo_identificacion=?, identificacion=?, tipo_persona=?,
         razon_social=?, nombre_comercial=?, email=?, telefono=?, direccion=?,
         ciudad=?, estado_provincia=?, codigo_postal=?, uso_cfdi=?, regimen_fiscal=?
       WHERE id = ?`,
      [c.tipo_identificacion, c.identificacion, c.tipo_persona || 'fisica',
       c.razon_social, c.nombre_comercial || null, c.email || null, c.telefono || null,
       c.direccion || null, c.ciudad || null, c.estado_provincia || null,
       c.codigo_postal || null, c.uso_cfdi || null, c.regimen_fiscal || null,
       req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.remove = async (req, res) => {
  try {
    await pool.query('UPDATE clientes SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
