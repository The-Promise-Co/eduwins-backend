import { Request, Response } from 'express';
import { db } from '../database/db';
import {
  users,
  teacherProfiles,
  parentProfiles,
  children,
  teacherDocuments,
  teacherCertifications,
  teacherEducations,
  platformConfigs,
  wallets,
  bookings,
  withdrawals,
  sessionEvents,
  whiteboardSnapshots,
  transactions,
  lessons,
  disputes,
} from '../database/schema';
import { eq, sql, count, and, desc, isNull, or, ilike, asc } from 'drizzle-orm';
import logger from '../utils/logger';
import { emailService } from '../utils/emailSender';
import { calculateCourseSplits } from './paystack/verifyPayment';
import { settleBookingEscrow } from '../services/bookingSettlementService';

interface AuthenticatedRequest extends Request {
  admin?: {
    id: string;
    role: string;
    permissions: Record<string, any>;
  }
}

const VALID_CONFIG_TARGETS = ['tutor', 'welfare', 'platform_fee'];
const VALID_CONFIG_VALUE_TYPES = ['flat_fee', 'percentage'];

export const listPlatformConfigs = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const configs = await db.select().from(platformConfigs);
    res.json(configs);
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.platform_configs_list_failed');
    res.status(500).json({ error: 'Could not fetch platform configs' });
  }
};

export const createPlatformConfig = async (req: AuthenticatedRequest, res: Response) => {
  const { key, label, target, valueType, value, description, isActive } = req.body;

  if (!key || !label || !target || !valueType || value === undefined) {
    return res.status(400).json({ error: 'key, label, target, valueType and value are required' });
  }

  if (!VALID_CONFIG_TARGETS.includes(target)) {
    return res.status(400).json({ error: 'Invalid target' });
  }

  if (!VALID_CONFIG_VALUE_TYPES.includes(valueType)) {
    return res.status(400).json({ error: 'Invalid valueType' });
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return res.status(400).json({ error: 'value must be a non-negative number' });
  }

  if (valueType === 'percentage' && numericValue > 100) {
    return res.status(400).json({ error: 'percentage value cannot exceed 100' });
  }

  try {
    const id = Math.random().toString(36).substring(2, 15);
    const [config] = await db.insert(platformConfigs).values({
      id,
      key,
      label,
      target,
      valueType,
      value: numericValue.toString(),
      description,
      isActive: isActive ?? true,
      updatedAt: new Date(),
    }).returning();

    res.status(201).json(config);
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, key, target }, 'admin.platform_config_create_failed');
    res.status(500).json({ error: 'Could not create platform config' });
  }
};

export const updatePlatformConfig = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { key, label, target, valueType, value, description, isActive } = req.body;

  if (target && !VALID_CONFIG_TARGETS.includes(target)) {
    return res.status(400).json({ error: 'Invalid target' });
  }

  if (valueType && !VALID_CONFIG_VALUE_TYPES.includes(valueType)) {
    return res.status(400).json({ error: 'Invalid valueType' });
  }

  const updateData: any = { updatedAt: new Date() };
  if (key !== undefined) updateData.key = key;
  if (label !== undefined) updateData.label = label;
  if (target !== undefined) updateData.target = target;
  if (valueType !== undefined) updateData.valueType = valueType;
  if (description !== undefined) updateData.description = description;
  if (isActive !== undefined) updateData.isActive = isActive;

  if (value !== undefined) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      return res.status(400).json({ error: 'value must be a non-negative number' });
    }
    if ((valueType || req.body.valueType) === 'percentage' && numericValue > 100) {
      return res.status(400).json({ error: 'percentage value cannot exceed 100' });
    }
    updateData.value = numericValue.toString();
  }

  try {
    const [config] = await db.update(platformConfigs)
      .set(updateData)
      .where(eq(platformConfigs.id, id))
      .returning();

    if (!config) return res.status(404).json({ error: 'Config not found' });
    res.json(config);
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, configId: id }, 'admin.platform_config_update_failed');
    res.status(500).json({ error: 'Could not update platform config' });
  }
};

export const deletePlatformConfig = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const [config] = await db.update(platformConfigs)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(platformConfigs.id, id))
      .returning();

    if (!config) return res.status(404).json({ error: 'Config not found' });
    res.json({ message: 'Config disabled', config });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, configId: id }, 'admin.platform_config_disable_failed');
    res.status(500).json({ error: 'Could not disable platform config' });
  }
};

export const listVettingQueue = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const teachers = await db.select({
      id: users.id,
      full_name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
      email: users.email,
      base_hourly_rate: teacherProfiles.baseHourlyRate,
      photoUrl: teacherProfiles.photoUrl,
      videoVerified: teacherProfiles.videoVerified,
      isAdminApproved: teacherProfiles.isAdminApproved,
      isVerified: teacherProfiles.isVerified,
      qualification: teacherProfiles.highestDegree,
      subjects: teacherProfiles.subjects,
      yearsExperience: teacherProfiles.yearsOfExperience,
      fullName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
      baseHourlyRate: teacherProfiles.baseHourlyRate,
    })
      .from(users)
      .innerJoin(teacherProfiles, eq(users.id, teacherProfiles.userId))
      .where(and(
        eq(users.role, 'teacher'),
        eq(teacherProfiles.isAdminApproved, false),
        isNull(users.deletedAt),
      ));

    // Attach documents for each teacher
    const result = await Promise.all(teachers.map(async (teacher) => {
      const docs = await db.query.teacherDocuments.findMany({
        where: eq(teacherDocuments.teacherId, teacher.id),
      });
      return { ...teacher, documents: docs };
    }));

    res.json(result);
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.vetting_queue_failed');
    res.status(500).json({ error: 'Could not fetch vetting queue' });
  }
};

export const processVetting = async (req: AuthenticatedRequest, res: Response) => {
  const { teacherId } = req.params;
  const { action } = req.body;

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    await db.update(teacherProfiles)
      .set({
        isAdminApproved: action === 'approve',
        isVerified: action === 'approve',
        updatedAt: new Date(),
      })
      .where(eq(teacherProfiles.userId, teacherId));

    res.json({ message: `Teacher ${action}d successfully`, teacherId, action });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, teacherId, action }, 'admin.vetting_process_failed');
    res.status(500).json({ error: 'Could not process vetting' });
  }
};

export const verifyDocument = async (req: AuthenticatedRequest, res: Response) => {
  const { documentId } = req.params;

  try {
    await db.update(teacherDocuments)
      .set({ verified: true, verifiedAt: new Date() })
      .where(eq(teacherDocuments.id, documentId));

    res.json({ message: 'Document verified successfully' });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, documentId }, 'admin.document_verify_failed');
    res.status(500).json({ error: 'Could not verify document' });
  }
};

export const rejectDocument = async (req: AuthenticatedRequest, res: Response) => {
  const { documentId } = req.params;

  try {
    await db.update(teacherDocuments)
      .set({ verified: false, verifiedAt: new Date() })
      .where(eq(teacherDocuments.id, documentId));

    res.json({ message: 'Document rejected' });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, documentId }, 'admin.document_reject_failed');
    res.status(500).json({ error: 'Could not reject document' });
  }
};

// export const payoutEscrow = async (req: AuthenticatedRequest, res: Response) => {
//   const { bookingId } = req.params;

//   try {
//     const booking = await db.query.bookings.findFirst({
//       where: eq(bookings.id, bookingId),
//     });

//     if (!booking) return res.status(404).json({ error: 'Booking not found' });

//     await db.update(bookings)
//       .set({ status: 'completed' }) // Or a specific 'paid_out' status if exists
//       .where(eq(bookings.id, bookingId));

//     res.json({ message: 'Escrow payout executed', bookingId });
//   } catch (err: any) {
//     console.error('Escrow payout error:', err);
//     res.status(500).json({ error: 'Could not execute escrow payout' });
//   }
// };

// export const listDisputes = async (req: AuthenticatedRequest, res: Response) => {
//   try {
//     const list = await db.select().from(disputes).orderBy(desc(disputes.createdAt));
//     res.json(list);
//   } catch (err: any) {
//     console.error('List disputes error:', err);
//     res.status(500).json({ error: 'Could not fetch disputes' });
//   }
// };

// export const createDispute = async (req: AuthenticatedRequest, res: Response) => {
//   const { bookingId, issue, notes } = req.body;
//   if (!bookingId || !issue) return res.status(400).json({ error: 'bookingId and issue are required' });

//   try {
//     const id = Math.random().toString(36).substring(2, 15);
//     const newDispute = {
//       id,
//       bookingId,
//       issue,
//       notes,
//       status: 'open',
//       createdAt: new Date(),
//     };
//     await db.insert(disputes).values(newDispute);
//     res.status(201).json(newDispute);
//   } catch (err: any) {
//     console.error('Create dispute error:', err);
//     res.status(500).json({ error: 'Could not create dispute' });
//   }
// };

// export const updateDispute = async (req: AuthenticatedRequest, res: Response) => {
//   const { disputeId } = req.params;
//   const { status, resolution } = req.body;

//   try {
//     await db.update(disputes)
//       .set({ status, resolution, updatedAt: new Date() })
//       .where(eq(disputes.id, disputeId));

//     res.json({ id: disputeId, status, message: 'Dispute updated successfully' });
//   } catch (err: any) {
//     console.error('Update dispute error:', err);
//     res.status(500).json({ error: 'Could not update dispute' });
//   }
// };

export const getWelfareAnalytics = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Single source of truth: teacher welfare wallet balances.
    const [totals] = await db.select({
      total: sql<number>`coalesce(sum(${wallets.balance}), 0)`,
      teachers: sql<number>`count(distinct ${wallets.ownerId})`,
    })
      .from(wallets)
      .where(and(eq(wallets.ownerType, 'user'), eq(wallets.walletType, 'welfare')));

    res.json({
      totalAccumulated: parseFloat(totals?.total?.toString() || '0'),
      teachersWithFunds: Number(totals?.teachers || 0),
    });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.welfare_analytics_failed');
    res.status(500).json({ error: 'Could not fetch welfare analytics' });
  }
};

export const getAdminOverview = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const totalUsersResult = await db.select({ count: sql<number>`count(*)` }).from(users).where(isNull(users.deletedAt));
    const totalTeachersResult = await db.select({ count: sql<number>`count(distinct ${teacherProfiles.userId})` })
      .from(teacherProfiles)
      .innerJoin(users, eq(users.id, teacherProfiles.userId))
      .where(isNull(users.deletedAt));
    const totalParentsResult = await db.select({ count: sql<number>`count(distinct ${parentProfiles.userId})` })
      .from(parentProfiles)
      .innerJoin(users, eq(users.id, parentProfiles.userId))
      .where(isNull(users.deletedAt));
    const pendingVettingResult = await db.select({ count: sql<number>`count(distinct ${teacherProfiles.userId})` })
      .from(teacherProfiles)
      .innerJoin(users, eq(users.id, teacherProfiles.userId))
      .where(and(eq(teacherProfiles.isAdminApproved, false), isNull(users.deletedAt)));

    res.json({
      totalUsers: totalUsersResult[0].count || 0,
      totalTeachers: totalTeachersResult[0].count || 0,
      totalParents: totalParentsResult[0].count || 0,
      pendingRentApplications: pendingVettingResult[0].count || 0,
      totalVaultItems: 0,
    });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.overview_failed');
    res.status(500).json({ error: 'Could not fetch overview' });
  }
};

export const listBookingsPending = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await db.select({
      id: bookings.id,
      parentName: sql<string>`coalesce((SELECT "users"."first_name" || ' ' || "users"."last_name" FROM "users" WHERE "users"."id" = "bookings"."parent_id"), 'Unknown')`,
      teacherName: sql<string>`coalesce((SELECT "users"."first_name" || ' ' || "users"."last_name" FROM "users" WHERE "users"."id" = "bookings"."teacher_id"), 'Unknown')`,
      totalCost: bookings.totalAmount,
      totalSessions: sql<number>`1`,
      status: bookings.status,
      createdAt: bookings.createdAt,
    })
      .from(bookings)
      .where(eq(bookings.status, 'paid_escrow'));

    res.json(result);
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.bookings_pending_failed');
    res.status(500).json({ error: 'Could not fetch pending bookings' });
  }
};

export const listAllBookings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 15));
    const offset = (page - 1) * limit;
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : null;
    const searchFilter = typeof req.query.search === 'string' ? req.query.search.trim() : null;
    const sort =
      typeof req.query.sort === 'string' && ['newest', 'oldest', 'amount-high', 'amount-low', 'name-asc', 'name-desc'].includes(req.query.sort)
        ? req.query.sort
        : 'newest';

    const teacherName = sql<string>`(SELECT "users"."first_name" || ' ' || "users"."last_name" FROM "users" WHERE "users"."id" = "bookings"."teacher_id")`;

    const conditions: any[] = [];
    if (statusFilter && statusFilter !== 'all') {
      conditions.push(eq(bookings.status, statusFilter));
    }
    if (searchFilter) {
      const like = `%${searchFilter}%`;
      const nameLike = `%${searchFilter.toLowerCase()}%`;
      conditions.push(
        or(
          ilike(bookings.id, like),
          ilike(sql`"bookings"."parent_id"`, like),
          sql`(${teacherName}) ilike ${nameLike}`,
          sql`(SELECT "users"."first_name" || ' ' || "users"."last_name" FROM "users" WHERE "users"."id" = "bookings"."parent_id") ilike ${nameLike}`,
        ),
      );
    }
    const where = and(...conditions);

    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(bookings).where(where);
    const totalCount = total ?? 0;

    const orderBy = (() => {
      switch (sort) {
        case 'oldest':
          return asc(bookings.createdAt);
        case 'amount-high':
          return desc(bookings.totalAmount);
        case 'amount-low':
          return asc(bookings.totalAmount);
        case 'name-asc':
          return asc(teacherName);
        case 'name-desc':
          return desc(teacherName);
        default:
          return desc(bookings.createdAt);
      }
    })();

    const result = await db.select({
      id: bookings.id,
      parentName: sql<string>`coalesce((SELECT "users"."first_name" || ' ' || "users"."last_name" FROM "users" WHERE "users"."id" = "bookings"."parent_id"), 'Unknown')`,
      teacherName: sql<string>`coalesce((SELECT "users"."first_name" || ' ' || "users"."last_name" FROM "users" WHERE "users"."id" = "bookings"."teacher_id"), 'Unknown')`,
      parentId: bookings.parentId,
      teacherId: bookings.teacherId,
      totalCost: bookings.totalAmount,
      totalSessions: sql<number>`1`,
      status: bookings.status,
      createdAt: bookings.createdAt,
    })
      .from(bookings)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    res.json({
      data: result,
      pagination: { page, limit, total: totalCount, totalPages: Math.max(1, Math.ceil(totalCount / limit)) },
    });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.all_bookings_failed');
    res.status(500).json({ error: 'Could not fetch bookings' });
  }
};

export const listAdminUsers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await db.select({
      id: users.id,
      email: users.email,
      fullName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
      role: users.role,
      isVerified: users.isVerified,
      status: users.status,
      createdAt: users.createdAt,
    })
      .from(users)
      .where(isNull(users.deletedAt))
      .orderBy(desc(users.createdAt));

    res.json(result);
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.users_list_failed');
    res.status(500).json({ error: 'Could not fetch users' });
  }
};

export const updateUserStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'disabled'].includes(status)) {
      return res.status(400).json({ error: 'status must be "active" or "disabled"' });
    }

    const existing = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (existing.deletedAt) {
      return res.status(400).json({ error: 'Cannot change status of a deleted user' });
    }

    const updatedAt = new Date();
    await db.update(users)
      .set({ status, updatedAt })
      .where(eq(users.id, id));

    res.json({ message: `User ${status === 'active' ? 'enabled' : 'disabled'}`, userId: id, status });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, userId: req.params.id }, 'admin.user_status_update_failed');
    res.status(500).json({ error: 'Could not update user status' });
  }
};

export const listPendingWithdrawals = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await db.select({
      id: withdrawals.id,
      teacherId: withdrawals.teacherId,
      teacherName: sql<string>`coalesce((SELECT "users"."first_name" || ' ' || "users"."last_name" FROM "users" WHERE "users"."id" = "withdrawals"."teacher_id"), 'Unknown')`,
      amount: withdrawals.amount,
      status: withdrawals.status,
      bankName: withdrawals.bankCode,
      accountNumber: withdrawals.accountNumber,
      createdAt: withdrawals.createdAt,
    })
      .from(withdrawals)
      .where(eq(withdrawals.status, 'pending'))
      .orderBy(desc(withdrawals.createdAt));

    res.json(result);
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.pending_withdrawals_failed');
    res.status(500).json({ error: 'Could not fetch pending withdrawals' });
  }
};

export const retryBookingSettlement = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { bookingId } = req.params;
    if (!bookingId) return res.status(400).json({ error: 'bookingId is required' });
    const outcome = await settleBookingEscrow(bookingId);
    res.json({ bookingId, ...outcome });
  } catch (err: any) {
    logger.error({ err }, 'Retry booking settlement error');
    res.status(500).json({ error: err.message || 'Settlement failed' });
  }
};

export const listDisputes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await db.select().from(disputes).orderBy(desc(disputes.createdAt));
    // snake_case to match the existing admin UI (Dispute type).
    res.json(rows.map((d) => ({
      id: d.id,
      booking_id: d.bookingId,
      status: d.status,
      issue: d.issue,
      created_by: d.createdBy,
      resolution: d.resolution,
      created_at: d.createdAt,
    })));
  } catch (err: any) {
    logger.error({ err }, 'List disputes error');
    res.status(500).json({ error: 'Could not fetch disputes' });
  }
};

export const updateDispute = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { disputeId } = req.params;
    const { status, resolution } = req.body;

    if (status !== 'resolved' && status !== 'rejected') {
      return res.status(400).json({ error: "status must be 'resolved' or 'rejected'" });
    }

    const existing = await db.query.disputes.findFirst({ where: eq(disputes.id, disputeId) });
    if (!existing) return res.status(404).json({ error: 'Dispute not found' });
    if (existing.status !== 'open') {
      return res.status(409).json({ error: `Dispute is already ${existing.status}` });
    }

    const [updated] = await db.update(disputes)
      .set({ status, resolution: resolution || null, updatedAt: new Date() })
      .where(eq(disputes.id, disputeId))
      .returning();

    res.json({ id: updated.id, status: updated.status, message: 'Dispute updated successfully' });
  } catch (err: any) {
    logger.error({ err }, 'Update dispute error');
    res.status(500).json({ error: 'Could not update dispute' });
  }
};

// ── Admin Teacher Management ────────────────────────────────────────────────

function calcProfileCompletion(tp: any, extra?: { hasCertifications?: boolean; hasEducation?: boolean }): number {
  const fields = [
    tp.photoUrl,                                              // Profile picture
    tp.bio,                                                   // Bio
    tp.subjects?.length > 0,                                  // Subjects
    tp.videoVerified,                                         // Video intro
    tp.availability && tp.availabilityConfig && Object.keys(tp.availabilityConfig).length > 0, // Availability schedule
    tp.baseHourlyRate && Number(tp.baseHourlyRate) > 0,       // Hourly pay
    extra?.hasCertifications,                                  // Certification
    extra?.hasEducation,                                       // Education
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}

export const listAllTeachers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const teachers = await db.select({
      id: users.id,
      fullName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
      email: users.email,
      phone: users.phone,
      photoUrl: teacherProfiles.photoUrl,
      bio: teacherProfiles.bio,
      subjects: teacherProfiles.subjects,
      baseHourlyRate: teacherProfiles.baseHourlyRate,
      ratingAvg: teacherProfiles.ratingAvg,
      totalSessions: teacherProfiles.totalSessions,
      qualification: teacherProfiles.highestDegree,
      yearsOfExperience: teacherProfiles.yearsOfExperience,
      locationState: teacherProfiles.locationState,
      locationLga: teacherProfiles.locationLga,
      locationArea: teacherProfiles.locationArea,
      isAdminApproved: teacherProfiles.isAdminApproved,
      isVerified: teacherProfiles.isVerified,
      deletedAt: users.deletedAt,
      status: users.status,
      createdAt: users.createdAt,
      // Raw fields for completion calc
      languages: teacherProfiles.languages,
      educationLevels: teacherProfiles.educationLevels,
      sessionFormats: teacherProfiles.sessionFormats,
      deliveryModes: teacherProfiles.deliveryModes,
      availability: teacherProfiles.availability,
    })
      .from(users)
      .innerJoin(teacherProfiles, eq(users.id, teacherProfiles.userId))
      .where(and(eq(users.role, 'teacher'), isNull(users.deletedAt)))
      .orderBy(desc(users.createdAt));

    // Count documents per teacher
    const docCounts = await db.select({
      teacherId: teacherDocuments.teacherId,
      count: count(),
    })
      .from(teacherDocuments)
      .groupBy(teacherDocuments.teacherId);

    const docCountMap = new Map(docCounts.map((d) => [d.teacherId, d.count]));

    // Check certifications and education per teacher
    const certUserIds = await db.select({ userId: teacherCertifications.userId })
      .from(teacherCertifications)
      .groupBy(teacherCertifications.userId);
    const certSet = new Set(certUserIds.map((c) => c.userId));

    const eduUserIds = await db.select({ userId: teacherEducations.userId })
      .from(teacherEducations)
      .groupBy(teacherEducations.userId);
    const eduSet = new Set(eduUserIds.map((e) => e.userId));

    const result = teachers.map((t) => {
      const { languages, educationLevels, sessionFormats, deliveryModes, availability, ...rest } = t;
      return {
        ...rest,
        profileCompletion: calcProfileCompletion({ ...t }, { hasCertifications: certSet.has(t.id), hasEducation: eduSet.has(t.id) }),
        documentsCount: docCountMap.get(t.id) || 0,
      };
    });

    res.json(result);
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.teachers_list_failed');
    res.status(500).json({ error: 'Could not fetch teachers' });
  }
};

export const getTeacherDetail = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const [teacher] = await db.select({
      id: users.id,
      fullName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
      photoUrl: teacherProfiles.photoUrl,
      bio: teacherProfiles.bio,
      subjects: teacherProfiles.subjects,
      baseHourlyRate: teacherProfiles.baseHourlyRate,
      ratingAvg: teacherProfiles.ratingAvg,
      totalSessions: teacherProfiles.totalSessions,
      qualification: teacherProfiles.highestDegree,
      institution: teacherProfiles.institution,
      yearsOfExperience: teacherProfiles.yearsOfExperience,
      locationState: teacherProfiles.locationState,
      locationLga: teacherProfiles.locationLga,
      locationArea: teacherProfiles.locationArea,
      isAdminApproved: teacherProfiles.isAdminApproved,
      isVerified: teacherProfiles.isVerified,
      idVerified: teacherProfiles.idVerified,
      videoVerified: teacherProfiles.videoVerified,
      languages: teacherProfiles.languages,
      educationLevels: teacherProfiles.educationLevels,
      sessionFormats: teacherProfiles.sessionFormats,
      deliveryModes: teacherProfiles.deliveryModes,
      availability: teacherProfiles.availability,
      availabilityConfig: teacherProfiles.availabilityConfig,
      minNoticeHours: teacherProfiles.minNoticeHours,
      deletedAt: users.deletedAt,
      status: users.status,
      createdAt: users.createdAt,
      updatedAt: teacherProfiles.updatedAt,
    })
      .from(users)
      .innerJoin(teacherProfiles, eq(users.id, teacherProfiles.userId))
      .where(eq(users.id, id))
      .limit(1);

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    const [docs, certs, eds] = await Promise.all([
      db.query.teacherDocuments.findMany({ where: eq(teacherDocuments.teacherId, id) }),
      db.query.teacherCertifications.findMany({ where: eq(teacherCertifications.userId, id) }),
      db.query.teacherEducations.findMany({ where: eq(teacherEducations.userId, id) }),
    ]);

    const profileCompletion = calcProfileCompletion(teacher, {
      hasCertifications: certs.length > 0,
      hasEducation: eds.length > 0,
    });

    res.json({
      ...teacher,
      documents: docs,
      certifications: certs,
      education: eds,
      profileCompletion,
    });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, teacherId: req.params.id }, 'admin.teacher_detail_failed');
    res.status(500).json({ error: 'Could not fetch teacher detail' });
  }
};

export const updateTeacherStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { isAdminApproved, isVerified, idVerified } = req.body;

    const existing = await db.query.teacherProfiles.findFirst({
      where: eq(teacherProfiles.userId, id),
    });
    if (!existing) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    const updateData: any = { updatedAt: new Date() };
    if (isAdminApproved !== undefined) updateData.isAdminApproved = isAdminApproved;
    if (isVerified !== undefined) updateData.isVerified = isVerified;
    if (idVerified !== undefined) updateData.idVerified = idVerified;

    const [updated] = await db.update(teacherProfiles)
      .set(updateData)
      .where(eq(teacherProfiles.userId, id))
      .returning();

    res.json({ message: 'Teacher status updated', teacher: updated });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, teacherId: req.params.id }, 'admin.teacher_status_update_failed');
    res.status(500).json({ error: 'Could not update teacher status' });
  }
};

export const listTeacherBookings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.select({
      id: bookings.id,
      parentName: sql<string>`coalesce((SELECT "users"."first_name" || ' ' || "users"."last_name" FROM "users" WHERE "users"."id" = "bookings"."parent_id"), 'Unknown')`,
      teacherName: sql<string>`coalesce((SELECT "users"."first_name" || ' ' || "users"."last_name" FROM "users" WHERE "users"."id" = "bookings"."teacher_id"), 'Unknown')`,
      parentId: bookings.parentId,
      teacherId: bookings.teacherId,
      subject: bookings.subject,
      status: bookings.status,
      totalAmount: bookings.totalAmount,
      scheduledDate: bookings.scheduledDate,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      durationHours: bookings.durationHours,
      note: bookings.note,
      bookingFor: bookings.bookingFor,
      createdAt: bookings.createdAt,
    })
      .from(bookings)
      .where(eq(bookings.teacherId, id))
      .orderBy(desc(bookings.createdAt));

    res.json(result);
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, teacherId: req.params.id }, 'admin.teacher_bookings_failed');
    res.status(500).json({ error: 'Could not fetch teacher bookings' });
  }
};

export const listAdminParents = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await db.select({
      id: users.id,
      fullName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
      email: users.email,
      phone: users.phone,
      isVerified: users.isVerified,
      status: users.status,
      createdAt: users.createdAt,
      childrenCount: sql<number>`(SELECT count(*)::int FROM "children" WHERE "children"."parent_id" = "users"."id")`,
      escrowHeld: sql<number>`(SELECT coalesce(sum("bookings"."total_amount"::numeric), 0)::int FROM "bookings" WHERE "bookings"."parent_id" = "users"."id" AND "bookings"."status" = 'paid_escrow')`,
    })
      .from(users)
      .where(and(eq(users.role, 'parent'), isNull(users.deletedAt)))
      .orderBy(desc(users.createdAt));

    res.json(result);
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id }, 'admin.parents_list_failed');
    res.status(500).json({ error: 'Could not fetch parents' });
  }
};

export const getAdminParentDetail = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const [parent] = await db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      fullName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
      email: users.email,
      phone: users.phone,
      photoUrl: users.photoUrl,
      isVerified: users.isVerified,
      status: users.status,
      createdAt: users.createdAt,
    })
      .from(users)
      .where(and(eq(users.id, id), eq(users.role, 'parent'), isNull(users.deletedAt)))
      .limit(1);

    if (!parent) {
      return res.status(404).json({ error: 'Parent not found' });
    }

    const kids = await db.select({
      id: children.id,
      firstName: children.firstName,
      lastName: children.lastName,
      dateOfBirth: children.dateOfBirth,
      grade: children.grade,
      school: children.school,
      notes: children.notes,
      createdAt: children.createdAt,
    })
      .from(children)
      .where(eq(children.parentId, id))
      .orderBy(desc(children.createdAt));

    const escrowHeld = await db.select({
      total: sql<number>`coalesce(sum(${bookings.totalAmount}::numeric), 0)`.mapWith(Number),
    })
      .from(bookings)
      .where(and(eq(bookings.parentId, id), eq(bookings.status, 'paid_escrow')));

    res.json({ ...parent, children: kids, escrowHeld: escrowHeld[0]?.total ?? 0 });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, parentId: req.params.id }, 'admin.parent_detail_failed');
    res.status(500).json({ error: 'Could not fetch parent detail' });
  }
};

export const listParentBookings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.select({
      id: bookings.id,
      teacherName: sql<string>`coalesce((SELECT "users"."first_name" || ' ' || "users"."last_name" FROM "users" WHERE "users"."id" = "bookings"."teacher_id"), 'Unknown')`,
      teacherId: bookings.teacherId,
      childId: bookings.childId,
      subject: bookings.subject,
      status: bookings.status,
      totalAmount: bookings.totalAmount,
      scheduledDate: bookings.scheduledDate,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      durationHours: bookings.durationHours,
      note: bookings.note,
      bookingFor: bookings.bookingFor,
      paidAt: bookings.paidAt,
      createdAt: bookings.createdAt,
    })
      .from(bookings)
      .where(eq(bookings.parentId, id))
      .orderBy(desc(bookings.createdAt));

    res.json(result);
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, parentId: req.params.id }, 'admin.parent_bookings_failed');
    res.status(500).json({ error: 'Could not fetch parent bookings' });
  }
};

export const getBookingDetail = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, id) });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const [parent, teacher, child, events, snapshots, paymentTransactions, lesson, escrowSplits] = await Promise.all([
      booking.parentId ? db.query.users.findFirst({ where: eq(users.id, booking.parentId) }) : null,
      booking.teacherId ? db.query.users.findFirst({ where: eq(users.id, booking.teacherId) }) : null,
      booking.childId ? db.query.children.findFirst({ where: eq(children.id, booking.childId) }) : null,
      db.select({
        id: sessionEvents.id,
        participantIdentity: sessionEvents.participantIdentity,
        participantName: sessionEvents.participantName,
        participantRole: sessionEvents.participantRole,
        event: sessionEvents.event,
        timestamp: sessionEvents.timestamp,
      })
        .from(sessionEvents)
        .where(eq(sessionEvents.bookingId, id))
        .orderBy(asc(sessionEvents.timestamp)),
      db.select({
        id: whiteboardSnapshots.id,
        title: whiteboardSnapshots.title,
        scene: whiteboardSnapshots.scene,
        imageUrl: whiteboardSnapshots.imageUrl,
        authorName: whiteboardSnapshots.authorName,
        authorRole: whiteboardSnapshots.authorRole,
        createdAt: whiteboardSnapshots.createdAt,
      })
        .from(whiteboardSnapshots)
        .where(eq(whiteboardSnapshots.bookingId, id))
        .orderBy(desc(whiteboardSnapshots.createdAt)),
      db.select({
        id: transactions.id,
        paystackReference: transactions.paystackReference,
        amount: transactions.amount,
        type: transactions.type,
        metadata: transactions.metadata,
        createdAt: transactions.createdAt,
      })
        .from(transactions)
        .where(eq(transactions.bookingId, id))
        .orderBy(desc(transactions.createdAt)),
      db.select({
        id: lessons.id,
        subject: lessons.subject,
        scheduledTime: lessons.scheduledTime,
        status: lessons.status,
        confirmedAt: lessons.confirmedAt,
        createdAt: lessons.createdAt,
      })
        .from(lessons)
        .where(eq(lessons.bookingId, id))
        .orderBy(asc(lessons.createdAt))
        .limit(1),
      Number(booking.totalAmount) > 0 ? calculateCourseSplits(Number(booking.totalAmount)) : null,
    ]);

    res.json({
      ...booking,
      parent: parent ? { id: parent.id, fullName: `${parent.firstName} ${parent.lastName}`, email: parent.email, phone: parent.phone } : null,
      teacher: teacher ? { id: teacher.id, fullName: `${teacher.firstName} ${teacher.lastName}`, email: teacher.email, phone: teacher.phone } : null,
      child: child ? { id: child.id, fullName: `${child.firstName} ${child.lastName}`, grade: child.grade, school: child.school } : null,
      events,
      snapshots,
      transactions: paymentTransactions,
      lesson: lesson ?? null,
      escrowBreakdown: escrowSplits ? {
        tutorAmount: escrowSplits.tutorAmount,
        platformFee: escrowSplits.platformFee,
        welfareAmount: escrowSplits.welfareAmount,
        config: escrowSplits.config,
      } : null,
    });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, bookingId: req.params.id }, 'admin.booking_detail_failed');
    res.status(500).json({ error: 'Could not fetch booking detail' });
  }
};

export const deleteUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deletedAt = new Date();

    await db.update(users)
      .set({ deletedAt, updatedAt: deletedAt, status: 'disabled' })
      .where(eq(users.id, id));

    res.json({ message: 'User soft-deleted', userId: id, deletedAt });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, userId: req.params.id }, 'admin.user_delete_failed');
    res.status(500).json({ error: 'Could not delete user' });
  }
};

export const emailTeacher = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { subject, message } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ error: 'subject and message are required' });
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!user) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    const escapeHtml = (str: string) =>
      str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111827;">
        <div style="background: #001A72; border-radius: 12px 12px 0 0; padding: 20px 24px;">
          <h2 style="color: #ffffff; margin: 0; font-size: 18px;">EduWins</h2>
        </div>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
          <p style="margin: 0 0 16px; font-size: 14px;">Hello ${user.firstName},</p>
          <p style="margin: 0 0 16px; white-space: pre-wrap; font-size: 14px; color: #374151;">${escapeHtml(message)}</p>
          <p style="margin: 24px 0 0; font-size: 12px; color: #6b7280;">— The EduWins Admin Team</p>
        </div>
      </div>
    `;

    await emailService.sendEmail({
      to: user.email,
      subject,
      html,
    });

    res.json({ message: 'Email sent to teacher', to: user.email });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.admin?.id, teacherId: req.params.id }, 'admin.teacher_email_failed');
    res.status(500).json({ error: 'Could not send email to teacher' });
  }
};
