const router = require('express').Router();
const c = require('../controllers/clientController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/', c.list);
router.get('/:id', c.get);
router.post('/', c.create);
router.put('/:id', c.update);
router.delete('/:id', c.remove);

module.exports = router;
