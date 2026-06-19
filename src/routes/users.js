const router = require('express').Router();
const c = require('../controllers/userController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);
router.get('/', requireRole('admin'), c.list);
router.post('/', requireRole('admin'), c.create);
router.put('/:id', requireRole('admin'), c.update);
router.delete('/:id', requireRole('admin'), c.remove);

module.exports = router;
