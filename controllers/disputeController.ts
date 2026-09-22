import { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../database/db';
import { bookings, disputes } from '../database/schema';
import logger from '../utils/logger';

const createId = () => Math.random().toString(36).slice(2, 15);

interface AuthenticatedRequest extends Request {
  user: { id: string; role: string };
}

// POST /api/bookings/:bookingId/disputes — raise a dispute (parent or teacher
// on the booking). One open dispute per booking; the settlement cron never
// splits a booking with an open dispute.
export const createDispute = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { issue } = req.body;

    if (!issue || typeof issue !== 'string' || !issue.trim()) {
      return res.status(400).json({ error: 'issue is required' });
    }

    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.parentId !== req.user.id && booking.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Cancelled bookings cannot be disputed' });
    }

    const existingOpen = await db.query.disputes.findFirst({
      where: and(eq(disputes.bookingId, bookingId), eq(disputes.status, 'open')),
    });
    if (existingOpen) {
      return res.status(409).json({ error: 'This booking already has an open dispute', disputeId: existingOpen.id });
    }

    const [row] = await db.insert(disputes).values({
      id: createId(),
      bookingId,
      createdBy: req.user.id,
      issue: issue.trim(),
      status: 'open',
    }).returning();

    res.status(201).json(row);
  } catch (err: any) {
    logger.error({ err }, 'Create dispute error');
    res.status(500).json({ error: 'Could not create dispute' });
  }
};
