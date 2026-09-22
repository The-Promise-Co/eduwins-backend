import { and, asc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from '../database/db';
import { bookings, disputes, transactions } from '../database/schema';
import logger from '../utils/logger';
import { calculateCourseSplits } from '../controllers/paystack/verifyPayment';
import {
  creditWallet,
  ensurePlatformWallet,
  ensureUserWallets,
  getTransactionsByReference,
} from './walletService';
import { createNotification } from '../controllers/notificationController';

const createId = () => Math.random().toString(36).slice(2, 15);

export type SettlementOutcome =
  | { status: 'settled'; splits: { tutorAmount: number; platformFee: number; welfareAmount: number } }
  | { status: 'skipped'; reason: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Release a completed booking's escrow into wallets. Cron-only by design
 * (never called from end-session): the cron honors the 1-hour dispute window
 * and skips bookings with open disputes.
 *
 * Money model: wallets + wallet_transactions only. No earnings-ledger writes,
 * no welfare_funds writes, no Paystack movement (cash stays in the merchant
 * balance until a withdrawal transfer). All legs run in one DB transaction;
 * the shared booking reference makes repeat runs safe no-ops.
 */
export const settleBookingEscrow = async (bookingId: string): Promise<SettlementOutcome> => {
  const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!booking) return { status: 'skipped', reason: 'not-found' };
  if (booking.status !== 'completed') return { status: 'skipped', reason: `status-${booking.status}` };
  if (!booking.teacherId) return { status: 'skipped', reason: 'no-teacher' };

  const total = Number(booking.totalAmount || 0);
  if (!Number.isFinite(total) || total <= 0) return { status: 'skipped', reason: 'no-amount' };

  // Only release escrow that actually arrived (a booking can reach completed
  // without payment via legacy data or manual flips — never mint from thin air).
  const escrowPayment = await db.query.transactions.findFirst({
    where: and(
      eq(transactions.bookingId, bookingId),
      eq(transactions.type, 'booking_escrow_payment'),
    ),
  });
  if (!escrowPayment) return { status: 'skipped', reason: 'no-escrow' };

  // Idempotency fast path: a prior release leaves legs under this reference.
  // (Authoritative check runs inside the transaction under an advisory lock.)
  const existingLegs = await getTransactionsByReference('booking', bookingId);
  if (existingLegs.length > 0) return { status: 'skipped', reason: 'already-settled' };

  // Dispute guard: fail fast if the disputes table is missing (mis-migrated
  // DB must never settle blind); skip while any dispute is open.
  let openDispute;
  try {
    openDispute = await db.query.disputes.findFirst({
      where: and(eq(disputes.bookingId, bookingId), eq(disputes.status, 'open')),
    });
  } catch (err) {
    throw new Error(`disputes table unreachable — run migrations before settling (booking ${bookingId})`);
  }
  if (openDispute) return { status: 'skipped', reason: 'open-dispute' };

  // Config-driven shares on the full booking total (fees were pushed to the
  // customer at payment time, so gross == net == total). Rounded so the three
  // legs sum to the kobo; the tutor takes the rounding remainder.
  const raw = await calculateCourseSplits(total);
  const platformFee = round2(raw.platformFee);
  const welfareAmount = round2(raw.welfareAmount);
  const tutorAmount = round2(total - platformFee - welfareAmount);
  if (tutorAmount <= 0) return { status: 'skipped', reason: 'non-positive-tutor-share' };

  const splits = { tutorAmount, platformFee, welfareAmount };
  const commonMetadata = {
    bookingId,
    teacherId: booking.teacherId,
    parentId: booking.parentId,
    totalAmount: total,
    splits,
    paymentReference: booking.paymentReference,
  };

  // Wallet rows are idempotent to create; run before the transaction.
  await ensureUserWallets(booking.teacherId as string, 'teacher');
  await ensurePlatformWallet();

  // Authoritative idempotency under a per-booking advisory lock: concurrent
  // ticks (multi-instance) serialize here, and the second one sees the legs.
  let settledByRacer = false;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${bookingId}))`);
    const legs = await getTransactionsByReference('booking', bookingId, tx);
    if (legs.length > 0) {
      settledByRacer = true;
      return;
    }

    await creditWallet({
      tx,
      ownerId: booking.teacherId,
      walletType: 'main',
      amount: tutorAmount,
      type: 'booking_earning',
      referenceType: 'booking',
      referenceId: bookingId,
      description: `Booking earning released (booking ${bookingId})`,
      metadata: commonMetadata,
    });

    if (welfareAmount > 0) {
      await creditWallet({
        tx,
        ownerId: booking.teacherId,
        walletType: 'welfare',
        amount: welfareAmount,
        type: 'booking_welfare_contribution',
        referenceType: 'booking',
        referenceId: bookingId,
        description: `Booking welfare contribution (booking ${bookingId})`,
        metadata: commonMetadata,
      });
    }

    if (platformFee > 0) {
      await creditWallet({
        tx,
        ownerType: 'platform',
        ownerId: null,
        walletType: 'fees',
        amount: platformFee,
        type: 'booking_platform_fee',
        referenceType: 'booking',
        referenceId: bookingId,
        description: `Booking platform fee (booking ${bookingId})`,
        metadata: commonMetadata,
      });
    }

    // paystack_reference is UNIQUE and already held by the escrow-payment
    // row; the release links via bookingId + metadata instead (the wallet
    // legs carry referenceType/referenceId for the same purpose).
    await tx.insert(transactions).values({
      id: createId(),
      bookingId,
      teacherId: booking.teacherId,
      paystackReference: null,
      amount: total.toString(),
      type: 'booking_escrow_release',
      metadata: { ...commonMetadata, feeBearer: 'customer' },
    });
  });
  if (settledByRacer) return { status: 'skipped', reason: 'already-settled' };

  await createNotification({
    userId: booking.teacherId,
    type: 'booking_escrow_released',
    title: 'Session earnings released',
    message: `₦${tutorAmount.toLocaleString()} from your completed session is now in your wallet (₦${platformFee.toLocaleString()} platform fee, ₦${welfareAmount.toLocaleString()} welfare).`,
  });

  logger.info({ bookingId, ...splits }, 'booking.settlement_succeeded');

  return { status: 'settled', splits };
};

/** Dispute window: settlements run no earlier than 1h after session end. */
export const SETTLEMENT_DISPUTE_WINDOW_MINUTES = 60;

/**
 * Cron phase 2 — settle completed bookings past the dispute window.
 * Each booking is isolated (one failure never blocks the batch). Bookings
 * with open disputes or prior releases are skipped inside settleBookingEscrow.
 */
export const settleDueBookings = async (limit = 50) => {
  const cutoff = new Date(Date.now() - SETTLEMENT_DISPUTE_WINDOW_MINUTES * 60 * 1000);
  const due = await db.select({ id: bookings.id })
    .from(bookings)
    .where(and(
      eq(bookings.status, 'completed'),
      isNotNull(bookings.sessionEndedAt),
      lte(bookings.sessionEndedAt, cutoff),
    ))
    .orderBy(asc(bookings.sessionEndedAt))
    .limit(limit);

  const summary = { candidates: due.length, settled: 0, skipped: 0, failed: 0 };
  for (const { id } of due) {
    try {
      const outcome = await settleBookingEscrow(id);
      if (outcome.status === 'settled') summary.settled += 1;
      else summary.skipped += 1;
    } catch (err) {
      summary.failed += 1;
      logger.error({ err, bookingId: id }, 'booking.settlement_failed');
    }
  }

  if (summary.candidates > 0) {
    logger.info(summary, 'booking.settlement_batch_completed');
  }
  return summary;
};
