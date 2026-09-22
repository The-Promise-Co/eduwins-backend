import { Request, Response } from 'express';
import { db } from '../database/db';
import {
  transactions,
  wallets,
  walletTransactions,
} from '../database/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { creditWallet, debitWallet, ensurePlatformWallet, ensureUserWallets, getUserWallets } from '../services/walletService';
import logger from '../utils/logger';

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
      await ensureUserWallets(teacherId, 'teacher');
      await ensurePlatformWallet();

      await creditWallet({
        ownerId: teacherId,
        walletType: 'main',
        amount: teacherEarnings,
        type: 'lesson_earning',
        referenceType: 'lesson',
        referenceId: lessonId,
        description: 'Lesson earning credited',
        metadata: { parentId, grossAmount: numAmount, status },
      });

      await creditWallet({
        ownerId: teacherId,
        walletType: 'welfare',
        amount: welfareFund,
        type: 'welfare_contribution',
        referenceType: 'lesson',
        referenceId: lessonId,
        description: 'Welfare contribution credited',
        metadata: { parentId, grossAmount: numAmount, status },
      });

      await creditWallet({
        ownerType: 'platform',
        ownerId: null,
        walletType: 'fees',
        amount: platformFee,
        type: 'platform_fee',
        referenceType: 'lesson',
        referenceId: lessonId,
        description: 'Platform fee credited',
        metadata: { teacherId, parentId, grossAmount: numAmount, status },
      });

      // The welfare wallet credit above IS the contribution record — the
      // legacy welfare_funds ledger is no longer written.
    }

    return res.status(201).json({
      message: 'Payment processed successfully',
      transaction: newTransaction,
      splits: { teacherEarnings, platformFee, welfareFund },
    });
  } catch (err: any) {
    (req.log || logger).error({ err, lessonId, teacherId, parentId, amount }, 'payment_split.process_failed');
    return res.status(500).json({ error: 'Payment processing failed' });
  }
};

export const getWelfareFund = async (req: Request, res: Response) => {
  const { teacherId } = req.params;

  try {
    await ensureUserWallets(teacherId, 'teacher');
    const walletRows = await getUserWallets(teacherId);
    const welfareWallet = walletRows.find((wallet) => wallet.walletType === 'welfare');
    const balance = parseFloat(welfareWallet?.balance?.toString() || '0');

    // Contribution history comes from the welfare wallet's own ledger.
    // Shape matches the welfare page contract ({date, lesson, total}).
    const history = await db.select()
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, welfareWallet?.id || ''))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(100);

    res.status(200).json({
      teacherId,
      total_accumulated: balance,
      available_balance: balance,
      locked_balance: 0,
      contributions: history.map((t) => ({
        date: t.createdAt,
        lesson: (t.description as string) || (t.type as string),
        total: parseFloat(t.amount?.toString() || '0') * (t.direction === 'debit' ? -1 : 1),
      })),
    });
  } catch (err: any) {
    (req.log || logger).error({ err, teacherId }, 'payment_split.welfare_get_failed');
    res.status(500).json({ error: 'Failed to fetch welfare fund' });
  }
};

export const getCentralWelfareAnalytics = async (req: Request, res: Response) => {
  try {
    const results = await db.select({
      totalAccumulated: sql<number>`coalesce(sum(${wallets.balance}), 0)`,
    })
      .from(wallets)
      .where(and(eq(wallets.walletType, 'welfare'), eq(wallets.ownerType, 'user')));

    res.json({
      totalAccumulated: parseFloat(results[0]?.totalAccumulated?.toString() || '0'),
      totalAvailable: parseFloat(results[0]?.totalAccumulated?.toString() || '0'),
      totalLocked: 0,
    });
  } catch (err: any) {
    (req.log || logger).error({ err }, 'payment_split.welfare_analytics_failed');
    res.status(500).json({ error: 'Could not calculate welfare analytics' });
  }
};

export const withdrawFromWelfareFund = async (req: Request, res: Response) => {
  const { teacherId } = req.params;
  const { amount } = req.body;

  try {
    const requesterId = (req as unknown as { user?: { id: string } }).user?.id;
    if (!requesterId || requesterId !== teacherId) {
      return res.status(403).json({ error: 'You can only withdraw from your own welfare fund' });
    }
    if (!amount || parseFloat(amount.toString()) <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    const numAmount = parseFloat(amount.toString());

    await ensureUserWallets(teacherId, 'teacher');
    const walletRows = await getUserWallets(teacherId);
    const welfareWallet = walletRows.find((wallet) => wallet.walletType === 'welfare');
    const availableWelfare = parseFloat(welfareWallet?.balance?.toString() || '0');

    if (availableWelfare < numAmount) {
      return res.status(400).json({
        error: 'Insufficient welfare balance',
        available: availableWelfare,
        requested: numAmount,
      });
    }

    const withdrawalRef = `welfare-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await debitWallet({
      ownerId: teacherId,
      walletType: 'welfare',
      amount: numAmount,
      type: 'welfare_withdrawal',
      referenceType: 'withdrawal',
      referenceId: withdrawalRef,
      description: 'Welfare withdrawal debited',
      metadata: { status: 'completed' },
    });

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
    (req.log || logger).error({ err, teacherId, amount }, 'payment_split.welfare_withdraw_failed');
    res.status(500).json({ error: 'Withdrawal failed' });
  }
};
