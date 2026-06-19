const express = require('express');
const router = express.Router();
const systemController = require('../controllers/systemController');
const { authenticate, requireRole } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configuración de Multer para subir temporalmente el archivo .sql
const uploadDir = path.join(__dirname, '../../storage/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, `restore-${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage: storage });

// Todas las rutas de sistema requieren autenticación y rol de 'admin'
router.use(authenticate, requireRole('admin'));

// Rutas
router.get('/backup', systemController.backup);
router.post('/restore', upload.single('backup_file'), systemController.restore);
router.post('/reset', systemController.reset);

module.exports = router;
