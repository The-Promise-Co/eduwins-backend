import express from 'express';
import authenticateToken from '../middleware/auth';
import {
  apply,
  me,
  rewardReferral,
} from '../controllers/ambassadorController';

const router = express.Router();

/**
 * POST /api/ambassadors/apply
 * Teacher applies for ambassador program
 */
router.post('/apply', authenticateToken, apply as any);

/**
 * GET /api/ambassadors/me
 * Get current user's ambassador profile
 */
router.get('/me', authenticateToken, me as any);

/**
 * POST /api/ambassadors/reward
 * System internal: reward an ambassador for a referral
 */
router.post('/reward', rewardReferral as any);

export default router;
