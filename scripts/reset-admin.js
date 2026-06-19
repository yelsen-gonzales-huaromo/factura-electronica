/**
 * Resetea la contraseña del usuario admin@factu.com a "admin123"
 * Útil si la base de datos ya existía con el hash anterior incorrecto.
 *
 * Uso:  node scripts/reset-admin.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'integrador1_facturacionelectronica',
    port: parseInt(process.env.DB_PORT || '3306', 10)
  });

  try {
    const password = 'admin123';
    const hash = await bcrypt.hash(password, 10);

    // Verificar que existe el admin
    const [rows] = await conn.execute(
      'SELECT id FROM usuarios WHERE email = ?', ['admin@factu.com']);

    if (rows.length === 0) {
      // Crear el admin si no existe
      await conn.execute(
        `INSERT INTO usuarios (nombre, apellido, email, password_hash, rol, activo)
         VALUES ('Admin', 'Sistema', 'admin@factu.com', ?, 'admin', 1)`,
        [hash]);
      console.log('✓ Usuario admin@factu.com creado correctamente');
    } else {
      // Actualizar password
      await conn.execute(
        'UPDATE usuarios SET password_hash = ?, activo = 1 WHERE email = ?',
        [hash, 'admin@factu.com']);
      console.log('✓ Contraseña del admin reseteada correctamente');
    }

    console.log('');
    console.log('  Email:    admin@factu.com');
    console.log('  Password: admin123');
    console.log('');
    console.log('Ya puedes iniciar sesión.');
  } catch (err) {
    console.error('✗ Error:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
})();
