const router = require('express').Router();
const { login, register, me } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', login);
router.post('/register', register);
router.get('/me', authenticate, me);

module.exports = router;
