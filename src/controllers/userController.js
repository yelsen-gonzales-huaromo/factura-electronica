const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

exports.list = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, nombre, apellido, email, rol, activo, ultimo_login, created_at FROM usuarios ORDER BY nombre'
    );
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { nombre, apellido, email, password, rol = 'vendedor', empresas = [] } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      'INSERT INTO usuarios (nombre, apellido, email, password_hash, rol) VALUES (?,?,?,?,?)',
      [nombre, apellido, email, hash, rol]
    );
    for (const empresa_id of empresas) {
      await pool.query(
        'INSERT INTO usuario_empresa (usuario_id, empresa_id) VALUES (?, ?)',
        [r.insertId, empresa_id]);
    }
    res.status(201).json({ success: true, id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ success: false, message: 'Email ya existe' });
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { nombre, apellido, email, rol, activo, password } = req.body;
    const fields = ['nombre=?', 'apellido=?', 'email=?', 'rol=?', 'activo=?'];
    const values = [nombre, apellido, email, rol, activo ? 1 : 0];
    if (password) {
      fields.push('password_hash=?');
      values.push(await bcrypt.hash(password, 10));
    }
    values.push(req.params.id);
    await pool.query(`UPDATE usuarios SET ${fields.join(',')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.remove = async (req, res) => {
  try {
    await pool.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
