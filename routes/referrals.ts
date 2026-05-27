import express from 'express';
import authenticateToken from '../middleware/auth';
import { getMyReferrals } from '../controllers/referralController';

const router = express.Router();

/**
 * GET /api/referrals/my
 * Returns all referrals made by the authenticated user,
 * including referee details, subscription plan info, and reward amounts.
 */
router.get('/my', authenticateToken, getMyReferrals as any);

export default router;
