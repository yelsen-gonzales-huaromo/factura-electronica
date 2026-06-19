const { pool } = require('../config/db');

exports.list = async (req, res) => {
  try {
    const empresa_id = req.query.empresa_id || req.user.empresa_id;
    const search = req.query.search || '';
    const [rows] = await pool.query(
      `SELECT * FROM productos
        WHERE empresa_id = ? AND activo = 1
          AND (codigo LIKE ? OR descripcion LIKE ?)
        ORDER BY descripcion`,
      [empresa_id, `%${search}%`, `%${search}%`]
    );
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.get = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM productos WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'No encontrado' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const p = req.body;
    const [r] = await pool.query(
      `INSERT INTO productos (empresa_id, codigo, codigo_sat, descripcion, tipo,
         unidad_medida, precio_unitario, iva_porcentaje, ieps_porcentaje,
         retencion_iva, retencion_isr, exento, stock)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [p.empresa_id, p.codigo, p.codigo_sat || null, p.descripcion,
       p.tipo || 'producto', p.unidad_medida, p.precio_unitario,
       p.iva_porcentaje || 0, p.ieps_porcentaje || 0,
       p.retencion_iva || 0, p.retencion_isr || 0,
       p.exento ? 1 : 0, p.stock || 0]
    );
    res.status(201).json({ success: true, id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ success: false, message: 'Código duplicado' });
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const p = req.body;
    await pool.query(
      `UPDATE productos SET codigo=?, codigo_sat=?, descripcion=?, tipo=?,
         unidad_medida=?, precio_unitario=?, iva_porcentaje=?, ieps_porcentaje=?,
         retencion_iva=?, retencion_isr=?, exento=?, stock=?
       WHERE id = ?`,
      [p.codigo, p.codigo_sat || null, p.descripcion, p.tipo || 'producto',
       p.unidad_medida, p.precio_unitario, p.iva_porcentaje || 0,
       p.ieps_porcentaje || 0, p.retencion_iva || 0, p.retencion_isr || 0,
       p.exento ? 1 : 0, p.stock || 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.remove = async (req, res) => {
  try {
    await pool.query('UPDATE productos SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
