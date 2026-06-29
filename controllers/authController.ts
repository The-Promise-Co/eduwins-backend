import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../database/db';
import { users, teacherProfiles, parentProfiles, verificationTokens, referrals, teacherCertifications, teacherEducations } from '../database/schema';
import { eq, or, and } from 'drizzle-orm';
import { emailService } from '../utils/emailSender';
import { generateOTP } from '../utils/otpGenerator';
import crypto from 'crypto';
import logger from '../utils/logger';
import { creditWallet, ensureUserWallets } from '../services/walletService';

const TEACHER_REFERRAL_WELFARE_BOOST = 1500; // ₦1,500 welfare boost per referral
const PARENT_REFERRAL_DISCOUNT_VALUE = 1000; // ₦1,000 booking credit per referral

// Reward amount per successful referral subscription (for referrer)
const PLAN_REWARDS: Record<string, number> = {
  monthly: 150,
  quarterly: 150,
  annual: 150,
};

// Subscription plan prices for referral reward calculation.
const PLAN_PRICES: Record<string, number> = {
  monthly: 5000,
  quarterly: 12000,
  annual: 40000,
};

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const normalizeDayKey = (day: string) => {
  const normalized = day.trim().toLowerCase();
  const aliases: Record<string, string> = {
    mon: 'monday',
    tue: 'tuesday',
    tues: 'tuesday',
    wed: 'wednesday',
    thu: 'thursday',
    thur: 'thursday',
    thurs: 'thursday',
    fri: 'friday',
    sat: 'saturday',
    sun: 'sunday',
  };
  return aliases[normalized] || normalized;
};

const toMinutes = (value: string) => {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
};

const normalizeAvailabilityConfig = (config: unknown) => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;

  const normalized = DAYS.reduce<Record<string, { from: string; to: string }[]>>((acc, day) => {
    acc[day] = [];
    return acc;
  }, {});

  for (const [day, ranges] of Object.entries(config as Record<string, unknown>)) {
    const normalizedDay = normalizeDayKey(day);
    if (!DAYS.includes(normalizedDay) || !Array.isArray(ranges)) continue;

    normalized[normalizedDay] = ranges
      .filter((range): range is { from: string; to: string } => {
        return !!range
          && typeof range === 'object'
          && typeof (range as any).from === 'string'
          && typeof (range as any).to === 'string'
          && TIME_RE.test((range as any).from)
          && TIME_RE.test((range as any).to)
          && toMinutes((range as any).to) > toMinutes((range as any).from);
      })
      .map((range) => ({ from: range.from, to: range.to }))
      .sort((a, b) => toMinutes(a.from) - toMinutes(b.from))
      .reduce<{ from: string; to: string }[]>((acc, range) => {
        const previous = acc[acc.length - 1];
        if (!previous || toMinutes(range.from) >= toMinutes(previous.to)) {
          acc.push(range);
        }
        return acc;
      }, []);
  }

  return Object.values(normalized).some((ranges) => ranges.length > 0) ? normalized : null;
};

const hasAvailabilityConfig = (config: unknown) => {
  return !!config
    && typeof config === 'object'
    && !Array.isArray(config)
    && Object.values(config as Record<string, unknown>).some((ranges) => Array.isArray(ranges) && ranges.length > 0);
};

const normalizeCertifications = (items: unknown) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => typeof item === 'string' ? { certificationName: item, issuingOrganization: '' } : item)
    .filter((item) => item && typeof item === 'object' && typeof (item as any).certificationName === 'string' && (item as any).certificationName.trim())
    .map((item: any) => ({
      id: item.id || Math.random().toString(36).slice(2),
      certificationName: item.certificationName.trim(),
      issuingOrganization: typeof item.issuingOrganization === 'string' ? item.issuingOrganization.trim() : '',
      credentialId: item.credentialId || null,
      credentialUrl: item.credentialUrl || null,
      imageUrl: item.imageUrl || null,
      issueDate: item.issueDate || null,
      expiryDate: item.doesNotExpire ? null : item.expiryDate || null,
      doesNotExpire: Boolean(item.doesNotExpire),
      description: item.description || null,
    }));
};

const normalizeEducation = (items: unknown) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => typeof item === 'string' ? { institutionName: item } : item)
    .filter((item) => item && typeof item === 'object' && typeof (item as any).institutionName === 'string' && (item as any).institutionName.trim())
    .map((item: any) => ({
      id: item.id || Math.random().toString(36).slice(2),
      institutionName: item.institutionName.trim(),
      degree: item.degree || null,
      fieldOfStudy: item.fieldOfStudy || null,
      grade: item.grade || null,
      startDate: item.startDate || null,
      endDate: item.isCurrent ? null : item.endDate || null,
      isCurrent: Boolean(item.isCurrent),
      description: item.description || null,
    }));
};

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const buildAuthPayload = async (user: any) => {
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

  return {
    token,
    role: user.role,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      role: user.role,
      referralCode: user.referralCode,
      referralCount: user.referralCount || 0,
    },
  };
};

const verifyGoogleIdToken = async (idToken: string) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID is not configured');
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload?.email || !payload.email_verified) {
    throw new Error('Google email is not verified');
  }

  return payload;
};


export const register = async (req: Request, res: Response) => {
  let { email, phone, password, firstName, lastName, role, referralCode } = req.body;

  if (role === 'tutor') {
    role = 'teacher';
  }

  try {
    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({ error: 'All required fields must be provided' });
    }

    // Check if user exists by email
    const existingEmail = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    if (phone) {
      const existingPhone = await db.query.users.findFirst({
        where: eq(users.phone, phone),
      });
      if (existingPhone) {
        return res.status(400).json({ error: 'Phone number already registered' });
      }
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
      phone: phone || null,
      passwordHash: hashed,
      firstName,
      lastName,
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

export const googleRegister = async (req: Request, res: Response) => {
  let { idToken, role, referralCode } = req.body;

  if (role === 'tutor') {
    role = 'teacher';
  }

  try {
    if (!idToken || !role) {
      return res.status(400).json({ error: 'Google token and role are required' });
    }

    if (!['parent', 'teacher'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role selected' });
    }

    const googleUser = await verifyGoogleIdToken(idToken);
    const email = googleUser.email!.toLowerCase();

    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered. Please sign in with Google instead.' });
    }

    let referredById: string | null = null;
    if (referralCode) {
      const referrer = await db.query.users.findFirst({
        where: eq(users.referralCode, referralCode),
      });
      if (referrer) {
        referredById = referrer.id;
      }
    }

    const names = (googleUser.name || '').trim().split(/\s+/).filter(Boolean);
    const firstName = googleUser.given_name || names[0] || 'Google';
    const lastName = googleUser.family_name || names.slice(1).join(' ') || 'User';
    const userId = Math.random().toString(36).substring(2, 15);
    const generatedReferralCode = createReferralCode(8);

    const [createdUser] = await db.insert(users).values({
      id: userId,
      email,
      phone: null,
      passwordHash: null,
      firstName,
      lastName,
      role,
      isVerified: true,
      emailVerified: true,
      trustScore: 0,
      referralCode: generatedReferralCode,
      referralCount: 0,
      referredBy: referredById,
      referralRewarded: false,
      photoUrl: googleUser.picture || null,
    }).returning();

    if (role === 'teacher') {
      await db.insert(teacherProfiles).values({
        userId,
        baseHourlyRate: '0',
        totalEarnings: '0',
        ratingAvg: '0',
        totalSessions: 0,
        isApproved: false,
      }).onConflictDoNothing();
    } else {
      await db.insert(parentProfiles).values({
        userId,
      }).onConflictDoNothing();
    }

    await ensureUserWallets(userId, role);

    if (referredById) {
      await registerReferral(referredById, userId);
      await db.update(users)
        .set({ referralRewarded: true })
        .where(eq(users.id, userId));
    }

    res.status(201).json(await buildAuthPayload(createdUser));
    logger.info({ userId, email, role }, 'New Google user registered successfully');
  } catch (err: any) {
    logger.error({ err }, 'Google registration error');
    res.status(500).json({ error: err.message || 'Google registration failed. Please try again later.' });
  }
};

export const googleLogin = async (req: Request, res: Response) => {
  const { idToken } = req.body;

  try {
    if (!idToken) {
      return res.status(400).json({ error: 'Google token is required' });
    }

    const googleUser = await verifyGoogleIdToken(idToken);
    const email = googleUser.email!.toLowerCase();
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return res.status(404).json({ error: 'No account found for this Google email. Please register first.' });
    }

    if (!user.isVerified) {
      await db.update(users)
        .set({ isVerified: true, emailVerified: true, photoUrl: user.photoUrl || googleUser.picture || null })
        .where(eq(users.id, user.id));

      if (user.role === 'teacher') {
        await db.insert(teacherProfiles).values({
          userId: user.id,
          baseHourlyRate: '0',
          totalEarnings: '0',
          ratingAvg: '0',
          totalSessions: 0,
          isApproved: false,
        }).onConflictDoNothing();
      } else if (user.role === 'parent') {
        await db.insert(parentProfiles).values({
          userId: user.id,
        }).onConflictDoNothing();
      }

      await ensureUserWallets(user.id, user.role);

      if (user.referredBy && !user.referralRewarded) {
        await registerReferral(user.referredBy, user.id);
        await db.update(users)
          .set({ referralRewarded: true })
          .where(eq(users.id, user.id));
      }
    }

    const authUser = { ...user, isVerified: true, photoUrl: user.photoUrl || googleUser.picture || null };
    res.json(await buildAuthPayload(authUser));
    logger.info({ userId: user.id, role: user.role }, 'User logged in with Google successfully');
  } catch (err: any) {
    logger.error({ err }, 'Google login error');
    res.status(500).json({ error: err.message || 'Google login failed. Please try again later.' });
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
      .set({ isVerified: true, emailVerified: true })
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
        ratingAvg: '0',
        totalSessions: 0,
        isApproved: false,
      }).onConflictDoNothing();
    } else if (user.role === 'parent') {
      await db.insert(parentProfiles).values({
        userId: user.id,
      }).onConflictDoNothing();
    }

    await ensureUserWallets(user.id, user.role);

    // Register referral tracking row (reward credited later, on subscription)
    if (user.referredBy && !user.referralRewarded) {
      await registerReferral(user.referredBy, user.id);
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
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
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

    const valid = await bcrypt.compare(password, user.passwordHash || '');
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);
      const otp = generateOTP();

      await db.insert(verificationTokens).values({
        id: Math.random().toString(36).substring(2, 15),
        userId: user.id,
        token: verificationToken,
        otp,
        type: 'register',
        expiresAt: otpExpiry,
      });

      try {
        await emailService.sendVerificationEmail(user.email, otp);
      } catch (err: any) {
        logger.warn({ err }, 'Email send warning');
      }

      return res.status(403).json({
        error: 'Account not verified. A new OTP has been sent to your email.',
        requiresVerification: true,
        verificationToken
      });
    }

    if (user.twoFactorEnabled) {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);
      const otp = generateOTP();

      await db.insert(verificationTokens).values({
        id: Math.random().toString(36).substring(2, 15),
        userId: user.id,
        token: verificationToken,
        otp,
        type: 'login',
        expiresAt: otpExpiry,
      });

      try {
        await emailService.send2faOtpEmail(user.email, otp);
      } catch (err: any) {
        logger.warn({ err }, '2FA Email send warning');
      }

      return res.status(200).json({
        message: 'Two-factor authentication code sent to your email.',
        requires2FA: true,
        verificationToken,
        testOTP: process.env.NODE_ENV === 'development' ? otp : undefined,
      });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    res.json({
      token,
      role: user.role,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        referralCode: user.referralCode,
        referralCount: user.referralCount || 0,
      },
    });
    logger.info({ userId: user.id, role: user.role }, 'User logged in successfully');
  } catch (err: any) {
    logger.error({ err }, 'Login error');
    res.status(500).json({ error: 'Login failed. Please try again later.' });
  }
};

export const resendOtp = async (req: Request, res: Response) => {
  const { token } = req.body;
  try {
    if (!token) {
      return res.status(400).json({ error: 'Verification token required' });
    }

    const tokenRecord = await db.query.verificationTokens.findFirst({
      where: eq(verificationTokens.token, token),
    });

    if (!tokenRecord) {
      return res.status(404).json({ error: 'Token not found. Please log in again.' });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, tokenRecord.userId),
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: 'User is already verified.' });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);

    await db.update(verificationTokens)
      .set({
        otp,
        expiresAt: otpExpiry,
      })
      .where(eq(verificationTokens.id, tokenRecord.id));

    try {
      if (tokenRecord.type === 'login') {
        await emailService.send2faOtpEmail(user.email, otp);
      } else {
        await emailService.sendVerificationEmail(user.email, otp);
      }
    } catch (err: any) {
      logger.warn({ err }, 'Email send warning');
    }

    res.json({ message: 'OTP resent successfully.' });
  } catch (err: any) {
    logger.error({ err }, 'Resend OTP error');
    res.status(500).json({ error: 'Failed to resend OTP. Please try again later.' });
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
    const [certificationRows, educationRows] = await Promise.all([
      db.query.teacherCertifications.findMany({ where: eq(teacherCertifications.userId, userId) }),
      db.query.teacherEducations.findMany({ where: eq(teacherEducations.userId, userId) }),
    ]);
    const teacherData = teacherProfile ? {
      pronouns: teacherProfile.pronouns || '',
      highestDegree: teacherProfile.highestDegree || '',
      institution: teacherProfile.institution || '',
      yearsOfExperience: teacherProfile.yearsOfExperience || 0,
      languages: teacherProfile.languages || [],
      subjects: teacherProfile.subjects || [],
      educationLevels: teacherProfile.educationLevels || [],
      sessionFormats: teacherProfile.sessionFormats || [],
      deliveryModes: teacherProfile.deliveryModes || [],
      baseHourlyRate: teacherProfile.baseHourlyRate,
      hourlyRate: teacherProfile.baseHourlyRate,
      availability: teacherProfile.availability,
      availabilityConfig: teacherProfile.availabilityConfig,
      certifications: normalizeCertifications(certificationRows),
      education: normalizeEducation(educationRows),
      qualification: normalizeCertifications(certificationRows)[0]?.certificationName || '',
      idVerified: teacherProfile.idVerified,
      photo: teacherProfile.photoUrl,
      videoVerified: teacherProfile.videoVerified,
      isVerified: teacherProfile.isVerified,
    } : null;

    res.json({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      role: user.role,
      bio: user.bio,
      photoUrl: user.photoUrl,
      photo: teacherData?.photo || user.photoUrl,
      referralCode: user.referralCode,
      referralCount: user.referralCount || 0,
      referredBy: user.referredBy,
      twoFactorEnabled: user.twoFactorEnabled || false,
      ...(teacherData || {}),
      teacherProfile: teacherData,
    });
  } catch (err: any) {
    logger.error({ err }, 'Could not fetch profile');
    res.status(500).json({ error: 'Unable to fetch profile' });
  }
};




/* ---- ---- ---  REVIEWED CODE ABOVE --- --- --- */






/**
 * POST /auth/forgot-password
 * Accepts an email, creates a password_reset token, and emails a magic link.
 */
export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;

  // Always return the same response to prevent user enumeration
  const safeResponse = () =>
    res.json({ message: 'If that email is registered, a reset link has been sent.' });

  try {
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      // Respond 200 even when user not found — prevents enumeration
      return safeResponse();
    }

    // Create a secure reset token (1-hour expiry)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.insert(verificationTokens).values({
      id: Math.random().toString(36).substring(2, 15),
      userId: user.id,
      token: resetToken,
      otp: '000000', // Not used for password reset; required by schema
      type: 'password_reset',
      expiresAt,
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    try {
      await emailService.sendPasswordResetEmail(user.email, resetUrl);
    } catch (err: any) {
      logger.warn({ err }, 'Password reset email send warning');
    }

    logger.info({ userId: user.id }, 'Password reset requested');
    return safeResponse();
  } catch (err: any) {
    logger.error({ err }, 'Forgot password error');
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
};

/**
 * GET /auth/validate-reset-token?token=...
 * Validates a password reset token without consuming it.
 * Returns { valid: true } or { valid: false, error: '...' }
 */
export const validateResetToken = async (req: Request, res: Response) => {
  const { token } = req.query as { token?: string };

  try {
    if (!token) {
      return res.status(400).json({ valid: false, error: 'Token is required' });
    }

    const tokenRecord = await db.query.verificationTokens.findFirst({
      where: and(
        eq(verificationTokens.token, token),
        eq(verificationTokens.type, 'password_reset')
      ),
    });

    if (!tokenRecord) {
      return res.status(400).json({ valid: false, error: 'Invalid or expired reset link' });
    }

    if (tokenRecord.usedAt) {
      return res.status(400).json({ valid: false, error: 'This reset link has already been used' });
    }

    if (new Date() > tokenRecord.expiresAt) {
      return res.status(400).json({ valid: false, error: 'This reset link has expired' });
    }

    return res.json({ valid: true });
  } catch (err: any) {
    logger.error({ err }, 'Validate reset token error');
    res.status(500).json({ valid: false, error: 'Something went wrong. Please try again later.' });
  }
};

/**
 * POST /auth/reset-password
 * Validates the token, hashes the new password, updates the user, marks the token used.
 */
export const resetPassword = async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;

  try {
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const tokenRecord = await db.query.verificationTokens.findFirst({
      where: and(
        eq(verificationTokens.token, token),
        eq(verificationTokens.type, 'password_reset')
      ),
    });

    if (!tokenRecord) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    if (tokenRecord.usedAt) {
      return res.status(400).json({ error: 'This reset link has already been used' });
    }

    if (new Date() > tokenRecord.expiresAt) {
      return res.status(400).json({ error: 'This reset link has expired' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, tokenRecord.userId));

    await db.update(verificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(verificationTokens.id, tokenRecord.id));

    logger.info({ userId: tokenRecord.userId }, 'Password reset successfully');
    res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (err: any) {
    logger.error({ err }, 'Reset password error');
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
};





/**
 * registerReferral
 * Called at referee email verification.
 * Creates a 'pending' referral row — no credit yet.
 * Increments the referrer's referralCount.
 */
async function registerReferral(referrerId: string, refereeId: string): Promise<void> {
  const referrer = await db.query.users.findFirst({
    where: eq(users.id, referrerId),
  });
  if (!referrer) return;

  // Increment count on the referrer
  const newCount = (referrer.referralCount || 0) + 1;
  await db.update(users)
    .set({ referralCount: newCount })
    .where(eq(users.id, referrerId));

  // Insert tracking row
  const referralId = Math.random().toString(36).substring(2, 15);
  await db.insert(referrals).values({
    id: referralId,
    referrerId,
    refereeId,
    status: 'pending',
    rewardCredited: false,
  });

  logger.info({ referrerId, refereeId }, 'Referral registered (pending subscription)');
}

/**
 * creditReferralReward
 * Called by the subscription controller when a referee completes their FIRST subscription.
 * Marks the referral as 'subscribed', records the plan/price/reward,
 * and applies the credit to the referrer's wallet/discount balance.
 *
 * @param refereeId   - the user who just subscribed
 * @param plan        - 'monthly' | 'quarterly' | 'annual'
 * @param price       - actual amount paid (₦)
 */
export async function creditReferralReward(
  refereeId: string,
  plan: string,
  price: number,
): Promise<void> {
  // Find the pending referral row for this referee
  const referral = await db.query.referrals.findFirst({
    where: and(
      eq(referrals.refereeId, refereeId),
      eq(referrals.status, 'pending'),
    ),
  });

  if (!referral || referral.rewardCredited) return; // no referral, or already credited

  const rewardAmount = PLAN_REWARDS[plan] ?? Math.round(price * 0.10);

  // Update the referral row with subscription details
  await db.update(referrals)
    .set({
      status: 'subscribed',
      subscriptionPlan: plan,
      subscriptionPrice: price.toString(),
      rewardAmount: rewardAmount.toString(),
      rewardCredited: true,
      rewardedAt: new Date(),
    })
    .where(eq(referrals.id, referral.id));

  // Fetch the referrer to determine reward type
  const referrer = await db.query.users.findFirst({
    where: eq(users.id, referral.referrerId),
  });
  if (!referrer) return;

  if (referrer.role === 'teacher' || referrer.role === 'parent') {
    await ensureUserWallets(referrer.id, referrer.role);
    await creditWallet({
      ownerId: referrer.id,
      walletType: 'referrals',
      amount: rewardAmount,
      type: 'referral_reward',
      referenceType: 'referral',
      referenceId: referral.id,
      description: 'Referral reward credited after referred user subscribed',
      metadata: { refereeId, plan, price },
    });
  }

  logger.info({ refereeId, referrerId: referral.referrerId, plan, rewardAmount }, 'Referral reward credited');
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
    const { 
      firstName, 
      lastName, 
      bio, 
      photoUrl,
      photo,
      pronouns,
      highestDegree,
      institution,
      yearsOfExperience,
      languages,
      subjects,
      hourlyRate,
      baseHourlyRate,
      availability,
      availabilityConfig,
      videoVerified,
      intro_video,
      certifications,
      education,
      qualification,
      educationLevels,
      sessionFormats,
      deliveryModes
    } = req.body;

    if ((firstName !== undefined && !firstName) || (lastName !== undefined && !lastName)) {
      return res.status(400).json({ error: 'First name and last name cannot be empty' });
    }

    const updateData: any = {};

    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (bio !== undefined) updateData.bio = bio;
    if (photo !== undefined) updateData.photoUrl = photo;
    if (photoUrl !== undefined) updateData.photoUrl = photoUrl;

    if (Object.keys(updateData).length > 0) {
      await db.update(users)
        .set(updateData)
        .where(eq(users.id, userId));
    }

    // Update teacher-specific profiles table if teacher role
    if (req.user.role === 'teacher') {
      const teacherUpdateData: any = {};
      if (pronouns !== undefined) teacherUpdateData.pronouns = pronouns;
      if (bio !== undefined) teacherUpdateData.bio = bio;
      if (photo !== undefined) teacherUpdateData.photoUrl = photo;
      if (photoUrl !== undefined) teacherUpdateData.photoUrl = photoUrl;
      if (highestDegree !== undefined) teacherUpdateData.highestDegree = highestDegree;
      if (institution !== undefined) teacherUpdateData.institution = institution;
      if (yearsOfExperience !== undefined) teacherUpdateData.yearsOfExperience = parseInt(yearsOfExperience) || 0;
      if (languages !== undefined) teacherUpdateData.languages = languages;
      if (subjects !== undefined) teacherUpdateData.subjects = subjects;
      if (hourlyRate !== undefined || baseHourlyRate !== undefined) {
        teacherUpdateData.baseHourlyRate = String(hourlyRate ?? baseHourlyRate ?? 0);
      }
      if (availability !== undefined || availabilityConfig !== undefined) {
        const normalizedConfig = normalizeAvailabilityConfig(availabilityConfig);
        teacherUpdateData.availabilityConfig = normalizedConfig;
        teacherUpdateData.availability = Boolean(availability) && hasAvailabilityConfig(normalizedConfig);
      }
      if (videoVerified !== undefined || intro_video !== undefined) teacherUpdateData.videoVerified = videoVerified ?? intro_video;
      if (educationLevels !== undefined) teacherUpdateData.educationLevels = educationLevels;
      if (sessionFormats !== undefined) teacherUpdateData.sessionFormats = sessionFormats;
      if (deliveryModes !== undefined) teacherUpdateData.deliveryModes = deliveryModes;

      if (Object.keys(teacherUpdateData).length > 0) {
        await db.update(teacherProfiles)
          .set(teacherUpdateData)
          .where(eq(teacherProfiles.userId, userId));
      }

      if (certifications !== undefined || qualification !== undefined) {
        const records = certifications !== undefined
          ? normalizeCertifications(certifications)
          : qualification ? normalizeCertifications([{ certificationName: qualification, issuingOrganization: '' }]) : [];
        await db.delete(teacherCertifications).where(eq(teacherCertifications.userId, userId));
        if (records.length > 0) {
          await db.insert(teacherCertifications).values(records.map((record) => ({
            userId,
            certificationName: record.certificationName,
            issuingOrganization: record.issuingOrganization,
            credentialId: record.credentialId || null,
            credentialUrl: record.credentialUrl || null,
            imageUrl: record.imageUrl || null,
            issueDate: record.issueDate || null,
            expiryDate: record.doesNotExpire ? null : record.expiryDate || null,
            doesNotExpire: Boolean(record.doesNotExpire),
            description: record.description || null,
            updatedAt: new Date(),
          })));
        }
      }

      if (education !== undefined) {
        const records = normalizeEducation(education);
        await db.delete(teacherEducations).where(eq(teacherEducations.userId, userId));
        if (records.length > 0) {
          await db.insert(teacherEducations).values(records.map((record) => ({
            userId,
            institutionName: record.institutionName,
            degree: record.degree || null,
            fieldOfStudy: record.fieldOfStudy || null,
            grade: record.grade || null,
            startDate: record.startDate || null,
            endDate: record.isCurrent ? null : record.endDate || null,
            isCurrent: Boolean(record.isCurrent),
            description: record.description || null,
            updatedAt: new Date(),
          })));
        }
      }
    }

    res.json({
      message: 'Profile updated successfully',
      data: {
        firstName,
        lastName,
        fullName: firstName && lastName ? `${firstName} ${lastName}` : undefined,
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

export const toggle2FA = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newStatus = !user.twoFactorEnabled;

    await db.update(users)
      .set({ twoFactorEnabled: newStatus })
      .where(eq(users.id, userId));

    logger.info({ userId, newStatus }, 'Two-factor authentication toggle');
    res.json({
      message: `Two-factor authentication has been ${newStatus ? 'enabled' : 'disabled'} successfully.`,
      twoFactorEnabled: newStatus,
    });
  } catch (err: any) {
    logger.error({ err }, '2FA toggle error');
    res.status(500).json({ error: 'Failed to toggle two-factor authentication. Please try again later.' });
  }
};

export const verify2FA = async (req: Request, res: Response) => {
  const { token, otp } = req.body;

  try {
    if (!token || !otp) {
      return res.status(400).json({ error: 'Token and OTP required' });
    }

    // Lookup token record
    const tokenRecord = await db.query.verificationTokens.findFirst({
      where: and(
        eq(verificationTokens.token, token),
        eq(verificationTokens.type, 'login')
      ),
    });

    if (!tokenRecord) {
      return res.status(400).json({ error: 'Invalid or expired 2FA request' });
    }

    if (tokenRecord.usedAt) {
      return res.status(400).json({ error: 'This 2FA code has already been used' });
    }

    if (new Date() > tokenRecord.expiresAt) {
      return res.status(400).json({ error: '2FA verification code has expired' });
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

    // Mark token as used
    await db.update(verificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(verificationTokens.id, tokenRecord.id));

    const jwtToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    res.json({
      token: jwtToken,
      role: user.role,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        referralCode: user.referralCode,
        referralCount: user.referralCount || 0,
      },
    });
    logger.info({ userId: user.id, role: user.role }, 'User 2FA verified successfully');
  } catch (err: any) {
    logger.error({ err }, '2FA verification error');
    res.status(500).json({ error: 'Verification failed. Please try again later.' });
  }
};

// ... Social Auth and Helper functions would follow similar patterns
