import { Request, Response } from 'express';
import { db } from '../database/db';
import { payoutRequests, payoutAccounts, users } from '../database/schema';
import { eq, sql, desc, or, and } from 'drizzle-orm';
import logger from '../utils/logger';
import { creditWallet } from '../services/walletService';
import {
  resolveAccount,
  createTransferRecipient,
  initiateTransfer,
  finalizeTransfer,
  verifyTransfer,
  getBalance,
} from '../services/paystackTransferService';
import { emailTutorPayoutStatus } from '../services/payoutEmailService';
import { createNotification } from './notificationController';

interface AuthenticatedRequest extends Request {
  admin?: { id: string; role: string; permissions: Record<string, any> };
}

const teacherNameSql = sql<string>`coalesce(
  (SELECT "users"."first_name" || ' ' || "users"."last_name" FROM "users" WHERE "users"."id" = "payout_requests"."teacher_id"),
  'Unknown'
)`;

/**
 * GET /admin/payouts?status=pending,processing|completed,declined,failed
 */
export const listPayouts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const statusParam = typeof req.query.status === 'string' ? req.query.status : null;
    const conditions: any[] = [];

    if (statusParam) {
      const statuses = statusParam.split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        conditions.push(or(...statuses.map((s) => eq(payoutRequests.status, s))));
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: payoutRequests.id,
        teacherId: payoutRequests.teacherId,
        teacherName: teacherNameSql,
        amount: payoutRequests.amount,
        status: payoutRequests.status,
        bankName: payoutRequests.bankName,
        accountNumber: payoutRequests.accountNumber,
        accountName: payoutRequests.accountName,
        narration: payoutRequests.narration,
        approvedBy: payoutRequests.approvedBy,
        approvedAt: payoutRequests.approvedAt,
        declinedBy: payoutRequests.declinedBy,
        declinedAt: payoutRequests.declinedAt,
        createdAt: payoutRequests.createdAt,
      })
      .from(payoutRequests)
      .where(where)
      .orderBy(desc(payoutRequests.createdAt));

    res.json(rows);
  } catch (err: any) {
    logger.error({ err, adminId: req.admin?.id }, 'payout.admin_list_failed');
    res.status(500).json({ error: 'Could not fetch payout requests' });
  }
};

/**
 * GET /admin/payouts/:id
 */
export const getPayoutDetail = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const payout = await db.query.payoutRequests.findFirst({
      where: eq(payoutRequests.id, id),
    });
    if (!payout) {
      return res.status(404).json({ error: 'Payout request not found' });
    }

    const teacher = payout.teacherId
      ? await db.query.users.findFirst({ where: eq(users.id, payout.teacherId) })
      : null;

    let paystackBalance: number | null = null;
    try {
      paystackBalance = await getBalance();
    } catch {
      paystackBalance = null;
    }

    res.json({
      payout: { ...payout },
      teacher: teacher
        ? {
            id: teacher.id,
            fullName: `${teacher.firstName} ${teacher.lastName}`,
            email: teacher.email,
          }
        : null,
      paystackBalance,
    });
  } catch (err: any) {
    logger.error({ err, adminId: req.admin?.id, payoutId: req.params.id }, 'payout.admin_detail_failed');
    res.status(500).json({ error: 'Could not fetch payout request' });
  }
};

/**
 * POST /admin/payouts/:id/approve  { reason }
 * Re-verifies the account, then initiates the transfer (sends OTP).
 */
export const approvePayout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.admin?.id;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'A reason is required to approve a payout' });
    }

    const payout = await db.query.payoutRequests.findFirst({
      where: eq(payoutRequests.id, id),
    });
    if (!payout) {
      return res.status(404).json({ error: 'Payout request not found' });
    }
    if (payout.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending requests can be approved' });
    }

    // Reuse the saved recipient code when available; otherwise register the
    // beneficiary now and persist the code so later payouts skip registration.
    if (!payout.teacherId) {
      return res.status(400).json({ error: 'Payout request is missing its teacher' });
    }
    if (!payout.bankCode || !payout.accountNumber) {
      return res.status(400).json({ error: 'Missing bank details for this payout' });
    }

    const account = await db.query.payoutAccounts.findFirst({
      where: eq(payoutAccounts.teacherId, payout.teacherId),
    });

    let recipientCode: string | null = account?.recipientCode ?? null;
    if (!recipientCode) {
      try {
        const resolved = await resolveAccount(payout.bankCode, payout.accountNumber);
        const recipient = await createTransferRecipient({
          accountName: resolved.accountName,
          accountNumber: payout.accountNumber,
          bankCode: payout.bankCode,
        });
        recipientCode = recipient.recipientCode;
        await db
          .update(payoutAccounts)
          .set({ recipientCode, updatedAt: new Date() })
          .where(eq(payoutAccounts.teacherId, payout.teacherId));
      } catch (err: any) {
        return res.status(400).json({
          error: `Account verification failed: ${err.message}`,
        });
      }
    }

    const transferRecipientCode = recipientCode;

    const netAmount = parseFloat(payout.netAmount?.toString() || payout.amount?.toString() || '0');
    const amountKobo = Math.round(netAmount * 100);

    const reference = `PAYOUT_${id}_${Date.now()}`;

    let transfer;
    try {
      transfer = await initiateTransfer({
        recipientCode: transferRecipientCode,
        amountKobo,
        reason: reason.trim(),
        reference,
      });
    } catch (err: any) {
      // Mark failed and refund.
      await db
        .update(payoutRequests)
        .set({ status: 'failed', failureReason: err.message, updatedAt: new Date() })
        .where(eq(payoutRequests.id, id));
      await refundPayout(payout);
      await notifyTutor(payout, 'failed', err.message);
      return res.status(500).json({ error: err.message || 'Transfer initiation failed' });
    }

    const now = new Date();
    const baseUpdate = {
      approvedBy: adminId || null,
      approvedAt: now,
      approvedReason: reason.trim(),
      paystackReference: transfer.reference,
      transferCode: transfer.transferCode,
      updatedAt: now,
    };

    if (transfer.status === 'success') {
      await db
        .update(payoutRequests)
        .set({ ...baseUpdate, status: 'completed', processedAt: now })
        .where(eq(payoutRequests.id, id));

      await notifyTutor(payout, 'completed');
      return res.json({ status: 'completed', transferCode: transfer.transferCode });
    }

    // 'otp' or 'pending' — awaiting finalization
    await db
      .update(payoutRequests)
      .set({ ...baseUpdate, status: 'processing' })
      .where(eq(payoutRequests.id, id));

    return res.json({
      status: 'processing',
      transferCode: transfer.transferCode,
      message: 'Transfer initiated. OTP sent to the business phone.',
    });
  } catch (err: any) {
    logger.error({ err, adminId: req.admin?.id, payoutId: req.params.id }, 'payout.admin_approve_failed');
    res.status(500).json({ error: err.message || 'Could not approve payout' });
  }
};

/**
 * POST /admin/payouts/:id/finalize  { otp }
 */
export const finalizePayout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ error: 'OTP is required to finalize the transfer' });
    }

    const payout = await db.query.payoutRequests.findFirst({
      where: eq(payoutRequests.id, id),
    });
    if (!payout) {
      return res.status(404).json({ error: 'Payout request not found' });
    }
    if (payout.status !== 'processing' || !payout.transferCode) {
      return res.status(400).json({ error: 'Payout is not awaiting finalization' });
    }

    try {
      await finalizeTransfer(payout.transferCode, otp);
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Finalization failed' });
    }

    await db
      .update(payoutRequests)
      .set({ status: 'completed', processedAt: new Date(), updatedAt: new Date() })
      .where(eq(payoutRequests.id, id));

    await notifyTutor(payout, 'completed');

    res.json({ status: 'completed', message: 'Payout completed' });
  } catch (err: any) {
    logger.error({ err, adminId: req.admin?.id, payoutId: req.params.id }, 'payout.admin_finalize_failed');
    res.status(500).json({ error: 'Could not finalize payout' });
  }
};

/**
 * POST /admin/payouts/:id/decline  { reason }
 */
export const declinePayout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.admin?.id;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'A reason is required to decline a payout' });
    }

    const payout = await db.query.payoutRequests.findFirst({
      where: eq(payoutRequests.id, id),
    });
    if (!payout) {
      return res.status(404).json({ error: 'Payout request not found' });
    }
    if (payout.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending requests can be declined' });
    }

    await db
      .update(payoutRequests)
      .set({
        status: 'declined',
        declinedBy: adminId || null,
        declinedAt: new Date(),
        declineReason: reason.trim(),
        updatedAt: new Date(),
      })
      .where(eq(payoutRequests.id, id));

    await refundPayout(payout);

    await notifyTutor(payout, 'declined', reason.trim());

    res.json({ status: 'declined', message: 'Payout declined and funds refunded' });
  } catch (err: any) {
    logger.error({ err, adminId: req.admin?.id, payoutId: req.params.id }, 'payout.admin_decline_failed');
    res.status(500).json({ error: 'Could not decline payout' });
  }
};

/**
 * GET /admin/payouts/balance
 */
export const getPaystackBalance = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const balance = await getBalance();
    res.json({ balance });
  } catch (err: any) {
    logger.error({ err, adminId: req.admin?.id }, 'payout.admin_balance_failed');
    res.status(500).json({ error: err.message || 'Could not fetch Paystack balance' });
  }
};

/**
 * POST /admin/payouts/:id/cancel
 *
 * Aborts an approval that is mid-way (transfer initiated, awaiting OTP) and
 * returns the request to 'pending' so the admin can approve it again. The
 * un-finalized Paystack transfer is left to auto-abandon (no funds leave), so
 * no refund is issued and the tutor is not notified.
 */
export const cancelPayoutApproval = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const payout = await db.query.payoutRequests.findFirst({
      where: eq(payoutRequests.id, id),
    });
    if (!payout) {
      return res.status(404).json({ error: 'Payout request not found' });
    }
    if (payout.status !== 'processing') {
      return res.status(400).json({ error: 'Only payouts awaiting finalization can be cancelled' });
    }

    // Guard against cancelling a transfer that already (or may still) settle.
    if (payout.transferCode) {
      let verified: { status: string };
      try {
        verified = await verifyTransfer(payout.transferCode);
      } catch (err: any) {
        return res.status(400).json({
          error: `Could not verify transfer status: ${err.message}`,
        });
      }
      if (verified.status === 'success') {
        return res.status(400).json({ error: 'Transfer already completed and cannot be cancelled' });
      }
      if (verified.status === 'pending') {
        return res.status(400).json({
          error: 'Transfer is still being processed by Paystack and cannot be cancelled safely',
        });
      }
    }

    await db
      .update(payoutRequests)
      .set({
        status: 'pending',
        transferCode: null,
        paystackReference: null,
        approvedBy: null,
        approvedAt: null,
        approvedReason: null,
        updatedAt: new Date(),
      })
      .where(eq(payoutRequests.id, id));

    res.json({ status: 'pending', message: 'Approval cancelled. The request is back to pending.' });
  } catch (err: any) {
    logger.error({ err, adminId: req.admin?.id, payoutId: req.params.id }, 'payout.admin_cancel_failed');
    res.status(500).json({ error: err.message || 'Could not cancel payout approval' });
  }
};

/* ─── helpers ─────────────────────────────────────────────────────────── */

async function refundPayout(payout: { teacherId: string | null; amount: string | null; id: string }) {
  if (!payout.teacherId) return;
  const amount = parseFloat(payout.amount?.toString() || '0');
  if (amount <= 0) return;
  try {
    await creditWallet({
      ownerId: payout.teacherId,
      walletType: 'main',
      amount,
      type: 'payout_refund',
      referenceType: 'payout',
      referenceId: payout.id,
      description: 'Payout refund',
      metadata: { payoutId: payout.id },
    });
  } catch (err) {
    logger.error({ err, payoutId: payout.id, teacherId: payout.teacherId }, 'payout.refund_failed');
  }
}

async function notifyTutor(
  payout: { teacherId: string | null; amount: string | null; netAmount: string | null },
  status: string,
  reason?: string,
) {
  if (!payout.teacherId) return;
  const teacher = await db.query.users.findFirst({ where: eq(users.id, payout.teacherId) });
  const amount = payout.netAmount || payout.amount;

  try {
    const title =
      status === 'completed'
        ? 'Payout completed'
        : status === 'declined'
          ? 'Payout declined'
          : 'Payout failed';
    await createNotification({
      userId: payout.teacherId,
      type: `payout_${status}`,
      title,
      message:
        status === 'completed'
          ? `Your payout of ₦${Number(amount || 0).toLocaleString()} has been sent to your bank account.`
          : `Your payout of ₦${Number(amount || 0).toLocaleString()} was ${status}.${reason ? ` Reason: ${reason}` : ''}`,
    });
  } catch (err) {
    logger.error({ err, payoutId: payout.teacherId }, 'payout.notify_in_app_failed');
  }

  await emailTutorPayoutStatus({
    email: teacher?.email || '',
    status,
    amount: amount || 0,
    reason,
  });
}
