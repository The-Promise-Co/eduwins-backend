const express = require('express');
const router = express.Router();
const { initializePayment, verifyPayment, paystackWebhook } = require('../controllers/paystackController');

router.post('/initialize', initializePayment);
router.get('/verify/:reference', verifyPayment);
router.post('/webhook', express.json(), paystackWebhook);

module.exports = router;
