import express from 'express';
import authenticateToken from '../middleware/auth';
import {
  processPaymentWithWelfareFund,
  getWelfareFund,
  unlockWelfareFunds,
  getCentralWelfareAnalytics,
} from '../controllers/paymentSplitController';

const router = express.Router();

/**
 * POST /api/payments/process
 * Process a payment with automatic split (75% teacher, 15% platform, 10% welfare)
 */
router.post('/process', authenticateToken, processPaymentWithWelfareFund as any);

/**
 * GET /api/payments/welfare-fund/:teacherId
 * Get teacher's welfare fund details
 */
router.get('/welfare-fund/:teacherId', authenticateToken, getWelfareFund as any);

/**
 * POST /api/payments/unlock-welfare
 * Admin route to unlock welfare funds
 */
router.post('/unlock-welfare', authenticateToken, unlockWelfareFunds as any);

/**
 * GET /api/payments/welfare-analytics
 * Get central welfare analytics
 */
router.get('/welfare-analytics', authenticateToken, getCentralWelfareAnalytics as any);

export default router;
