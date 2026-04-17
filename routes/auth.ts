import express from 'express';
import authenticateToken from '../middleware/auth';
import { 
  register, 
  verifyOTP, 
  login, 
  getProfile, 
  updateProfile,
  // socialRegister, 
  // socialLogin 
} from '../controllers/authController';

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', register as any);

/**
 * POST /api/auth/verify-otp
 * Verify OTP and complete registration
 */
router.post('/verify-otp', verifyOTP as any);

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', login as any);

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticateToken, getProfile as any);

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', authenticateToken, updateProfile as any);

// Social Auth routes commented out until migrated if needed
// router.post('/social-register', socialRegister);
// router.post('/social-login', socialLogin);

export default router;
