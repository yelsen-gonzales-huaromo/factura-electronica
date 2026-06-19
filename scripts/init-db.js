/**
 * Inicializa la base de datos ejecutando schema.sql
 *   node scripts/init-db.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  console.log('Inicializando base de datos...');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    multipleStatements: true
  });

  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
    await conn.query(sql);
    console.log('✓ Base de datos creada correctamente.');
    console.log(`  Base: ${process.env.DB_NAME || 'integrador1_facturacionelectronica'}`);
    console.log('  Usuario admin: admin@factu.com / admin123');
  } catch (err) {
    console.error('✗ Error inicializando DB:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
})();
