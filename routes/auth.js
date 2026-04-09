const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { register, verifyOTP, login, getProfile, updateProfile, socialRegister, socialLogin } = require('../controllers/authController');

/**
 * @route POST /api/auth/register
 * @desc Register a new user
 * @body { email, phone, password, fullName, role, referralCode }
 */
router.post('/register', register);

/**
 * @route POST /api/auth/verify-otp
 * @desc Verify OTP and complete registration
 * @body { phone, otp }
 */
router.post('/verify-otp', verifyOTP);

/**
 * @route POST /api/auth/login
 * @desc Login with email and password
 * @body { email, password }
 */
router.post('/login', login);

/**
 * @route GET /api/auth/me
 * @desc Get current user profile + referral stats
 */
router.get('/me', authMiddleware, getProfile);

/**
 * @route PUT /api/auth/profile
 * @desc Update user profile
 * @body { fullName, bio, photo_url }
 */
router.put('/profile', authMiddleware, updateProfile);

/**
 * @route POST /api/auth/social-register
 * @desc Register/login with social provider
 * @body { uid, email, fullName, photoURL, provider }
 */
router.post('/social-register', socialRegister);

/**
 * @route POST /api/auth/social-login
 * @desc Login with social provider
 * @body { uid, email, provider }
 */
router.post('/social-login', socialLogin);

module.exports = router;
