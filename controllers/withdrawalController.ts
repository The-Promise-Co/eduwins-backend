import { Request, Response } from 'express';
import axios from 'axios';
import { db } from '../database/db';
import {
  withdrawals,
  userEarnings, // Renamed from 'earnings' to avoid collisions if necessary
  teacherProfiles,
  mortgages,
  welfareFunds,
  notifications,
  earnings as earningsTable // Using the schema name
} from '../database/schema';
import { eq, and, or, sql, desc } from 'drizzle-orm';
import { calculateTotalWelfareFund } from '../utils/welfareCalculator';
import dotenv from 'dotenv';

dotenv.config();

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// Withdrawal limits and fees
const WITHDRAWAL_CONFIG = {
  MIN_AMOUNT: 5000,
  MAX_AMOUNT_PER_REQUEST: 500000,
  MAX_AMOUNT_PER_MONTH: 5000000,
  PROCESSING_FEE_PERCENTAGE: 1,
  PROCESSING_TIME_HOURS: 24,
};

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  }
}

/**
 * GET /api/withdrawals/available-balance
 * Calculate available balance for withdrawal
 */
export const getAvailableBalance = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const teacherId = req.user.id;

    // Fetch teacher earnings
    const teacherEarnings = await db.query.earningsTable.findFirst({
      where: eq(earningsTable.teacherId, teacherId),
    });

    // Calculate total welfare fund
    const totalWelfareFund = await calculateTotalWelfareFund(teacherId);

    // Fetch active mortgage payment
    const activeMortgage = await db.query.mortgages.findFirst({
      where: and(eq(mortgages.teacherId, teacherId), eq(mortgages.status, 'active')),
    });
    const activeMortgagePayment = parseFloat(activeMortgage?.monthlyPayment?.toString() || '0');

    // Fetch pending/processing withdrawals
    const pendingWithdrawalSum = await db.select({
      total: sql<number>`sum(${withdrawals.amount})`
    })
      .from(withdrawals)
      .where(and(
        eq(withdrawals.teacherId, teacherId),
        or(eq(withdrawals.status, 'pending'), eq(withdrawals.status, 'processing'))
      ));

    const reservedAmount = pendingWithdrawalSum[0]?.total || 0;

    // Calculate total earnings
    const totalEarnings = parseFloat(teacherEarnings?.total?.toString() || '0');
    const totalAcquired = parseFloat(teacherEarnings?.acquiredFromLessons?.toString() || '0');

    // Calculate accessible balance
    const deductions = totalWelfareFund + activeMortgagePayment;
    const accessibleBalance = Math.max(0, totalAcquired - deductions - reservedAmount);

    res.json({
      success: true,
      totalEarnings,
      totalAcquired,
      deductions: {
        welfareFund: totalWelfareFund,
        mortgagePayment: activeMortgagePayment,
        reserved: reservedAmount,
      },
      availableBalance: Math.floor(accessibleBalance),
      minWithdrawal: WITHDRAWAL_CONFIG.MIN_AMOUNT,
      maxWithdrawal: WITHDRAWAL_CONFIG.MAX_AMOUNT_PER_REQUEST,
      processingFee: `${WITHDRAWAL_CONFIG.PROCESSING_FEE_PERCENTAGE}%`,
      estimatedProcessingTime: `${WITHDRAWAL_CONFIG.PROCESSING_TIME_HOURS} hours`,
    });
  } catch (error) {
    console.error('Get available balance error:', error);
    res.status(500).json({ error: 'Could not fetch available balance' });
  }
};

/**
 * POST /api/withdrawals/initiate
 * Initiate a withdrawal request
 */
export const initiateWithdrawal = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const teacherId = req.user.id;
    const { amount, bankCode, accountNumber, accountName, narration } = req.body;

    if (!amount || !bankCode || !accountNumber || !accountName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (amount < WITHDRAWAL_CONFIG.MIN_AMOUNT || amount > WITHDRAWAL_CONFIG.MAX_AMOUNT_PER_REQUEST) {
      return res.status(400).json({ error: 'Amount outside allowed range' });
    }

    // Get available balance (re-calculating for security)
    const teacherEarnings = await db.query.earningsTable.findFirst({
      where: eq(earningsTable.teacherId, teacherId),
    });
    const totalWelfareFund = await calculateTotalWelfareFund(teacherId);
    const totalAcquired = parseFloat(teacherEarnings?.acquiredFromLessons?.toString() || '0');
    const accessibleBalance = Math.max(0, totalAcquired - totalWelfareFund);

    if (amount > accessibleBalance) {
      return res.status(400).json({
        error: `Insufficient balance. Available: ₦${Math.floor(accessibleBalance)}`,
      });
    }

    // Check monthly limit
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthlyWithdrawalSum = await db.select({
      total: sql<number>`sum(${withdrawals.amount})`
    })
      .from(withdrawals)
      .where(and(
        eq(withdrawals.teacherId, teacherId),
        eq(withdrawals.month, currentMonth),
        sql`${withdrawals.status} != 'failed'`
      ));

    const monthlyTotal = monthlyWithdrawalSum[0]?.total || 0;

    if (monthlyTotal + amount > WITHDRAWAL_CONFIG.MAX_AMOUNT_PER_MONTH) {
      return res.status(400).json({ error: 'Monthly limit exceeded' });
    }

    // Processing fee
    const processingFee = Math.round((amount * WITHDRAWAL_CONFIG.PROCESSING_FEE_PERCENTAGE) / 100);
    const netAmount = amount - processingFee;

    const withdrawalId = Math.random().toString(36).substring(2, 15);
    const withdrawalData = {
      id: withdrawalId,
      teacherId,
      amount: amount.toString(),
      netAmount: netAmount.toString(),
      processingFee: processingFee.toString(),
      bankCode,
      accountNumber: accountNumber.slice(-4), // Security
      accountName,
      narration: narration || 'Withdrawal',
      status: 'pending',
      month: currentMonth,
      createdAt: new Date(),
    };

    await db.insert(withdrawals).values(withdrawalData);

    // Deduct from earnings (reserve funds)
    await db.update(earningsTable)
      .set({
        acquiredFromLessons: (totalAcquired - amount).toString(),
      })
      .where(eq(earningsTable.teacherId, teacherId));

    // Notify user
    await db.insert(notifications).values({
      id: Math.random().toString(36).substring(2, 15),
      userId: teacherId,
      type: 'withdrawal_initiated',
      title: 'Withdrawal Request Initiated',
      message: `Your withdrawal request of ₦${amount.toLocaleString()} has been submitted.`,
      read: false,
    });

    res.status(201).json({
      success: true,
      withdrawalId,
      message: 'Withdrawal initiated successfully',
      details: { amount, netAmount, status: 'pending' },
    });
  } catch (error) {
    console.error('Initiate withdrawal error:', error);
    res.status(500).json({ error: 'Could not initiate withdrawal' });
  }
};

/**
 * Process withdrawal via Paystack (Admin function)
 */
export const processWithdrawal = async (req: Request, res: Response) => {
  try {
    const { withdrawalId, teacherId } = req.body;

    const withdrawal = await db.query.withdrawals.findFirst({
      where: eq(withdrawals.id, withdrawalId),
    });

    if (!withdrawal || withdrawal.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot process withdrawal' });
    }

    await db.update(withdrawals).set({ status: 'processing' }).where(eq(withdrawals.id, withdrawalId));

    try {
      const netAmount = parseFloat(withdrawal.netAmount?.toString() || '0');

      const transferResponse = await axios.post(
        'https://api.paystack.co/transfer',
        {
          source: 'balance',
          amount: netAmount * 100,
          recipient_code: `RCP_${withdrawal.bankCode}_${withdrawal.accountNumber}`,
          reason: withdrawal.narration || 'Withdrawal',
          reference: `WTD_${withdrawalId}_${Date.now()}`,
        },
        {
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` }
        }
      );

      if (transferResponse.data.status) {
        await db.update(withdrawals).set({
          status: 'completed',
          paystackReference: transferResponse.data.data.reference,
          completedAt: new Date(),
        }).where(eq(withdrawals.id, withdrawalId));

        await db.insert(notifications).values({
          id: Math.random().toString(36).substring(2, 15),
          userId: teacherId,
          type: 'withdrawal_completed',
          title: 'Withdrawal Completed',
          message: `Your withdrawal of ₦${netAmount.toLocaleString()} was successful.`,
          read: false,
        });

        res.json({ success: true, reference: transferResponse.data.data.reference });
      }
    } catch (paymentError: any) {
      console.error('Transfer error:', paymentError.message);

      await db.update(withdrawals).set({
        status: 'failed',
        failureReason: paymentError.response?.data?.message || paymentError.message,
      }).where(eq(withdrawals.id, withdrawalId));

      // Refund
      const currentEarnings = await db.query.earningsTable.findFirst({ where: eq(earningsTable.teacherId, teacherId) });
      const refundAmount = parseFloat(withdrawal.amount?.toString() || '0');

      await db.update(earningsTable).set({
        acquiredFromLessons: (parseFloat(currentEarnings?.acquiredFromLessons?.toString() || '0') + refundAmount).toString()
      }).where(eq(earningsTable.teacherId, teacherId));

      res.status(500).json({ error: 'Transfer failed' });
    }
  } catch (error) {
    console.error('Process withdrawal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getWithdrawalHistory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const teacherId = req.user.id;
    const { status, limit = '50', offset = '0' } = req.query;

    const list = await db.select().from(withdrawals)
      .where(eq(withdrawals.teacherId, teacherId))
      .orderBy(desc(withdrawals.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    res.json({ success: true, withdrawals: list });
  } catch (error) {
    res.status(500).json({ error: 'Could not fetch history' });
  }
};

export const cancelWithdrawal = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const teacherId = req.user.id;
    const { withdrawalId } = req.params;

    const withdrawal = await db.query.withdrawals.findFirst({
      where: eq(withdrawals.id, withdrawalId),
    });

    if (!withdrawal || withdrawal.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot cancel' });
    }

    await db.update(withdrawals).set({
      status: 'cancelled',
      cancelledAt: new Date()
    }).where(eq(withdrawals.id, withdrawalId));

    // Refund
    const currentEarnings = await db.query.earningsTable.findFirst({ where: eq(earningsTable.teacherId, teacherId) });
    const refundAmount = parseFloat(withdrawal.amount?.toString() || '0');

    await db.update(earningsTable).set({
      acquiredFromLessons: (parseFloat(currentEarnings?.acquiredFromLessons?.toString() || '0') + refundAmount).toString()
    }).where(eq(earningsTable.teacherId, teacherId));

    res.json({ success: true, message: 'Withdrawal cancelled' });
  } catch (error) {
    res.status(500).json({ error: 'Cancel failed' });
  }
};

export const getBankCodes = async (req: Request, res: Response) => {
  try {
    const banksResponse = await axios.get('https://api.paystack.co/bank', {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    res.json({ success: true, banks: banksResponse.data.data });
  } catch (error) {
    res.status(500).json({ error: 'Could not fetch banks' });
  }
};

export const getWithdrawalDetails = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { withdrawalId } = req.params;
    const teacherId = req.user.id;

    const withdrawal = await db.query.withdrawals.findFirst({
      where: and(eq(withdrawals.id, withdrawalId), eq(withdrawals.teacherId, teacherId)),
    });

    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    res.json({ success: true, withdrawal });
  } catch (error) {
    console.error('Get withdrawal details error:', error);
    res.status(500).json({ error: 'Could not fetch withdrawal details' });
  }
};

