const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db, admin } = require('../config/firebase');
const { pool } = require('../config/db');
const { sendOTP } = require('../utils/smsSender');
const { generateOTP } = require('../utils/otpGenerator');

const TEACHER_REFERRAL_WELFARE_BOOST = 1500; // ₦1,500 welfare boost per referral
const PARENT_REFERRAL_DISCOUNT_VALUE = 1000; // ₦1,000 booking credit per referral
const AMBASSADOR_LEVEL1_REWARD = 1000;
const AMBASSADOR_LEVEL2_REWARD = 500;

async function applyReferralRewards(referrerId, newUserRole) {
  if (!referrerId) return;

  const referrerSnapshot = await db.ref(`users/${referrerId}`).once('value');
  if (!referrerSnapshot.exists()) return;

  const referrer = referrerSnapshot.val();

  // Increase referral count on referrer user record
  const newCount = (referrer.referral_count || 0) + 1;
  await db.ref(`users/${referrerId}`).update({ referral_count: newCount });

  // Teacher reward: welfare boost when referring another teacher (high-quality peer)
  if (referrer.role === 'teacher' && newUserRole === 'teacher') {
    const teacherProfileSnap = await db.ref(`teacher_profiles/${referrerId}`).once('value');
    if (teacherProfileSnap.exists()) {
      const currentWelfare = teacherProfileSnap.val().welfare_balance || 0;
      const currentBoost = teacherProfileSnap.val().referral_welfare_boost || 0;
      await db.ref(`teacher_profiles/${referrerId}`).update({
        welfare_balance: currentWelfare + TEACHER_REFERRAL_WELFARE_BOOST,
        referral_welfare_boost: currentBoost + TEACHER_REFERRAL_WELFARE_BOOST,
      });
    }
  }

  // Parent reward: discount credit when referring another parent
  if (referrer.role === 'parent' && newUserRole === 'parent') {
    const parentProfileSnap = await db.ref(`parent_profiles/${referrerId}`).once('value');
    if (parentProfileSnap.exists()) {
      const currentDiscount = parentProfileSnap.val().referral_discount || 0;
      await db.ref(`parent_profiles/${referrerId}`).update({
        referral_discount: currentDiscount + PARENT_REFERRAL_DISCOUNT_VALUE,
      });
    }
  }

  // Ambassador 2-level overrides, if present in PostgreSQL ambassadors table
  // try {
  //   const ambassador = await pool.query('SELECT * FROM ambassadors WHERE user_id = $1 AND status = $2', [referrerId, 'active']);
  //   if (ambassador.rows.length) {
  //     await pool.query(
  //       'UPDATE ambassadors SET direct_referrals = direct_referrals + 1, earned_credits = earned_credits + $1 WHERE user_id = $2',
  //       [AMBASSADOR_LEVEL1_REWARD, referrerId]
  //     );

  //     const mentorId = ambassador.rows[0].mentor_id;
  //     if (mentorId) {
  //       await pool.query(
  //         'UPDATE ambassadors SET indirect_referrals = indirect_referrals + 1, earned_credits = earned_credits + $1 WHERE user_id = $2',
  //         [AMBASSADOR_LEVEL2_REWARD, mentorId]
  //       );
  //     }
  //   }
  // } catch (err) {
  //   console.warn('Ambassador reward path failed:', err.message);
  // }
}

function createReferralCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

exports.register = async (req, res) => {
  let { email, phone, password, fullName, role, referralCode } = req.body;

  if (role === 'tutor') {
    role = 'teacher';
  }

  try {
    if (!email || !phone || !password || !fullName || !role) {
      return res.status(400).json({ error: 'All required fields must be provided' });
    }

    // Check if user exists by email or phone
    const usersRef = db.ref('users');
    const emailSnapshot = await usersRef.orderByChild('email').equalTo(email).once('value');
    const phoneSnapshot = await usersRef.orderByChild('phone').equalTo(phone).once('value');

    if (emailSnapshot.exists() || phoneSnapshot.exists()) {
      return res.status(400).json({ error: 'Email or phone already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const userId = db.ref('users').push().key;
    let generatedReferralCode = createReferralCode(8);

    let referredById = null;
    if (referralCode) {
      const referrerSnapshot = await usersRef.orderByChild('referral_code').equalTo(referralCode).once('value');
      if (referrerSnapshot.exists()) {
        const referrerData = Object.values(referrerSnapshot.val())[0];
        referredById = referrerData.id;
      }
    }

    const newUser = {
      id: userId,
      email,
      phone,
      password_hash: hashed,
      full_name: fullName,
      role,
      is_verified: false,
      trust_score: 0,
      referral_code: generatedReferralCode,
      referral_count: 0,
      referred_by: referredById,
      referral_rewarded: false,
      created_at: admin.database.ServerValue.TIMESTAMP,
    };

    await db.ref(`users/${userId}`).set(newUser);

    // Store OTP temporarily (using phone as key, not email - to avoid dots)
    await db.ref(`otps/${phone}`).set(otp);

    try {
      await sendOTP(phone, otp);
    } catch (err) {
      console.warn('SMS send warning:', err.message);
    }

    res.status(201).json({
      message: 'User registered. OTP sent.',
      userId,
      referralCode: generatedReferralCode,
      testOTP: process.env.NODE_ENV === 'development' ? otp : undefined,
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
};

exports.verifyOTP = async (req, res) => {
  const { phone, otp } = req.body;

  try {
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone and OTP required' });
    }

    // Get stored OTP
    const otpSnapshot = await db.ref(`otps/${phone}`).once('value');
    const storedOtp = otpSnapshot.val();

    if (process.env.NODE_ENV !== 'development' && (!storedOtp || storedOtp !== otp)) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Find user by phone
    const userSnapshot = await db.ref('users').orderByChild('phone').equalTo(phone).once('value');
    if (!userSnapshot.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = Object.values(userSnapshot.val())[0];
    const userId = userData.id;

    // Mark as verified
    await db.ref(`users/${userId}`).update({ is_verified: true });

    // Create profile based on role
    if (userData.role === 'teacher') {
      await db.ref(`teacher_profiles/${userId}`).set({
        user_id: userId,
        base_hourly_rate: 0,
        total_earnings: 0,
        wallet_balance: 0,
        welfare_balance: 0,
        referral_welfare_boost: 0,
        rating_avg: 0,
        total_sessions: 0,
        is_approved: false,
        photo_url: null,
      });
    } else if (userData.role === 'parent') {
      await db.ref(`parent_profiles/${userId}`).set({
        user_id: userId,
        default_location_lga: null,
        referral_discount: 0,
      });
    }

    // Apply referral rewards if referred
    if (userData.referred_by && !userData.referral_rewarded) {
      await applyReferralRewards(userData.referred_by, userData.role);
      // Mark this referral chain as paid for this sign-up event
      await db.ref(`users/${userId}`).update({ referral_rewarded: true });
    }

    // Clear OTP
    await db.ref(`otps/${phone}`).remove();

    const token = jwt.sign({ id: userId, role: userData.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    res.json({
      token,
      role: userData.role,
      user: {
        id: userId,
        fullName: userData.full_name,
        email: userData.email,
        role: userData.role,
        referralCode: userData.referral_code,
      },
    });
  } catch (err) {
    console.error('OTP verification error:', err);
    res.status(500).json({ error: 'OTP verification failed: ' + err.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user by email
    const userSnapshot = await db.ref('users').orderByChild('email').equalTo(email).once('value');
    if (!userSnapshot.exists()) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userData = Object.values(userSnapshot.val())[0];

    if (!userData.is_verified) {
      return res.status(403).json({ error: 'Please verify OTP before login' });
    }

    const valid = await bcrypt.compare(password, userData.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: userData.id, role: userData.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    const teacherProfileSnap = await db.ref(`teacher_profiles/${userData.id}`).once('value');
    const parentProfileSnap = await db.ref(`parent_profiles/${userData.id}`).once('value');

    res.json({
      token,
      role: userData.role,
      user: {
        id: userData.id,
        fullName: userData.full_name,
        email: userData.email,
        role: userData.role,
        referralCode: userData.referral_code,
        referralCount: userData.referral_count || 0,
        referralDiscount: parentProfileSnap.exists() ? parentProfileSnap.val().referral_discount || 0 : 0,
        welfareBoost: teacherProfileSnap.exists() ? teacherProfileSnap.val().referral_welfare_boost || 0 : 0,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const userSnapshot = await db.ref(`users/${userId}`).once('value');
    if (!userSnapshot.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userSnapshot.val();
    const teacherProfileSnap = await db.ref(`teacher_profiles/${userId}`).once('value');
    const parentProfileSnap = await db.ref(`parent_profiles/${userId}`).once('value');
    const teacherProfile = teacherProfileSnap.exists() ? teacherProfileSnap.val() : null;
    const parentProfile = parentProfileSnap.exists() ? parentProfileSnap.val() : null;

    res.json({
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      referralCode: user.referral_code,
      referralCount: user.referral_count || 0,
      referredBy: user.referred_by,
      referralDiscount: parentProfile?.referral_discount || 0,
      welfareBoost: teacherProfile?.referral_welfare_boost || 0,
      welfareBalance: teacherProfile?.welfare_balance || 0,
    });
  } catch (err) {
    console.error('Could not fetch profile:', err);
    res.status(500).json({ error: 'Unable to fetch profile' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fullName, bio, photo_url } = req.body;

    if (!fullName) {
      return res.status(400).json({ error: 'Full name is required' });
    }

    const updateData = {
      full_name: fullName,
    };

    if (bio) updateData.bio = bio;
    if (photo_url) updateData.photo_url = photo_url;

    await db.ref(`users/${userId}`).update(updateData);

    res.json({
      message: 'Profile updated successfully',
      data: {
        fullName,
        bio: bio || '',
        photo_url: photo_url || '',
      },
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile: ' + err.message });
  }
};

exports.socialRegister = async (req, res) => {
  const { uid, email, fullName, photoURL, provider } = req.body;

  try {
    // Check if user exists
    const userSnapshot = await db.ref(`users/${uid}`).once('value');
    if (userSnapshot.exists()) {
      // Already registered, just login
      const user = userSnapshot.val();
      const token = jwt.sign({ id: uid, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
      return res.json({ token, user });
    }

    // Register new user
    const newUser = {
      id: uid,
      email,
      phone: '', // Social users may not have phone
      full_name: fullName,
      role: 'parent', // Default role
      is_verified: true, // Social login is verified
      trust_score: 0,
      referral_code: generateReferralCode(),
      referral_count: 0,
      referred_by: null,
      referral_rewarded: false,
      photo_url: photoURL,
      created_at: new Date().toISOString()
    };

    await db.ref(`users/${uid}`).set(newUser);

    // Create parent profile
    await db.ref(`parent_profiles/${uid}`).set({
      user_id: uid,
      default_location_lga: null,
      referral_discount: 0,
    });

    const token = jwt.sign({ id: uid, role: newUser.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    res.json({ token, user: newUser });
  } catch (err) {
    console.error('Social register error:', err);
    res.status(500).json({ error: 'Social registration failed: ' + err.message });
  }
};

exports.socialLogin = async (req, res) => {
  const { uid, email, provider } = req.body;

  try {
    const userSnapshot = await db.ref(`users/${uid}`).once('value');
    if (!userSnapshot.exists()) {
      return res.status(404).json({ error: 'User not found. Please register first.' });
    }

    const user = userSnapshot.val();
    const token = jwt.sign({ id: uid, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    res.json({ token, user });
  } catch (err) {
    console.error('Social login error:', err);
    res.status(500).json({ error: 'Social login failed: ' + err.message });
  }
};

function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

