const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { apply, me, rewardReferral } = require('../controllers/ambassadorController');

router.post('/apply', authMiddleware, apply);
router.get('/me', authMiddleware, me);
router.post('/reward', authMiddleware, rewardReferral);

module.exports = router;
