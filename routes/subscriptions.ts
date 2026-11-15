import { Router } from 'express';
import authenticateToken from '../middleware/auth';
import {
  getPlans,
  getMySubscription,
  startCheckout,
  verifySubscriptionPayment,
} from '../controllers/subscriptions';

const router = Router();

router.get('/plans', getPlans as any);
router.get('/me', authenticateToken, getMySubscription as any);
router.post('/checkout', authenticateToken, startCheckout as any);
router.get('/verify/:reference', verifySubscriptionPayment as any);

export default router;
