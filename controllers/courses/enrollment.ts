import { Request, Response } from 'express';
import { db } from '../../database/db';
import { courses, courseEnrollments } from '../../database/schema';
import { eq, and, sql } from 'drizzle-orm';
import { attachTeacherNames } from './attachTeacherNames';
import { initializePaystackTransaction } from '../paystack/initializePayment';
import { buildProgressSummary } from './progress';
import logger from '../../utils/logger';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
    email?: string;
  }
}

export const enrollUserInCourse = async (courseId: string, userId: string) => {
    const [existing] = await db.select({ id: courseEnrollments.id })
      .from(courseEnrollments)
      .where(
        and(
          eq(courseEnrollments.courseId, courseId),
          eq(courseEnrollments.userId, userId)
        )
      )
      .limit(1);

    if (existing) {
      return { enrollment: existing, alreadyEnrolled: true };
    }

    const course = await db.select({ id: courses.id, enrolled_count: courses.enrolled_count })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course[0]) {
      return null;
    }

    const [enrollment] = await db.insert(courseEnrollments).values({
      courseId,
      userId,
    }).returning();

    await db.update(courses)
      .set({ enrolled_count: (course[0].enrolled_count || 0) + 1 })
      .where(eq(courses.id, courseId));

    return { enrollment, alreadyEnrolled: false };
};

// Enroll in a course. Free courses enroll immediately; paid courses return Paystack authorization.
export const enrollCourse = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: courseId } = req.params;
    const userId = req.user.id;

    const [course] = await db.select({
      id: courses.id,
      is_free: courses.is_free,
      price: courses.price,
      teacher_id: courses.teacher_id,
      title: courses.title,
    })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const existing = await db.select({ id: courseEnrollments.id })
      .from(courseEnrollments)
      .where(and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.userId, userId)))
      .limit(1);

    if (existing[0]) {
      return res.status(409).json({ error: 'Already enrolled in this course' });
    }

    if (course.is_free) {
      const result = await enrollUserInCourse(courseId, userId);

      if (!result) {
        return res.status(404).json({ error: 'Course not found' });
      }

      return res.status(201).json({ enrollment: result.enrollment, requiresPayment: false });
    }

    const amount = Number(course.price || 0);
    const email = req.user.email || req.body.email;

    if (!email) {
      return res.status(400).json({ error: 'Email is required to initialize payment' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Invalid course price' });
    }

    const payment = await initializePaystackTransaction({
      email,
      amount,
      callback_url: req.body.callback_url || `${process.env.FRONTEND_URL}/courses/payment/confirm`,
      metadata: {
        payment_for: 'course',
        course_id: courseId,
        user_id: userId,
        teacher_id: course.teacher_id,
        course_title: course.title,
      },
    });

    res.status(200).json({
      requiresPayment: true,
      authorizationUrl: payment.authorizationUrl,
      authorization_url: payment.authorization_url,
      reference: payment.reference,
      access_code: payment.access_code,
    });
  } catch (err: any) {
    (req.log || logger).error({ err, courseId: req.params.id, userId: req.user.id }, 'course.enroll_failed');
    res.status(500).json({ error: 'Failed to enroll in course' });
  }
};

// Get courses the authenticated user is enrolled in
export const getEnrolledCourses = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;
    const offset = (page - 1) * limit;

    const enrollmentRows = await db.query.courseEnrollments.findMany({
      where: eq(courseEnrollments.userId, userId),
      with: {
        course: {
          with: {
            subject: true,
            modules: {
              with: {
                lessons: {
                  columns: { id: true }
                }
              }
            }
          }
        }
      },
      limit,
      offset,
    });

    const totalResult = await db.select({ count: sql<number>`count(*)` })
      .from(courseEnrollments)
      .where(eq(courseEnrollments.userId, userId));

    const total = totalResult[0]?.count || 0;

    const data = await Promise.all(enrollmentRows.map(async row => {
      const course = row.course;
      const lessonCount = (course as any).modules?.reduce((acc: number, mod: any) => acc + (mod.lessons?.length || 0), 0) || 0;
      const progress = await buildProgressSummary(course.id, userId);
      const { modules, ...rest } = course as any;
      return {
        ...rest,
        lesson_count: lessonCount,
        progress_percent: progress.progressPercent,
        progress,
        enrolled_at: row.createdAt,
      };
    }));
    const dataWithTeacherNames = await attachTeacherNames(data);

    res.status(200).json({
      data: dataWithTeacherNames,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    (req.log || logger).error({ err, userId: req.user.id, query: req.query }, 'course.enrolled_list_failed');
    res.status(500).json({ error: 'Failed to fetch enrolled courses' });
  }
};
