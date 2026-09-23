import { Request, Response } from 'express';
import { and, eq, inArray, isNull, isNotNull, lte } from 'drizzle-orm';
import { db } from '../database/db';
import { bookingChildren, bookings, children, teacherProfiles, users } from '../database/schema';
import { calculateCourseSplits } from './paystack/verifyPayment';
import { emailService } from '../utils/emailSender';
import { createNotification } from './notificationController';
import logger from '../utils/logger';
import { getLagosTodayString, parseBookingDayStart } from '../utils/bookingTime';
import { getBookingPaymentWindowHours } from '../services/systemSettingsService';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const BLOCKING_BOOKING_STATUSES = new Set(['accepted', 'paid_escrow', 'completed']);

const createId = () => Math.random().toString(36).slice(2, 15);

const toMinutes = (value: string) => {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
};

const rangesOverlap = (startA: number, endA: number, startB: number, endB: number) => startA < endB && startB < endA;

const getPaymentDueAt = (booking: { status?: string | null; acceptedAt?: Date | string | null }, paymentWindowHours: number) => {
  if (booking.status !== 'accepted' || !booking.acceptedAt) return null;
  const acceptedTime = new Date(booking.acceptedAt).getTime();
  if (!Number.isFinite(acceptedTime)) return null;
  return new Date(acceptedTime + paymentWindowHours * 60 * 60 * 1000);
};

export const createBookingRequest = async (req: AuthenticatedRequest, res: Response) => {
  const parentId = req.user.id;

  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ error: 'Only parents can request bookings' });
    }

    const { teacherId, bookingFor, childIds = [], scheduledDate, startTime, endTime, subject, note } = req.body as {
      teacherId?: string;
      bookingFor?: 'self' | 'children';
      childIds?: string[];
      scheduledDate?: string;
      startTime?: string;
      endTime?: string;
      subject?: string;
      note?: string;
    };

    if (!teacherId || !scheduledDate || !startTime || !endTime) {
      return res.status(400).json({ error: 'Teacher, date, start time and end time are required' });
    }

    if (process.env.DEV_ALLOW_ANY_DATE !== 'true') {
      // Day boundaries are Lagos calendar days — independent of server TZ.
      const today = parseBookingDayStart(getLagosTodayString());
      const requested = parseBookingDayStart(scheduledDate);
      if (!today || !requested) {
        return res.status(400).json({ error: 'Invalid date format' });
      }
      if (requested.getTime() < today.getTime() + 24 * 60 * 60 * 1000) {
        return res.status(400).json({ error: 'Bookings must be made at least 24 hours in advance' });
      }
    }

    if (!['self', 'children'].includes(bookingFor || '')) {
      return res.status(400).json({ error: 'Invalid booking recipient' });
    }

    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      return res.status(400).json({ error: 'Invalid time format' });
    }

    const startMinutes = toMinutes(startTime);
    const endMinutes = toMinutes(endTime);
    if (startMinutes >= endMinutes) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    const durationHours = (endMinutes - startMinutes) / 60;
    if (!Number.isInteger(durationHours)) {
      return res.status(400).json({ error: 'Bookings must use full-hour ranges' });
    }

    const teacher = await db.query.users.findFirst({ where: eq(users.id, teacherId) });
    if (!teacher || teacher.role !== 'teacher') {
      return res.status(404).json({ error: 'Tutor not found' });
    }

    const teacherProfile = await db.query.teacherProfiles.findFirst({ where: eq(teacherProfiles.userId, teacherId) });
    const hourlyRate = Number(teacherProfile?.baseHourlyRate || 0);
    if (hourlyRate <= 0) {
      return res.status(400).json({ error: 'Tutor hourly rate is not available' });
    }

    let ownedChildIds: string[] = [];
    let learnerSummary = 'Parent';
    if (bookingFor === 'children') {
      if (!Array.isArray(childIds) || childIds.length === 0) {
        return res.status(400).json({ error: 'Select at least one child' });
      }

      const childRows = await db.select({ id: children.id, firstName: users.firstName, lastName: users.lastName })
        .from(children)
        .innerJoin(users, eq(children.userId, users.id))
        .where(and(eq(children.parentId, parentId), inArray(children.id, childIds)));
      ownedChildIds = childRows.map((child) => child.id);

      if (ownedChildIds.length !== childIds.length) {
        return res.status(400).json({ error: 'One or more selected children are invalid' });
      }
      learnerSummary = childRows.map((child) => `${child.firstName} ${child.lastName}`).join(', ');
    }

    const existingBookings = await db.query.bookings.findMany({ where: eq(bookings.teacherId, teacherId) });
    const hasConflict = existingBookings.some((booking) => {
      if (!booking.scheduledDate || !booking.startTime || !booking.endTime || !booking.status) return false;
      if (!BLOCKING_BOOKING_STATUSES.has(booking.status)) return false;
      if (String(booking.scheduledDate) !== scheduledDate) return false;
      return rangesOverlap(startMinutes, endMinutes, toMinutes(booking.startTime), toMinutes(booking.endTime));
    });

    if (hasConflict) {
      return res.status(409).json({ error: 'This tutor is no longer available for the selected time' });
    }

    const parent = await db.query.users.findFirst({ where: eq(users.id, parentId) });
    const bookingId = createId();
    const totalAmount = hourlyRate * durationHours;
    const bookingNote = typeof note === 'string' ? note.trim().slice(0, 1000) : '';

    const [booking] = await db.insert(bookings).values({
      id: bookingId,
      parentId,
      teacherId,
      childId: null,
      subject: subject || null,
      status: 'pending',
      bookingFor,
      scheduledDate,
      startTime,
      endTime,
      durationHours: String(durationHours),
      note: bookingNote || null,
      totalAmount: String(totalAmount),
      reservedAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    if (ownedChildIds.length > 0) {
      await db.insert(bookingChildren).values(ownedChildIds.map((childId) => ({
        id: createId(),
        bookingId,
        childId,
      })));
    }

    await createNotification({
      userId: teacherId,
      type: 'booking_request_pending',
      title: 'New booking request',
      message: `${parent?.firstName || 'A parent'} requested ${scheduledDate} from ${startTime} to ${endTime}.`,
    });

    try {
      const frontendUrl = process.env.FRONTEND_URL || 'https://eduwins.com';
      await emailService.sendBookingRequestEmail(teacher.email, {
        parentName: `${parent?.firstName || 'A parent'} ${parent?.lastName || ''}`.trim(),
        sessionDate: scheduledDate,
        sessionTime: `${startTime} - ${endTime}`,
        duration: `${durationHours} hour${durationHours === 1 ? '' : 's'}`,
        learnerSummary,
        note: bookingNote || 'No additional note provided.',
        totalAmount: `₦${totalAmount.toLocaleString()}`,
        ctaUrl: `${frontendUrl}/app/dashboard`,
      });
    } catch (err) {
      logger.warn({ err, bookingId }, 'Booking request email failed');
    }

    res.status(201).json({ booking });
  } catch (err: any) {
    logger.error({ err }, 'Create booking request error');
    res.status(500).json({ error: 'Failed to create booking request' });
  }
};

export const listBookingRequests = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const paymentWindowHours = await getBookingPaymentWindowHours();

    const cutoff = new Date(Date.now() - paymentWindowHours * 60 * 60 * 1000);
    await db.update(bookings)
      .set({ status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'system', updatedAt: new Date() })
      .where(and(
        eq(bookings.status, 'accepted'),
        isNull(bookings.paidAt),
        isNotNull(bookings.acceptedAt),
        lte(bookings.acceptedAt, cutoff)
      ));

    const rows = await db.query.bookings.findMany({
      where: req.user.role === 'teacher' ? eq(bookings.teacherId, req.user.id) : eq(bookings.parentId, req.user.id),
    });

    const parentIds = Array.from(new Set(rows.map((booking) => booking.parentId).filter(Boolean))) as string[];
    const teacherIds = Array.from(new Set(rows.map((booking) => booking.teacherId).filter(Boolean))) as string[];
    const bookingIds = rows.map((booking) => booking.id);

    const [parentRows, teacherRows, linkedChildren] = await Promise.all([
      parentIds.length > 0
        ? db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, phone: users.phone }).from(users).where(inArray(users.id, parentIds))
        : [],
      teacherIds.length > 0
        ? db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, phone: users.phone }).from(users).where(inArray(users.id, teacherIds))
        : [],
      bookingIds.length > 0
        ? db.select({ bookingId: bookingChildren.bookingId, id: children.id, userId: children.userId, grade: children.grade, school: children.school, firstName: users.firstName, lastName: users.lastName })
          .from(bookingChildren)
          .innerJoin(children, eq(bookingChildren.childId, children.id))
          .innerJoin(users, eq(children.userId, users.id))
          .where(inArray(bookingChildren.bookingId, bookingIds))
        : [],
    ]);

    const parentsById = new Map(parentRows.map((parent) => [parent.id, parent] as const));
    const teachersById = new Map(teacherRows.map((teacher) => [teacher.id, teacher] as const));
    const childrenByBookingId = new Map<string, typeof linkedChildren>();

    linkedChildren.forEach((child) => {
      const existing = childrenByBookingId.get(child.bookingId) || [];
      childrenByBookingId.set(child.bookingId, [...existing, child]);
    });

    res.status(200).json({
      bookings: rows.map((booking) => ({
        ...booking,
        paymentWindowHours,
        paymentDueAt: getPaymentDueAt(booking, paymentWindowHours),
        parent: booking.parentId ? parentsById.get(booking.parentId) || null : null,
        teacher: booking.teacherId ? teachersById.get(booking.teacherId) || null : null,
        children: childrenByBookingId.get(booking.id) || [],
      })),
    });
  } catch (err: any) {
    logger.error({ err }, 'List booking requests error');
    res.status(500).json({ error: 'Failed to fetch booking requests' });
  }
};

export const getBookingRequest = async (req: AuthenticatedRequest, res: Response) => {
  const { bookingId } = req.params;

  try {
    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
    if (!booking) return res.status(404).json({ error: 'Booking request not found' });
    if (booking.teacherId !== req.user.id && booking.parentId !== req.user.id) {
      return res.status(403).json({ error: 'You cannot access this booking request' });
    }

    const [parent, teacher, linkedChildren, paymentWindowHours] = await Promise.all([
      booking.parentId ? db.query.users.findFirst({ where: eq(users.id, booking.parentId) }) : null,
      booking.teacherId ? db.query.users.findFirst({ where: eq(users.id, booking.teacherId) }) : null,
      db.select({ id: children.id, userId: children.userId, grade: children.grade, school: children.school, firstName: users.firstName, lastName: users.lastName })
        .from(bookingChildren)
        .innerJoin(children, eq(bookingChildren.childId, children.id))
        .innerJoin(users, eq(children.userId, users.id))
        .where(eq(bookingChildren.bookingId, bookingId)),
      getBookingPaymentWindowHours(),
    ]);

    res.status(200).json({
      booking: {
        ...booking,
        paymentWindowHours,
        paymentDueAt: getPaymentDueAt(booking, paymentWindowHours),
      },
      parent,
      teacher,
      children: linkedChildren,
    });
  } catch (err: any) {
    logger.error({ err }, 'Get booking request error');
    res.status(500).json({ error: 'Failed to fetch booking request' });
  }
};

const updateBookingRequestStatus = async (req: AuthenticatedRequest, res: Response, status: 'accepted' | 'denied') => {
  const { bookingId } = req.params;
  const denialReason = typeof req.body?.denialReason === 'string' ? req.body.denialReason.trim().slice(0, 1000) : '';

  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Only tutors can update booking requests' });
    }

    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
    if (!booking) return res.status(404).json({ error: 'Booking request not found' });
    if (booking.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'You cannot update this booking request' });
    }
    if (booking.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending booking requests can be updated' });
    }

    const now = new Date();
    const paymentWindowHours = status === 'accepted' ? await getBookingPaymentWindowHours() : null;
    const statusUpdate = status === 'accepted'
      ? { status, acceptedAt: now, updatedAt: now }
      : { status, deniedAt: now, denialReason: denialReason || null, updatedAt: now };

    const [updated] = await db.update(bookings)
      .set(statusUpdate)
      .where(eq(bookings.id, bookingId))
      .returning();

    const statusMessage = status === 'accepted'
      ? `Your request for ${booking.scheduledDate || ''} from ${booking.startTime || ''} to ${booking.endTime || ''} was accepted. Complete payment within ${paymentWindowHours} hour${paymentWindowHours === 1 ? '' : 's'} to confirm the session. Payment is held in platform escrow until after the session.`
      : `Your request for ${booking.scheduledDate || ''} from ${booking.startTime || ''} to ${booking.endTime || ''} was denied.${denialReason ? ` Reason: ${denialReason}` : ''}`;

    if (booking.parentId) {
      await createNotification({
        userId: booking.parentId,
        type: `booking_request_${status}`,
        title: `Booking request ${status}`,
        message: statusMessage,
      });
    }

    try {
      const parent = booking.parentId ? await db.query.users.findFirst({ where: eq(users.id, booking.parentId) }) : null;
      const teacher = booking.teacherId ? await db.query.users.findFirst({ where: eq(users.id, booking.teacherId) }) : null;
      const frontendUrl = process.env.FRONTEND_URL || 'https://eduwins.com';
      if (parent?.email) {
        await emailService.sendBookingStatusEmail(parent.email, {
          status,
          teacherName: `${teacher?.firstName || 'Your tutor'} ${teacher?.lastName || ''}`.trim(),
          sessionDate: String(booking.scheduledDate || ''),
          sessionTime: `${booking.startTime || ''} - ${booking.endTime || ''}`,
          statusDetail: status === 'accepted'
            ? `Complete payment within ${paymentWindowHours} hour${paymentWindowHours === 1 ? '' : 's'} to confirm the session. Payment is held in platform escrow until after the session.`
            : (denialReason ? `Reason: ${denialReason}` : 'No reason was provided.'),
          ctaUrl: `${frontendUrl}/app/dashboard`,
        });
      }
    } catch (err) {
      logger.warn({ err, bookingId }, 'Booking status email failed');
    }

    res.status(200).json({ booking: updated });
  } catch (err: any) {
    logger.error({ err }, 'Update booking request status error');
    res.status(500).json({ error: 'Failed to update booking request' });
  }
};

export const acceptBookingRequest = async (req: AuthenticatedRequest, res: Response) => updateBookingRequestStatus(req, res, 'accepted');
export const denyBookingRequest = async (req: AuthenticatedRequest, res: Response) => updateBookingRequestStatus(req, res, 'denied');

export const cancelBookingRequest = async (req: AuthenticatedRequest, res: Response) => {
  const { bookingId } = req.params;
  const cancelReason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 1000) : '';

  try {
    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
    if (!booking) return res.status(404).json({ error: 'Booking request not found' });

    if (booking.parentId !== req.user.id && booking.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'You cannot cancel this booking request' });
    }

    const cancellableStatuses = new Set(['pending', 'accepted']);
    if (!booking.status || !cancellableStatuses.has(booking.status)) {
      return res.status(400).json({ error: 'Only pending or accepted bookings can be cancelled' });
    }

    if (booking.status === 'accepted' && !cancelReason) {
      return res.status(400).json({ error: 'A reason is required to cancel an accepted booking' });
    }

    const now = new Date();
    const cancelledBy = booking.parentId === req.user.id ? 'parent' : 'teacher';

    const [updated] = await db.update(bookings)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy,
        cancelReason: cancelReason || null,
        updatedAt: now,
      })
      .where(eq(bookings.id, bookingId))
      .returning();

    const cancelledByName = cancelledBy === 'parent' ? 'Parent' : 'Tutor';
    const notifyUserId = cancelledBy === 'parent' ? booking.teacherId : booking.parentId;

    if (notifyUserId) {
      await createNotification({
        userId: notifyUserId,
        type: 'booking_cancelled',
        title: 'Booking cancelled',
        message: `${cancelledByName} cancelled the booking for ${booking.scheduledDate || ''} from ${booking.startTime || ''} to ${booking.endTime || ''}.${cancelReason ? ` Reason: ${cancelReason}` : ''}`,
      });
    }

    try {
      const recipient = notifyUserId ? await db.query.users.findFirst({ where: eq(users.id, notifyUserId) }) : null;
      const canceller = await db.query.users.findFirst({ where: eq(users.id, req.user.id) });
      const frontendUrl = process.env.FRONTEND_URL || 'https://eduwins.com';
      if (recipient?.email) {
        await emailService.sendBookingCancelledEmail(recipient.email, {
          cancelledByName: canceller ? `${canceller.firstName || ''} ${canceller.lastName || ''}`.trim() : cancelledByName,
          cancelledByRole: cancelledBy,
          sessionDate: String(booking.scheduledDate || ''),
          sessionTime: `${booking.startTime || ''} - ${booking.endTime || ''}`,
          cancelReason: cancelReason || 'No reason provided.',
          ctaUrl: `${frontendUrl}/app/dashboard`,
        });
      }
    } catch (err) {
      logger.warn({ err, bookingId }, 'Booking cancel email failed');
    }

    res.status(200).json({ booking: updated });
  } catch (err: any) {
    logger.error({ err }, 'Cancel booking request error');
    res.status(500).json({ error: 'Failed to cancel booking request' });
  }
};

// ── Get blocked time slots for a tutor on a specific date ────────
export const getBlockedSlots = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { teacherId, date } = req.query;

    if (!teacherId || !date) {
      return res.status(400).json({ error: 'teacherId and date are required' });
    }

    const rows = await db.query.bookings.findMany({
      where: eq(bookings.teacherId, teacherId as string),
    });

    const blocked = rows
      .filter((b) => {
        if (!b.scheduledDate || !b.startTime || !b.endTime || !b.status) return false;
        if (!BLOCKING_BOOKING_STATUSES.has(b.status)) return false;
        return String(b.scheduledDate) === String(date);
      })
      .map((b) => ({ startTime: b.startTime!, endTime: b.endTime! }));

    res.status(200).json({ blockedSlots: blocked });
  } catch (err: any) {
    logger.error({ err, teacherId: req.query.teacherId }, 'getBlockedSlots error');
    res.status(500).json({ error: 'Failed to fetch blocked slots' });
  }
};

// ── Get escrow breakdown for a paid booking ────────
export const getEscrowBreakdown = async (req: AuthenticatedRequest, res: Response) => {
  const { bookingId } = req.params;

  try {
    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (booking.teacherId !== req.user.id && booking.parentId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const amount = Number(booking.totalAmount || 0);
    if (amount <= 0) {
      return res.status(400).json({ error: 'Invalid booking amount' });
    }

    const splits = await calculateCourseSplits(amount);

    res.status(200).json({
      bookingId: booking.id,
      totalAmount: amount,
      tutorAmount: splits.tutorAmount,
      platformFee: splits.platformFee,
      welfareAmount: splits.welfareAmount,
    });
  } catch (err: any) {
    logger.error({ err, bookingId }, 'getEscrowBreakdown error');
    res.status(500).json({ error: 'Failed to fetch escrow breakdown' });
  }
};
