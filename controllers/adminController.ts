import { Request, Response } from 'express';
import { db } from '../database/db';
import { 
  users, 
  housingApplications, 
  vaultItems, 
  teacherProfiles, 
  parentProfiles,
  disputes,
  welfareFunds,
  bookings
} from '../database/schema';
import { eq, sql, count, and, desc } from 'drizzle-orm';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  }
}

export const getOverview = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const totalUsersCount = await db.select({ value: count() }).from(users);
    const totalTeachersCount = await db.select({ value: count() }).from(teacherProfiles);
    const totalParentsCount = await db.select({ value: count() }).from(parentProfiles);
    const pendingHousingCount = await db.select({ value: count() })
      .from(housingApplications)
      .where(eq(housingApplications.status, 'pending'));
    const totalVaultCount = await db.select({ value: count() }).from(vaultItems);

    res.json({
      totalUsers: totalUsersCount[0].value,
      totalTeachers: totalTeachersCount[0].value,
      totalParents: totalParentsCount[0].value,
      pendingRentApplications: pendingHousingCount[0].value,
      totalVaultItems: totalVaultCount[0].value,
    });
  } catch (err: any) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: 'Could not fetch admin overview' });
  }
};

export const listRentApplications = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const list = await db.select({
      id: housingApplications.id,
      teacher_name: users.fullName,
      amount: housingApplications.propertyDetails, // propertyDetails is json, might contain price
      status: housingApplications.status,
      application_date: housingApplications.appliedAt,
    })
    .from(housingApplications)
    .leftJoin(users, eq(housingApplications.teacherId, users.id));

    res.json(list);
  } catch (err: any) {
    console.error('Rent applications fetch error:', err);
    res.status(500).json({ error: 'Could not fetch rent applications' });
  }
};

export const processRentApplication = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['approved', 'rejected', 'cancelled', 'active', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    await db.update(housingApplications)
      .set({ status, approvedAt: status === 'approved' ? new Date() : undefined })
      .where(eq(housingApplications.id, id));

    res.json({ id, status, message: 'Application updated successfully' });
  } catch (err: any) {
    console.error('Process rent application error:', err);
    res.status(500).json({ error: 'Could not update rent application' });
  }
};

export const listAmbassadors = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Getting ambassadors (users with ambassador role or marked as such)
    const list = await db.select({
      id: users.id,
      name: users.fullName,
      referrals: sql<number>`count(${users.id})`, // This would need a self-join or referral table
      earnings: users.averageMonthlyEarnings, // Placeholder
    })
    .from(users)
    .where(eq(users.role, 'ambassador'))
    .groupBy(users.id, users.fullName, users.averageMonthlyEarnings);

    res.json(list);
  } catch (err: any) {
    console.error('Ambassadors fetch error:', err);
    res.status(500).json({ error: 'Could not fetch ambassadors' });
  }
};

export const listVettingQueue = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const queue = await db.select({
      id: users.id,
      full_name: users.fullName,
      email: users.email,
      role: users.role,
      base_hourly_rate: teacherProfiles.baseHourlyRate,
      credentials_url: teacherProfiles.credentialsUrl,
      is_approved: users.isVerified,
    })
    .from(users)
    .innerJoin(teacherProfiles, eq(users.id, teacherProfiles.userId))
    .where(eq(users.isVerified, false));

    res.json(queue);
  } catch (err: any) {
    console.error('List vetting queue error:', err);
    res.status(500).json({ error: 'Could not fetch vetting queue' });
  }
};

export const processVetting = async (req: AuthenticatedRequest, res: Response) => {
  const { teacherId } = req.params;
  const { action } = req.body; // 'approve' or 'reject'

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    await db.update(users)
      .set({ isVerified: action === 'approve' })
      .where(eq(users.id, teacherId));

    res.json({ message: `Teacher ${action}d successfully`, teacherId, action });
  } catch (err: any) {
    console.error('Process vetting error:', err);
    res.status(500).json({ error: 'Could not process vetting' });
  }
};

export const payoutEscrow = async (req: AuthenticatedRequest, res: Response) => {
  const { bookingId } = req.params;

  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
    });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    await db.update(bookings)
      .set({ status: 'completed' }) // Or a specific 'paid_out' status if exists
      .where(eq(bookings.id, bookingId));

    res.json({ message: 'Escrow payout executed', bookingId });
  } catch (err: any) {
    console.error('Escrow payout error:', err);
    res.status(500).json({ error: 'Could not execute escrow payout' });
  }
};

export const listDisputes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const list = await db.select().from(disputes).orderBy(desc(disputes.createdAt));
    res.json(list);
  } catch (err: any) {
    console.error('List disputes error:', err);
    res.status(500).json({ error: 'Could not fetch disputes' });
  }
};

export const createDispute = async (req: AuthenticatedRequest, res: Response) => {
  const { bookingId, issue, notes } = req.body;
  if (!bookingId || !issue) return res.status(400).json({ error: 'bookingId and issue are required' });

  try {
    const id = Math.random().toString(36).substring(2, 15);
    const newDispute = {
      id,
      bookingId,
      issue,
      notes,
      status: 'open',
      createdAt: new Date(),
    };
    await db.insert(disputes).values(newDispute);
    res.status(201).json(newDispute);
  } catch (err: any) {
    console.error('Create dispute error:', err);
    res.status(500).json({ error: 'Could not create dispute' });
  }
};

export const updateDispute = async (req: AuthenticatedRequest, res: Response) => {
  const { disputeId } = req.params;
  const { status, resolution } = req.body;

  try {
    await db.update(disputes)
      .set({ status, resolution, updatedAt: new Date() })
      .where(eq(disputes.id, disputeId));

    res.json({ id: disputeId, status, message: 'Dispute updated successfully' });
  } catch (err: any) {
    console.error('Update dispute error:', err);
    res.status(500).json({ error: 'Could not update dispute' });
  }
};

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
    console.error('Welfare analytics error:', err);
    res.status(500).json({ error: 'Could not fetch welfare analytics' });
  }
};
