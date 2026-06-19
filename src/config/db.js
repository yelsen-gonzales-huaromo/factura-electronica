/**
 * Configuración del pool de conexiones MySQL
 */
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST || 'localhost',
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'integrador1_facturacionelectronica',
  port:     parseInt(process.env.DB_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  decimalNumbers: true
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('✓ Conexión MySQL establecida correctamente');
  } catch (err) {
    console.error('✗ Error conectando a MySQL:', err.message);
    console.error('  Asegúrate de que MySQL está corriendo y la base de datos existe.');
    console.error('  Ejecuta: npm run init-db');
  }
}

module.exports = { pool, testConnection };
