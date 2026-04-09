const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  processPaymentWithWelfareFund,
  getWelfareFund,
  unlockWelfareFunds,
  withdrawFromWelfareFund,
} = require('../controllers/paymentSplitController');

/**
 * POST /api/payments/process
 * Process a payment with automatic split (75% teacher, 15% platform, 10% welfare)
 * Requires: lessonId, teacherId, parentId, amount, status
 */
router.post('/process', auth, processPaymentWithWelfareFund);

/**
 * GET /api/payments/welfare-fund/:teacherId
 * Get teacher's welfare fund details
 * - Total accumulated
 * - Available balance
 * - Locked balance
 * - Contribution history
 */
router.get('/welfare-fund/:teacherId', auth, getWelfareFund);

/**
 * POST /api/payments/unlock-welfare
 * Admin route to unlock welfare funds from previous months (runs monthly on 5th)
 * Moves locked funds to available balance
 */
router.post('/unlock-welfare', auth, unlockWelfareFunds);

/**
 * POST /api/payments/welfare-fund/:teacherId/withdraw
 * Submit withdrawal request from welfare fund
 * Requires: amount
 */
router.post('/welfare-fund/:teacherId/withdraw', auth, withdrawFromWelfareFund);
router.get('/welfare-analytics', auth, require('../controllers/paymentSplitController').getCentralWelfareAnalytics);

module.exports = router;
