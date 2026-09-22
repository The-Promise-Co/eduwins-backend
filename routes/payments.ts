import express from 'express';
import authenticateToken from '../middleware/auth';
import {
  processPaymentWithWelfareFund,
  getWelfareFund,
  getCentralWelfareAnalytics,
  withdrawFromWelfareFund,
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
 * POST /api/payments/welfare-fund/:teacherId/withdraw
 * Teacher welfare withdrawal (this route was missing — the welfare page called it)
 */
router.post('/welfare-fund/:teacherId/withdraw', authenticateToken, withdrawFromWelfareFund as any);

/**
 * GET /api/payments/welfare-analytics
 * Get central welfare analytics
 */
router.get('/welfare-analytics', authenticateToken, getCentralWelfareAnalytics as any);

export default router;
