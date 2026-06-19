const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const mysql = require('mysql2/promise');

// Obtener credenciales de .env (o valores por defecto locales)
const getDbConfig = () => ({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'integrador1_facturacionelectronica',
  port: parseInt(process.env.DB_PORT || '3306', 10)
});

// GET /api/system/backup
const backup = async (req, res) => {
  try {
    const config = getDbConfig();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${timestamp}.sql`;
    
    // Directorio de backups temporales
    const backupDir = path.join(__dirname, '../../storage/backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const filepath = path.join(backupDir, filename);

    // Contruir comando mysqldump
    const passArg = config.password ? `-p"${config.password}"` : '';
    const cmd = `mysqldump -h ${config.host} -P ${config.port} -u ${config.user} ${passArg} ${config.database} > "${filepath}"`;

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error("Error ejecutando mysqldump:", error);
        return res.status(500).json({ success: false, message: 'Error generando la copia de seguridad. Verifica que mysqldump esté instalado.' });
      }

      // Enviar el archivo
      res.download(filepath, filename, (err) => {
        // Borrar el archivo temporal tras descargarse
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/system/restore
const restore = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se subió ningún archivo .sql' });
    }

    const config = getDbConfig();
    const sqlContent = fs.readFileSync(req.file.path, 'utf8');

    // Usar la librería mysql2 para ejecutar el script (soporta multipleStatements)
    const conn = await mysql.createConnection({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port,
      multipleStatements: true
    });

    await conn.query(sqlContent);
    await conn.end();

    // Eliminar archivo temporal subido por multer
    fs.unlinkSync(req.file.path);

    res.json({ success: true, message: 'Base de datos restaurada exitosamente.' });
  } catch (error) {
    console.error(error);
    // Eliminar archivo temporal subido por multer en caso de error
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: 'Error al restaurar el archivo: ' + error.message });
  }
};

// POST /api/system/reset
const reset = async (req, res) => {
  try {
    const { confirm_text } = req.body;
    if (confirm_text !== 'RESETEAR') {
      return res.status(400).json({ success: false, message: 'Texto de confirmación inválido.' });
    }

    const config = getDbConfig();
    
    const conn = await mysql.createConnection({
      host: config.host,
      user: config.user,
      password: config.password,
      port: config.port, // Conectar sin indicar BD inicial para recrearla
      multipleStatements: true
    });

    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    if (!fs.existsSync(schemaPath)) {
      await conn.end();
      return res.status(500).json({ success: false, message: 'Archivo schema.sql no encontrado en el sistema.' });
    }

    const sql = fs.readFileSync(schemaPath, 'utf8');
    await conn.query(sql);
    await conn.end();

    res.json({ success: true, message: 'Sistema reseteado a estado de fábrica exitosamente.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error al resetear la base de datos: ' + error.message });
  }
};

module.exports = {
  backup,
  restore,
  reset
};
