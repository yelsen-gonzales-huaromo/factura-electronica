const router = require('express').Router();
const c = require('../controllers/reportController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/dashboard', c.dashboard);
router.get('/facturas-periodo', c.facturasPeriodo);

module.exports = router;
