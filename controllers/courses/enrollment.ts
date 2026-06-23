import { Request, Response } from 'express';
import { db } from '../../database/db';
import { courses, courseEnrollments } from '../../database/schema';
import { eq, and, sql } from 'drizzle-orm';
import { attachTeacherNames } from './attachTeacherNames';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
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

// Enroll in a free course
export const enrollCourse = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: courseId } = req.params;
    const userId = req.user.id;

    const [course] = await db.select({ id: courses.id, is_free: courses.is_free })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (!course.is_free) {
      return res.status(402).json({ error: 'Payment required before enrolling in this course' });
    }

    const result = await enrollUserInCourse(courseId, userId);

    if (!result) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (result.alreadyEnrolled) {
      return res.status(409).json({ error: 'Already enrolled in this course' });
    }

    res.status(201).json(result.enrollment);
  } catch (err: any) {
    console.error('Enroll course error:', err);
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

    const data = enrollmentRows.map(row => {
      const course = row.course;
      const lessonCount = (course as any).modules?.reduce((acc: number, mod: any) => acc + (mod.lessons?.length || 0), 0) || 0;
      const { modules, ...rest } = course as any;
      return {
        ...rest,
        lesson_count: lessonCount,
        enrolled_at: row.createdAt,
      };
    });
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
    console.error('Get enrolled courses error:', err);
    res.status(500).json({ error: 'Failed to fetch enrolled courses' });
  }
};
