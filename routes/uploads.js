const express = require('express');
const router = express.Router();
const path = require('path');
const auth = require('../middleware/auth');
const multer = require('multer');
const {
  uploadHeadshot,
  uploadVideoIntro,
  uploadCredentials,
  uploadSubjectVideo,
  uploadTeachingMaterial,
  getProfileCompletion,
} = require('../controllers/uploadController');
const {
  subscribeToPremium,
  getTeacherPremiumContent,
  subscribeToVideo,
  purchaseMaterial,
  checkVideoAccess,
  cancelSubscription,
  getSubscriptionStatus,
  getTeacherOwnContent,
} = require('../controllers/premiumController');

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'file-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
});

/**
 * Profile Builder Routes
 */

/**
 * POST /api/uploads/headshot
 * Upload teacher headshot (JPEG, PNG, GIF - max 5MB)
 */
router.post('/headshot', auth, upload.single('headshot'), uploadHeadshot);

/**
 * POST /api/uploads/video-intro
 * Upload 1-minute video intro (MP4, MOV - max 50MB)
 */
router.post('/video-intro', auth, upload.single('videoIntro'), uploadVideoIntro);

/**
 * POST /api/uploads/credentials
 * Upload TRCN/NIN credentials (PDF - max 10MB)
 */
router.post('/credentials', auth, upload.single('credentials'), uploadCredentials);

/**
 * GET /api/uploads/profile-completion
 * Get teacher profile completion status
 */
router.get('/profile-completion', auth, getProfileCompletion);

/**
 * Premium Features Routes
 */

/**
 * POST /api/premium/subscribe
 * Subscribe to premium features
 * Body: { plan: 'monthly'|'quarterly'|'annual', paymentMethodId }
 */
router.post('/subscribe', auth, subscribeToPremium);

/**
 * GET /api/premium/content/:teacherId
 * Get teacher's premium content (videos and materials)
 */
router.get('/content/:teacherId', getTeacherPremiumContent);

/**
 * POST /api/premium/subject-video
 * Upload subject video (Premium only)
 * Body: { subject, title, description, price }
 */
router.post('/subject-video', auth, upload.single('video'), uploadSubjectVideo);

/**
 * POST /api/premium/teaching-material
 * Upload teaching material (Premium only)
 * Body: { subject, title, description, price }
 */
router.post('/teaching-material', auth, upload.single('material'), uploadTeachingMaterial);

/**
 * POST /api/premium/video/:videoId/subscribe
 * Subscribe to a subject video
 * Body: { transactionId }
 */
router.post('/video/:videoId/subscribe', auth, subscribeToVideo);

/**
 * POST /api/premium/material/:materialId/purchase
 * Purchase teaching material
 * Body: { transactionId }
 */
router.post('/material/:materialId/purchase', auth, purchaseMaterial);

/**
 * GET /api/premium/video/:videoId/access
 * Check if user has access to video
 * Query: ?userId=
 */
router.get('/video/:videoId/access', checkVideoAccess);

/**
 * POST /api/premium/subscription/cancel
 * Cancel subscription
 * Body: { immediately: boolean }
 */
router.post('/subscription/cancel', auth, cancelSubscription);

/**
 * GET /api/premium/teacher/:teacherId/content
 * Get teacher's premium content publicly (for marketplace)
 */
router.get('/teacher/:teacherId/content', getTeacherPremiumContent);

/**
 * GET /api/premium/subscription/status
 * Get subscription status
 */
router.get('/subscription/status', auth, getSubscriptionStatus);

/**
 * GET /api/premium/teacher-content
 * Get authenticated teacher's own premium content (videos and materials)
 */
router.get('/teacher-content', auth, getTeacherOwnContent);

module.exports = router;
