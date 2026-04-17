import { Request, Response } from 'express';
import { db } from '../database/db';
import { 
  transactions, 
  users, 
  teacherProfiles, 
  welfareFunds, 
  bookings 
} from '../database/schema';
import { eq, sql } from 'drizzle-orm';

/**
 * Payment Split System:
 * - Teacher: 75%
 * - Platform (EduWins): 15%
 * - Welfare Fund: 10%
 */

export const processPaymentWithWelfareFund = async (req: Request, res: Response) => {
  const { lessonId, teacherId, parentId, amount, status } = req.body;

  try {
    if (!lessonId || !teacherId || !parentId || !amount || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const numAmount = parseFloat(amount.toString());
    if (numAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    // Calculate splits
    const teacherEarnings = numAmount * 0.75;
    const platformFee = numAmount * 0.15;
    const welfareFund = numAmount * 0.10;

    const transactionId = Math.random().toString(36).substring(2, 15);
    const newTransaction = {
      id: transactionId,
      bookingId: lessonId, // In some cases lessonId is used as bookingId in mock logic
      teacherId,
      amount: numAmount.toString(),
      type: 'lesson_payment',
      metadata: {
        parentId,
        teacherEarnings,
        platformFee,
        welfareFund,
        status
      },
      createdAt: new Date(),
    };

    await db.insert(transactions).values(newTransaction);

    if (status === 'completed') {
      // Update teacher wallet balance in teacher_profiles
      const profile = await db.query.teacherProfiles.findFirst({
        where: eq(teacherProfiles.userId, teacherId),
      });

      if (profile) {
        const currentBalance = parseFloat(profile.walletBalance?.toString() || '0');
        const currentWelfare = parseFloat(profile.welfareBalance?.toString() || '0');

        await db.update(teacherProfiles)
          .set({
            walletBalance: (currentBalance + teacherEarnings).toString(),
            welfareBalance: (currentWelfare + welfareFund).toString(),
            updatedAt: new Date(),
          })
          .where(eq(teacherProfiles.userId, teacherId));
      }

      // Record welfare fund contribution
      const welfareFundId = Math.random().toString(36).substring(2, 15);
      await db.insert(welfareFunds).values({
        id: welfareFundId,
        teacherId,
        month: new Date().toISOString().slice(0, 7),
        amount: welfareFund.toString(),
        status: 'locked',
        createdAt: new Date(),
      });
    }

    return res.status(201).json({
      message: 'Payment processed successfully',
      transaction: newTransaction,
      splits: { teacherEarnings, platformFee, welfareFund },
    });
  } catch (err: any) {
    console.error('Payment processing error:', err);
    return res.status(500).json({ error: 'Payment processing failed' });
  }
};

export const getWelfareFund = async (req: Request, res: Response) => {
  const { teacherId } = req.params;

  try {
    const profile = await db.query.teacherProfiles.findFirst({
      where: eq(teacherProfiles.userId, teacherId),
    });

    if (!profile) {
      return res.status(404).json({ error: 'Teacher profile not found' });
    }

    const contributions = await db.select()
      .from(welfareFunds)
      .where(eq(welfareFunds.teacherId, teacherId))
      .orderBy(sql`${welfareFunds.createdAt} DESC`);

    res.status(200).json({
      teacherId,
      welfare_balance: profile.welfareBalance,
      contributions,
    });
  } catch (err: any) {
    console.error('Error fetching welfare fund:', err);
    res.status(500).json({ error: 'Failed to fetch welfare fund' });
  }
};

export const unlockWelfareFunds = async (req: Request, res: Response) => {
  try {
    // Logic to move 'locked' funds to 'available' if we had split balances in schema
    // In our schema teacher_profiles has welfareBalance. 
    // We'll mark all locked welfare_funds as 'available'
    await db.update(welfareFunds)
      .set({ status: 'available' })
      .where(eq(welfareFunds.status, 'locked'));

    res.status(200).json({ message: 'Welfare funds unlocked successfully' });
  } catch (err: any) {
    console.error('Error unlocking welfare funds:', err);
    res.status(500).json({ error: 'Failed to unlock welfare funds' });
  }
};

export const getCentralWelfareAnalytics = async (req: Request, res: Response) => {
  try {
    const results = await db.select({
      totalAccumulated: sql<number>`sum(${welfareFunds.amount})`,
      totalAvailable: sql<number>`sum(case when ${welfareFunds.status} = 'available' then ${welfareFunds.amount} else 0 end)`,
      totalLocked: sql<number>`sum(case when ${welfareFunds.status} = 'locked' then ${welfareFunds.amount} else 0 end)`,
    }).from(welfareFunds);

    res.json(results[0]);
  } catch (err: any) {
    console.error('Central welfare analytics error:', err);
    res.status(500).json({ error: 'Could not calculate welfare analytics' });
  }
};

export const withdrawFromWelfareFund = async (req: Request, res: Response) => {
  const { teacherId } = req.params;
  const { amount } = req.body;

  try {
    if (!amount || parseFloat(amount.toString()) <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    const numAmount = parseFloat(amount.toString());

    // Check available balance in teacher_profiles
    const profile = await db.query.teacherProfiles.findFirst({
      where: eq(teacherProfiles.userId, teacherId),
    });

    if (!profile) {
      return res.status(404).json({ error: 'Teacher profile not found' });
    }

    const availableWelfare = parseFloat(profile.welfareBalance?.toString() || '0');

    if (availableWelfare < numAmount) {
      return res.status(400).json({
        error: 'Insufficient welfare balance',
        available: availableWelfare,
        requested: numAmount,
      });
    }

    // Process withdrawal: update profile balance
    await db.update(teacherProfiles)
      .set({
        welfareBalance: (availableWelfare - numAmount).toString(),
        updatedAt: new Date(),
      })
      .where(eq(teacherProfiles.userId, teacherId));

    // Record the withdrawal as a transaction
    const transactionId = Math.random().toString(36).substring(2, 15);
    await db.insert(transactions).values({
      id: transactionId,
      teacherId,
      amount: numAmount.toString(),
      type: 'welfare_withdrawal',
      metadata: { status: 'completed' },
      createdAt: new Date(),
    });

    res.status(201).json({
      message: 'Welfare withdrawal completed successfully',
      amount: numAmount,
      newAvailableBalance: availableWelfare - numAmount,
    });
  } catch (err: any) {
    console.error('Welfare withdrawal error:', err);
    res.status(500).json({ error: 'Withdrawal failed' });
  }
};
