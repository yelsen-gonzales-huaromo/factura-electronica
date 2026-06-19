const router = require('express').Router();
const c   = require('../controllers/invoiceController');
const pdf = require('../controllers/pdfController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/',              c.list);
router.get('/:id',           c.get);
router.post('/',             c.create);
router.post('/:id/emitir',   c.emitir);
router.post('/:id/cancelar', c.cancelar);
router.get('/:id/xml',       c.descargarXML);
router.get('/:id/pdf',       pdf.generarPDF);

module.exports = router;
