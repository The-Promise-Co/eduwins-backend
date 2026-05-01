import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../database/db';
import { users, teacherProfiles, parentProfiles, verificationTokens } from '../database/schema';
import { eq, or, and } from 'drizzle-orm';
import { emailService } from '../utils/emailSender';
import { generateOTP } from '../utils/otpGenerator';
import crypto from 'crypto';
import logger from '../utils/logger';

const TEACHER_REFERRAL_WELFARE_BOOST = 1500; // ₦1,500 welfare boost per referral
const PARENT_REFERRAL_DISCOUNT_VALUE = 1000; // ₦1,000 booking credit per referral


export const register = async (req: Request, res: Response) => {
  let { email, phone, password, fullName, role, referralCode } = req.body;

  if (role === 'tutor') {
    role = 'teacher';
  }

  try {
    if (!email || !phone || !password || !fullName || !role) {
      return res.status(400).json({ error: 'All required fields must be provided' });
    }

    // Check if user exists by email or phone
    const existingUser = await db.query.users.findFirst({
      where: or(eq(users.email, email), eq(users.phone, phone)),
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email or phone already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    // In Drizzle, we usually generate IDs beforehand if using varchar PKs
    const userId = Math.random().toString(36).substring(2, 15);
    const generatedReferralCode = createReferralCode(8);

    let referredById: string | null = null;
    if (referralCode) {
      const referrer = await db.query.users.findFirst({
        where: eq(users.referralCode, referralCode),
      });
      if (referrer) {
        referredById = referrer.id;
      }
    }

    const newUser = {
      id: userId,
      email,
      phone,
      passwordHash: hashed,
      fullName,
      role,
      isVerified: false,
      trustScore: 0,
      referralCode: generatedReferralCode,
      referralCount: 0,
      referredBy: referredById,
      referralRewarded: false,
    };

    await db.insert(users).values(newUser);

    // Generate secure token and expiry (15 mins)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);

    // Store in verification_tokens
    await db.insert(verificationTokens).values({
      id: Math.random().toString(36).substring(2, 15),
      userId,
      token: verificationToken,
      otp,
      type: 'register',
      expiresAt: otpExpiry,
    });

    try {
      await emailService.sendVerificationEmail(email, otp);
    } catch (err: any) {
      logger.warn({ err }, 'Email send warning');
    }

    res.status(201).json({
      message: 'User registered. OTP sent.',
      userId,
      referralCode: generatedReferralCode,
      verificationToken, // sent to frontend to store in sessionStorage
      testOTP: process.env.NODE_ENV === 'development' ? otp : undefined,
    });
    logger.info({ userId, email, role }, 'New user registered successfully');
  } catch (err: any) {
    logger.error({ err }, 'Registration error');
    res.status(500).json({ error: 'Registration failed. Please try again later.' });
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  const { token, otp } = req.body;

  try {
    if (!token || !otp) {
      return res.status(400).json({ error: 'Token and OTP required' });
    }

    // Lookup token record
    const tokenRecord = await db.query.verificationTokens.findFirst({
      where: and(
        eq(verificationTokens.token, token),
        eq(verificationTokens.type, 'register')
      ),
    });

    if (!tokenRecord) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    if (tokenRecord.usedAt) {
      return res.status(400).json({ error: 'This verification link has already been used' });
    }

    if (new Date() > tokenRecord.expiresAt) {
      return res.status(400).json({ error: 'Verification OTP has expired' });
    }

    if (process.env.NODE_ENV !== 'development' && tokenRecord.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP code' });
    }

    // Get the user
    const user = await db.query.users.findFirst({
      where: eq(users.id, tokenRecord.userId),
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Mark as verified
    await db.update(users)
      .set({ isVerified: true })
      .where(eq(users.id, user.id));

    // Mark token as used
    await db.update(verificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(verificationTokens.id, tokenRecord.id));

    // Create profile based on role
    if (user.role === 'teacher') {
      await db.insert(teacherProfiles).values({
        userId: user.id,
        baseHourlyRate: '0',
        totalEarnings: '0',
        walletBalance: '0',
        welfareBalance: '0',
        referralWelfareBoost: '0',
        ratingAvg: '0',
        totalSessions: 0,
        isApproved: false,
      }).onConflictDoNothing();
    } else if (user.role === 'parent') {
      await db.insert(parentProfiles).values({
        userId: user.id,
        referralDiscount: '0',
      }).onConflictDoNothing();
    }

    // Apply referral rewards if referred
    if (user.referredBy && !user.referralRewarded) {
      await applyReferralRewards(user.referredBy, user.role);
      await db.update(users)
        .set({ referralRewarded: true })
        .where(eq(users.id, user.id));
    }

    const jwtToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    res.json({
      token: jwtToken,
      role: user.role,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        referralCode: user.referralCode,
      },
    });
    logger.info({ userId: user.id, role: user.role }, 'User email verified successfully');
  } catch (err: any) {
    logger.error({ err }, 'Email verification error');
    res.status(500).json({ error: 'Verification failed. Please try again later.' });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ error: 'Please verify OTP before login' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash || '');
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    const teacherProfile = await db.query.teacherProfiles.findFirst({ where: eq(teacherProfiles.userId, user.id) });
    const parentProfile = await db.query.parentProfiles.findFirst({ where: eq(parentProfiles.userId, user.id) });

    res.json({
      token,
      role: user.role,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        referralCode: user.referralCode,
        referralCount: user.referralCount || 0,
        referralDiscount: parentProfile?.referralDiscount || 0,
        welfareBoost: teacherProfile?.referralWelfareBoost || 0,
      },
    });
    logger.info({ userId: user.id, role: user.role }, 'User logged in successfully');
  } catch (err: any) {
    logger.error({ err }, 'Login error');
    res.status(500).json({ error: 'Login failed. Please try again later.' });
  }
};

export const getProfile = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const teacherProfile = await db.query.teacherProfiles.findFirst({ where: eq(teacherProfiles.userId, userId) });
    const parentProfile = await db.query.parentProfiles.findFirst({ where: eq(parentProfiles.userId, userId) });

    res.json({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      referralCode: user.referralCode,
      referralCount: user.referralCount || 0,
      referredBy: user.referredBy,
      referralDiscount: parentProfile?.referralDiscount || 0,
      welfareBoost: teacherProfile?.referralWelfareBoost || 0,
      welfareBalance: teacherProfile?.welfareBalance || 0,
    });
  } catch (err: any) {
    logger.error({ err }, 'Could not fetch profile');
    res.status(500).json({ error: 'Unable to fetch profile' });
  }
};




/* ---- ---- ---  REVIEWED CODE ABOVE --- --- --- */







/**
 * Apply referral rewards when a new user registers or verifies
 */
async function applyReferralRewards(referrerId: string, newUserRole: string): Promise<void> {
  if (!referrerId) return;

  const referrer = await db.query.users.findFirst({
    where: eq(users.id, referrerId),
  });

  if (!referrer) return;

  // Increase referral count on referrer user record
  const newCount = (referrer.referralCount || 0) + 1;
  await db.update(users)
    .set({ referralCount: newCount })
    .where(eq(users.id, referrerId));

  // Teacher reward: welfare boost when referring another teacher
  if (referrer.role === 'teacher' && newUserRole === 'teacher') {
    const profile = await db.query.teacherProfiles.findFirst({
      where: eq(teacherProfiles.userId, referrerId),
    });

    if (profile) {
      const currentWelfare = parseFloat(profile.welfareBalance?.toString() || '0');
      const currentBoost = parseFloat(profile.referralWelfareBoost?.toString() || '0');

      await db.update(teacherProfiles)
        .set({
          welfareBalance: (currentWelfare + TEACHER_REFERRAL_WELFARE_BOOST).toString(),
          referralWelfareBoost: (currentBoost + TEACHER_REFERRAL_WELFARE_BOOST).toString(),
        })
        .where(eq(teacherProfiles.userId, referrerId));
    }
  }

  // Parent reward: discount credit when referring another parent
  if (referrer.role === 'parent' && newUserRole === 'parent') {
    const profile = await db.query.parentProfiles.findFirst({
      where: eq(parentProfiles.userId, referrerId),
    });

    if (profile) {
      const currentDiscount = parseFloat(profile.referralDiscount?.toString() || '0');

      await db.update(parentProfiles)
        .set({
          referralDiscount: (currentDiscount + PARENT_REFERRAL_DISCOUNT_VALUE).toString(),
        })
        .where(eq(parentProfiles.userId, referrerId));
    }
  }
}

function createReferralCode(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
export const updateProfile = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const { fullName, bio, photoUrl } = req.body;

    if (!fullName) {
      return res.status(400).json({ error: 'Full name is required' });
    }

    const updateData: any = {
      fullName: fullName,
    };

    if (bio) updateData.bio = bio;
    if (photoUrl) updateData.photoUrl = photoUrl;

    await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId));

    res.json({
      message: 'Profile updated successfully',
      data: {
        fullName,
        bio: bio || '',
        photoUrl: photoUrl || '',
      },
    });
    logger.info({ userId }, 'User profile updated successfully');
  } catch (err: any) {
    logger.error({ err }, 'Profile update error');
    res.status(500).json({ error: 'Failed to update profile. Please try again later.' });
  }
};

// ... Social Auth and Helper functions would follow similar patterns
