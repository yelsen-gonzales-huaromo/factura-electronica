/**
 * Controlador de autenticación
 */
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { signToken } = require('../middleware/auth');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email y password requeridos' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM usuarios WHERE email = ? AND activo = 1', [email]
    );
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    // Empresas a las que tiene acceso
    const [empresas] = await pool.query(
      `SELECT e.*, p.nombre AS pais, p.codigo AS pais_codigo, p.moneda_codigo, p.autoridad_fiscal,
              ue.es_principal
         FROM empresas e
         JOIN usuario_empresa ue ON ue.empresa_id = e.id
         JOIN paises p ON p.id = e.pais_id
        WHERE ue.usuario_id = ? AND e.activo = 1
        ORDER BY ue.es_principal DESC, e.razon_social`,
      [user.id]
    );

    const empresaPrincipal = empresas.find(e => e.es_principal) || empresas[0];

    const token = signToken({
      id: user.id,
      email: user.email,
      rol: user.rol,
      nombre: `${user.nombre} ${user.apellido}`,
      empresa_id: empresaPrincipal ? empresaPrincipal.id : null
    });

    await pool.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?', [user.id]);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        rol: user.rol
      },
      empresas
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.register = async (req, res) => {
  try {
    const { nombre, apellido, email, password, rol = 'vendedor' } = req.body;
    if (!nombre || !apellido || !email || !password) {
      return res.status(400).json({ success: false, message: 'Datos incompletos' });
    }

    const [exists] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (exists.length) {
      return res.status(400).json({ success: false, message: 'Email ya registrado' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      'INSERT INTO usuarios (nombre, apellido, email, password_hash, rol) VALUES (?,?,?,?,?)',
      [nombre, apellido, email, hash, rol]
    );

    res.status(201).json({ success: true, id: r.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.me = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, nombre, apellido, email, rol, ultimo_login FROM usuarios WHERE id = ?',
      [req.user.id]
    );
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
