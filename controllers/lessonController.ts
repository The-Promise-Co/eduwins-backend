import { Request, Response } from 'express';
import { db } from '../database/db';
import { lessons, bookings, users } from '../database/schema';
import { eq, and, sql, desc, count } from 'drizzle-orm';
import { generateOTP } from '../utils/otpGenerator';
import { sendSMS } from '../utils/smsSender';
import logger from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  }
}

async function checkBookingCompletion(bookingId: string) {
  const result = await db.select({
    total: count(),
    confirmed: sql<number>`count(case when ${lessons.status} = 'confirmed_by_parent' then 1 end)`
  })
  .from(lessons)
  .where(eq(lessons.bookingId, bookingId));

  const { total, confirmed } = result[0];

  if (total > 0 && total === confirmed) {
    await db.update(bookings)
      .set({ status: 'completed' })
      .where(eq(bookings.id, bookingId));
  }
}

export const getParentChildren = async (req: AuthenticatedRequest, res: Response) => {
  const parentId = req.user.id;

  try {
    // Joining users and bookings to find children of this parent
    const children = await db.select({
      id: users.id,
      name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
      email: users.email,
    })
    .from(users)
    .innerJoin(bookings, eq(bookings.childId, users.id))
    .where(eq(bookings.parentId, parentId))
    .groupBy(users.id, users.firstName, users.lastName, users.email);

    res.json({ children });
  } catch (err: any) {
    (req.log || logger).error({ err, parentId }, 'lesson.parent_children_list_failed');
    res.status(500).json({ error: 'Failed to fetch children' });
  }
};

export const getParentPendingConfirmations = async (req: AuthenticatedRequest, res: Response) => {
  const parentId = req.user.id;

  try {
    const list = await db.select({
      lesson_id: lessons.id,
      booking_id: lessons.bookingId,
      subject: lessons.subject,
      scheduled_time: lessons.scheduledTime,
      status: lessons.status,
      teacher_name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
      teacher_phone: users.phone,
    })
    .from(lessons)
    .innerJoin(bookings, eq(lessons.bookingId, bookings.id))
    .innerJoin(users, eq(bookings.teacherId, users.id))
    .where(and(eq(bookings.parentId, parentId), eq(lessons.status, 'completed_by_teacher')))
    .orderBy(desc(lessons.scheduledTime));

    res.json({ lessons: list });
  } catch (err: any) {
    (req.log || logger).error({ err, parentId }, 'lesson.pending_confirmations_list_failed');
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
};

export const parentConfirmLesson = async (req: AuthenticatedRequest, res: Response) => {
  const parentId = req.user.id;
  const { lessonId } = req.params;
  const { otp } = req.body;

  if (!otp) {
    return res.status(400).json({ error: 'OTP is required to confirm lesson' });
  }

  try {
    const lessonWithBooking = await db.select({
      lesson: lessons,
      parent_id: bookings.parentId,
      teacher_id: bookings.teacherId,
      booking_id: bookings.id
    })
    .from(lessons)
    .innerJoin(bookings, eq(lessons.bookingId, bookings.id))
    .where(eq(lessons.id, lessonId));

    if (lessonWithBooking.length === 0) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const { lesson, parent_id, booking_id } = lessonWithBooking[0];
    
    if (parent_id !== parentId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (lesson.status !== 'completed_by_teacher') {
      return res.status(400).json({ error: 'Lesson is not ready for confirmation' });
    }

    if (!lesson.confirmationOtp || lesson.confirmationOtp !== otp || (lesson.otpExpiry && new Date() > lesson.otpExpiry)) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    await db.update(lessons)
      .set({ 
        status: 'confirmed_by_parent', 
        confirmedAt: new Date() 
      })
      .where(eq(lessons.id, lessonId));

    if (booking_id) {
      await checkBookingCompletion(booking_id);
    }

    res.json({ message: 'Lesson confirmed successfully' });
  } catch (err: any) {
    (req.log || logger).error({ err, parentId, lessonId }, 'lesson.parent_confirm_failed');
    res.status(500).json({ error: 'Failed to confirm lesson' });
  }
}; 

export const teacherCompleteLesson = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;
  const { lessonId } = req.params;

  try {
    const lessonWithParent = await db.select({
      lesson: lessons,
      parent_phone: users.phone,
    })
    .from(lessons)
    .innerJoin(bookings, eq(lessons.bookingId, bookings.id))
    .innerJoin(users, eq(bookings.parentId, users.id))
    .where(and(eq(lessons.id, lessonId), eq(bookings.teacherId, teacherId), eq(lessons.status, 'scheduled')));

    if (lessonWithParent.length === 0) {
      return res.status(404).json({ error: 'Lesson not found or not scheduled' });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await db.update(lessons)
      .set({ 
        status: 'completed_by_teacher', 
        confirmationOtp: otp, 
        otpExpiry: otpExpiry 
      })
      .where(eq(lessons.id, lessonId));

    if (lessonWithParent[0].parent_phone) {
      await sendSMS(lessonWithParent[0].parent_phone, `Your lesson OTP is ${otp} (valid 15 mins)`);
    }

    res.json({ message: 'Lesson marked complete and OTP sent to parent' });
  } catch (err: any) {
    (req.log || logger).error({ err, teacherId, lessonId }, 'lesson.teacher_complete_failed');
    res.status(500).json({ error: 'Failed to mark lesson complete' });
  }
};
