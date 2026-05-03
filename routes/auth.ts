import express from 'express';
import authenticateToken from '../middleware/auth';
import {
  register,
  verifyEmail,
  login,
  getProfile,
  updateProfile,
  resendOtp,
  // socialRegister, 
  // socialLogin 
} from '../controllers/authController';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and user registration
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       201:
 *         description: Otp sent
 */
router.post('/register', register as any);

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     summary: Verify email token and OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 */
router.post('/verify-email', verifyEmail as any);
router.post('/resend-otp', resendOtp as any);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
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
