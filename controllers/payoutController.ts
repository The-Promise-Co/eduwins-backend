import { Request, Response } from 'express';
import { db } from '../database/db';
import {
  payoutAccounts,
  payoutAccountChangeLogs,
  payoutRequests,
  users,
} from '../database/schema';
import { eq, and, or, sql, desc } from 'drizzle-orm';
import logger from '../utils/logger';
import {
  ensureUserWallets,
  getUserWallets,
  debitWallet,
  creditWallet,
} from '../services/walletService';
import {
  resolveAccount,
  getBankName,
  listBanks,
} from '../services/paystackTransferService';
import {
  emailAdminsNewPayoutRequest,
  emailAdminsAccountChanged,
  emailTutorAccountChanged,
} from '../services/payoutEmailService';
import { createNotification } from './notificationController';

const PAYOUT_CONFIG = {
  MIN_AMOUNT: 5000,
  MAX_AMOUNT_PER_REQUEST: 500000,
  ACCOUNT_CHANGE_LOCK_DAYS: 30,
};

interface AuthenticatedRequest extends Request {
  user: { id: string; role: string };
}

const maskAccount = (n?: string | null) => {
  if (!n) return '';
  return `••••${n.slice(-4)}`;
};

const reservedSum = async (teacherId: string) => {
  const rows = await db
    .select({ total: sql<number>`sum(${payoutRequests.amount})` })
    .from(payoutRequests)
    .where(
      and(
        eq(payoutRequests.teacherId, teacherId),
        or(eq(payoutRequests.status, 'pending'), eq(payoutRequests.status, 'processing')),
      ),
    );
  return parseFloat(rows[0]?.total?.toString() || '0');
};

/**
 * GET /payouts/account
 */
export const getPayoutAccount = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const account = await db.query.payoutAccounts.findFirst({
      where: eq(payoutAccounts.teacherId, req.user.id),
    });
    if (!account) {
      return res.json({ account: null });
    }
    res.json({ account });
  } catch (err: any) {
    logger.error({ err, teacherId: req.user.id }, 'payout.get_account_failed');
    res.status(500).json({ error: 'Could not fetch payout account' });
  }
};

/**
 * POST /payouts/validate-account  { bankCode, accountNumber }
 */
export const validateAccount = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { bankCode, accountNumber } = req.body;
    if (!bankCode || !accountNumber) {
      return res.status(400).json({ error: 'bankCode and accountNumber are required' });
    }
    const resolved = await resolveAccount(bankCode, accountNumber);
    res.json({ accountName: resolved.accountName });
  } catch (err: any) {
    logger.error({ err, teacherId: req.user.id }, 'payout.validate_account_failed');
    res.status(400).json({ error: err.message || 'Could not validate account' });
  }
};

/**
 * PUT /payouts/account  { bankCode, bankName, accountNumber, accountName }
 */
export const savePayoutAccount = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const teacherId = req.user.id;
    const { bankCode, accountNumber, accountName } = req.body;

    if (!bankCode || !accountNumber || !accountName) {
      return res.status(400).json({ error: 'bankCode, accountNumber and accountName are required' });
    }

    // Always resolve against Paystack so the stored name is authoritative (R9).
    const resolved = await resolveAccount(bankCode, accountNumber);
    const bankName = await getBankName(bankCode);

    const existing = await db.query.payoutAccounts.findFirst({
      where: eq(payoutAccounts.teacherId, teacherId),
    });

    if (existing) {
      const lastChanged = new Date(existing.lastChangedAt).getTime();
      const lockMs = PAYOUT_CONFIG.ACCOUNT_CHANGE_LOCK_DAYS * 24 * 60 * 60 * 1000;
      if (lastChanged + lockMs > Date.now()) {
        const nextDate = new Date(lastChanged + lockMs);
        return res.status(403).json({
          error: `Payout account can only be changed once every ${PAYOUT_CONFIG.ACCOUNT_CHANGE_LOCK_DAYS} days. Next change: ${nextDate.toLocaleDateString()}`,
        });
      }
    }

    const now = new Date();

    await db.transaction(async (tx) => {
      if (existing) {
        await tx
          .update(payoutAccounts)
          .set({
            bankCode,
            bankName: bankName || existing.bankName,
            accountNumber,
            accountName: resolved.accountName,
            recipientCode: null,
            lastChangedAt: now,
            updatedAt: now,
          })
          .where(eq(payoutAccounts.teacherId, teacherId));
      } else {
        await tx.insert(payoutAccounts).values({
          teacherId,
          bankCode,
          bankName,
          accountNumber,
          accountName: resolved.accountName,
          recipientCode: null,
          lastChangedAt: now,
        });
      }

      await tx.insert(payoutAccountChangeLogs).values({
        id: Math.random().toString(36).substring(2, 15),
        teacherId,
        oldBankCode: existing?.bankCode || null,
        oldBankName: existing?.bankName || null,
        oldAccountNumber: existing?.accountNumber || null,
        oldAccountName: existing?.accountName || null,
        newBankCode: bankCode,
        newBankName: bankName,
        newAccountNumber: accountNumber,
        newAccountName: resolved.accountName,
        changedAt: now,
        changedBy: 'tutor',
      });
    });

    const [tutor] = await db
      .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(eq(users.id, teacherId))
      .limit(1);
    const teacherName = tutor ? `${tutor.firstName} ${tutor.lastName}` : 'Tutor';

    await createNotification({
      userId: teacherId,
      type: 'payout_account_updated',
      title: 'Payout account updated',
      message: 'Your payout account details have been updated.',
    });

    const accountLabel = `${resolved.accountName} · ${bankName} · ${maskAccount(accountNumber)}`;
    await emailTutorAccountChanged({ email: tutor?.email || '', account: accountLabel });
    await emailAdminsAccountChanged({
      teacherName,
      teacherEmail: tutor?.email || '',
      oldAccount: existing ? `${existing.accountName} · ${maskAccount(existing.accountNumber)}` : '(none)',
      newAccount: accountLabel,
    });

    res.json({
      account: {
        teacherId,
        bankCode,
        bankName,
        accountNumber: maskAccount(accountNumber),
        accountName: resolved.accountName,
        lastChangedAt: now,
      },
    });
  } catch (err: any) {
    logger.error({ err, teacherId: req.user.id }, 'payout.save_account_failed');
    res.status(500).json({ error: err.message || 'Could not save payout account' });
  }
};

/**
 * GET /payouts/account/changes
 */
export const getPayoutAccountChanges = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(payoutAccountChangeLogs)
      .where(eq(payoutAccountChangeLogs.teacherId, req.user.id))
      .orderBy(desc(payoutAccountChangeLogs.changedAt));
    res.json({ changes: rows });
  } catch (err: any) {
    logger.error({ err, teacherId: req.user.id }, 'payout.account_changes_failed');
    res.status(500).json({ error: 'Could not fetch account changes' });
  }
};

/**
 * GET /payouts/available-balance
 */
export const getAvailableBalance = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const teacherId = req.user.id;
    await ensureUserWallets(teacherId, 'teacher');
    const wallets = await getUserWallets(teacherId);
    const mainBalance = parseFloat(
      wallets.find((w) => w.walletType === 'main')?.balance?.toString() || '0',
    );
    const reserved = await reservedSum(teacherId);
    const availableBalance = Math.max(0, Math.floor(mainBalance - reserved));

    res.json({
      availableBalance,
      totalEarnings: mainBalance,
      reserved,
      minWithdrawal: PAYOUT_CONFIG.MIN_AMOUNT,
      maxWithdrawal: PAYOUT_CONFIG.MAX_AMOUNT_PER_REQUEST,
    });
  } catch (err: any) {
    logger.error({ err, teacherId: req.user.id }, 'payout.available_balance_failed');
    res.status(500).json({ error: 'Could not fetch available balance' });
  }
};

/**
 * GET /payouts/banks
 */
export const getBanks = async (_req: Request, res: Response) => {
  try {
    const banks = await listBanks();
    res.json({ banks });
  } catch (err: any) {
    logger.error({ err }, 'payout.list_banks_failed');
    res.status(500).json({ error: err.message || 'Could not fetch banks' });
  }
};

/**
 * POST /payouts/request  { amount, narration }
 */
export const requestPayout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const teacherId = req.user.id;
    const { amount, narration } = req.body;

    if (!amount || isNaN(Number(amount))) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const numericAmount = Number(amount);
    if (numericAmount < PAYOUT_CONFIG.MIN_AMOUNT || numericAmount > PAYOUT_CONFIG.MAX_AMOUNT_PER_REQUEST) {
      return res.status(400).json({
        error: `Amount must be between ₦${PAYOUT_CONFIG.MIN_AMOUNT.toLocaleString()} and ₦${PAYOUT_CONFIG.MAX_AMOUNT_PER_REQUEST.toLocaleString()}`,
      });
    }

    const account = await db.query.payoutAccounts.findFirst({
      where: eq(payoutAccounts.teacherId, teacherId),
    });
    if (!account) {
      return res.status(400).json({ error: 'Add your bank account before requesting a payout' });
    }

    await ensureUserWallets(teacherId, 'teacher');
    const wallets = await getUserWallets(teacherId);
    const mainBalance = parseFloat(
      wallets.find((w) => w.walletType === 'main')?.balance?.toString() || '0',
    );
    const reserved = await reservedSum(teacherId);
    const availableBalance = Math.max(0, Math.floor(mainBalance - reserved));

    if (numericAmount > availableBalance) {
      return res.status(400).json({
        error: `Insufficient balance. Available: ₦${availableBalance.toLocaleString()}`,
      });
    }

    const payoutId = Math.random().toString(36).substring(2, 15);

    await db.transaction(async (tx) => {
      await tx.insert(payoutRequests).values({
        id: payoutId,
        teacherId,
        amount: numericAmount.toString(),
        netAmount: numericAmount.toString(),
        processingFee: '0',
        bankCode: account.bankCode,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        recipientCode: account.recipientCode,
        narration: narration || 'Payout',
        status: 'pending',
      });

      await debitWallet({
        tx,
        ownerId: teacherId,
        walletType: 'main',
        amount: numericAmount,
        type: 'payout_request',
        referenceType: 'payout',
        referenceId: payoutId,
        description: 'Payout request reserved',
        metadata: { payoutId },
      });
    });

    const [tutor] = await db
      .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(eq(users.id, teacherId))
      .limit(1);
    const teacherName = tutor ? `${tutor.firstName} ${tutor.lastName}` : 'Tutor';

    await createNotification({
      userId: teacherId,
      type: 'payout_requested',
      title: 'Payout request submitted',
      message: `Your payout request of ₦${numericAmount.toLocaleString()} has been submitted.`,
    });

    await emailAdminsNewPayoutRequest({
      teacherName,
      amount: numericAmount,
      payoutId,
    });

    res.status(201).json({
      success: true,
      payoutId,
      message: 'Payout request submitted',
      details: { amount: numericAmount, status: 'pending' },
    });
  } catch (err: any) {
    logger.error({ err, teacherId: req.user.id }, 'payout.request_failed');
    res.status(500).json({ error: 'Could not submit payout request' });
  }
};

/**
 * GET /payouts/history
 */
export const getPayoutHistory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const teacherId = req.user.id;
    const list = await db
      .select()
      .from(payoutRequests)
      .where(eq(payoutRequests.teacherId, teacherId))
      .orderBy(desc(payoutRequests.createdAt))
      .limit(100);
    res.json({ payouts: list });
  } catch (err: any) {
    logger.error({ err, teacherId: req.user.id }, 'payout.history_failed');
    res.status(500).json({ error: 'Could not fetch payout history' });
  }
};

/**
 * POST /payouts/:id/cancel
 */
export const cancelPayout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const teacherId = req.user.id;
    const { id } = req.params;

    const payout = await db.query.payoutRequests.findFirst({
      where: and(eq(payoutRequests.id, id), eq(payoutRequests.teacherId, teacherId)),
    });
    if (!payout) {
      return res.status(404).json({ error: 'Payout request not found' });
    }
    if (payout.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending requests can be cancelled' });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(payoutRequests)
        .set({ status: 'declined', declineReason: 'Cancelled by tutor', updatedAt: new Date() })
        .where(eq(payoutRequests.id, id));

      await creditWallet({
        tx,
        ownerId: teacherId,
        walletType: 'main',
        amount: parseFloat(payout.amount?.toString() || '0'),
        type: 'payout_refund',
        referenceType: 'payout',
        referenceId: id,
        description: 'Payout cancellation refund',
        metadata: { payoutId: id },
      });
    });

    res.json({ success: true, message: 'Payout request cancelled' });
  } catch (err: any) {
    logger.error({ err, teacherId: req.user.id, payoutId: req.params.id }, 'payout.cancel_failed');
    res.status(500).json({ error: 'Could not cancel payout request' });
  }
};
