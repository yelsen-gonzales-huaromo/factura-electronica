const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const c       = require('../controllers/companyController');
const { authenticate, requireRole } = require('../middleware/auth');

// Multer en memoria para archivos de certificado (máx. 5 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.p12', '.pfx', '.cer', '.crt', '.pem', '.key'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

router.use(authenticate);

// ── CRUD Empresas ─────────────────────────────────────────────────────────────
router.get('/',    c.list);
router.get('/:id', c.get);
router.get('/:id/series', c.getSeries);
router.post('/',   requireRole('admin'), c.create);
router.put('/:id', requireRole('admin', 'contador'), c.update);
router.delete('/:id', requireRole('admin'), c.remove);

// ── Certificados digitales y configuración PAC ────────────────────────────────
router.get('/:id/certificado', c.getCertificado);
router.post('/:id/certificado',
  requireRole('admin'),
  upload.fields([
    { name: 'certificado',   maxCount: 1 },
    { name: 'llave_privada', maxCount: 1 },
  ]),
  c.uploadCertificado
);
router.put('/:id/modo-emision', requireRole('admin'), c.setModoEmision);
router.delete('/:id/certificado', requireRole('admin'), c.deleteCertificado);

module.exports = router;
