import express from 'express';
import authenticateToken from '../middleware/auth';
import {
  initializePayment,
  verifyPayment,
  paystackWebhook,
} from '../controllers/paystackController';

const router = express.Router();

/**
 * POST /api/paystack/initialize
 * Initialize a payment session
 */
router.post('/initialize', authenticateToken, initializePayment as any);

/**
 * GET /api/paystack/verify/:reference
 * Verify a payment transaction
 */
router.get('/verify/:reference', verifyPayment as any);

/**
 * POST /api/paystack/webhook
 * Paystack webhook handler
 */
router.post('/webhook', paystackWebhook as any);

export default router;
