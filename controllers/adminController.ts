import { Request, Response } from 'express';
import { db } from '../database/db';
import {
  users,
  teacherProfiles,
  parentProfiles,
  teacherDocuments,
  platformConfigs,
  welfareFunds,
  bookings,
} from '../database/schema';
import { eq, sql, count, and, desc } from 'drizzle-orm';
import logger from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  }
}

const VALID_CONFIG_TARGETS = ['tutor', 'welfare', 'platform_fee'];
const VALID_CONFIG_VALUE_TYPES = ['flat_fee', 'percentage'];

export const listPlatformConfigs = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const configs = await db.select().from(platformConfigs);
    res.json(configs);
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.user.id }, 'admin.platform_configs_list_failed');
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
    (req.log || logger).error({ err, adminId: req.user.id, key, target }, 'admin.platform_config_create_failed');
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
    (req.log || logger).error({ err, adminId: req.user.id, configId: id }, 'admin.platform_config_update_failed');
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
    (req.log || logger).error({ err, adminId: req.user.id, configId: id }, 'admin.platform_config_disable_failed');
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
      isApproved: teacherProfiles.isApproved,
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
        eq(teacherProfiles.isApproved, false),
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
    (req.log || logger).error({ err, adminId: req.user.id }, 'admin.vetting_queue_failed');
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
        isApproved: action === 'approve',
        isVerified: action === 'approve',
        updatedAt: new Date(),
      })
      .where(eq(teacherProfiles.userId, teacherId));

    res.json({ message: `Teacher ${action}d successfully`, teacherId, action });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.user.id, teacherId, action }, 'admin.vetting_process_failed');
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
    (req.log || logger).error({ err, adminId: req.user.id, documentId }, 'admin.document_verify_failed');
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
    (req.log || logger).error({ err, adminId: req.user.id, documentId }, 'admin.document_reject_failed');
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
    const totalAccumulatedSum = await db.select({
      total: sql<number>`sum(${welfareFunds.amount})`
    }).from(welfareFunds);

    const teacherCountWithFunds = await db.select({
      count: sql<number>`count(distinct ${welfareFunds.teacherId})`
    }).from(welfareFunds);

    res.json({
      totalAccumulated: totalAccumulatedSum[0].total || 0,
      teachersWithFunds: teacherCountWithFunds[0].count,
      // More analytics could be added here
    });
  } catch (err: any) {
    (req.log || logger).error({ err, adminId: req.user.id }, 'admin.welfare_analytics_failed');
    res.status(500).json({ error: 'Could not fetch welfare analytics' });
  }
};
