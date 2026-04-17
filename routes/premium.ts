import express from 'express';
import authenticateToken from '../middleware/auth';
import {
  subscribeToPremium,
  getTeacherPremiumContent,
  subscribeToVideo,
  purchaseMaterial,
  checkVideoAccess,
  cancelSubscription,
  getSubscriptionStatus,
  getTeacherOwnContent,
} from '../controllers/premiumController';

const router = express.Router();

/**
 * POST /api/premium/subscribe
 * Subscribe to premium features
 */
router.post('/subscribe', authenticateToken, subscribeToPremium as any);

/**
 * GET /api/premium/content/:teacherId
 * Get teacher's premium content
 */
router.get('/content/:teacherId', getTeacherPremiumContent as any);

/**
 * POST /api/premium/video/:videoId/subscribe
 * Subscribe to a subject video
 */
router.post('/video/:videoId/subscribe', authenticateToken, subscribeToVideo as any);

/**
 * POST /api/premium/material/:materialId/purchase
 * Purchase teaching material
 */
router.post('/material/:materialId/purchase', authenticateToken, purchaseMaterial as any);

/**
 * GET /api/premium/video/:videoId/access
 * Check if user has access to video
 */
router.get('/video/:videoId/access', checkVideoAccess as any);

/**
 * POST /api/premium/subscription/cancel
 * Cancel subscription
 */
router.post('/subscription/cancel', authenticateToken, cancelSubscription as any);

/**
 * GET /api/premium/subscription/status
 * Get subscription status
 */
router.get('/subscription/status', authenticateToken, getSubscriptionStatus as any);

/**
 * GET /api/premium/teacher-content
 * Get authenticated teacher's own premium content
 */
router.get('/teacher-content', authenticateToken, getTeacherOwnContent as any);

export default router;
