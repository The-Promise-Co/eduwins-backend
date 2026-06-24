import { Request, Response } from 'express';
import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../database/db';
import { courseEnrollments, courseLessons, courseProgress, courses, modules } from '../../database/schema';

interface AuthenticatedRequest extends Request {
  user: { id: string; role: string };
}

const assertCourseAccess = async (courseId: string, userId: string) => {
  const course = await db.query.courses.findFirst({ where: eq(courses.id, courseId) });
  if (!course) return { ok: false as const, status: 404, error: 'Course not found' };

  if (course.teacher_id === userId) return { ok: true as const, course };

  const [enrollment] = await db.select({ id: courseEnrollments.id })
    .from(courseEnrollments)
    .where(and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.userId, userId)))
    .limit(1);

  if (!enrollment) return { ok: false as const, status: 403, error: 'You must enroll in this course to update progress' };
  return { ok: true as const, course };
};

export const updateCourseProgress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: courseId } = req.params;
    const userId = req.user.id;
    const { lessonId, completed, lastPositionSeconds } = req.body;

    if (!lessonId) {
      return res.status(400).json({ error: 'lessonId is required' });
    }

    const access = await assertCourseAccess(courseId, userId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const [lesson] = await db.select({ id: courseLessons.id })
      .from(courseLessons)
      .innerJoin(modules, eq(courseLessons.module_id, modules.id))
      .where(and(eq(courseLessons.id, lessonId), eq(modules.course_id, courseId)))
      .limit(1);

    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found in this course' });
    }

    const [existing] = await db.select({
      id: courseProgress.id,
      completed: courseProgress.completed,
      completedAt: courseProgress.completedAt,
      lastPositionSeconds: courseProgress.lastPositionSeconds,
    })
      .from(courseProgress)
      .where(and(
        eq(courseProgress.courseId, courseId),
        eq(courseProgress.userId, userId),
        eq(courseProgress.lessonId, lessonId),
      ))
      .limit(1);

    const nextCompleted = completed === undefined ? existing?.completed || false : Boolean(completed);
    const nextPosition = lastPositionSeconds === undefined
      ? existing?.lastPositionSeconds || 0
      : Math.max(0, Number(lastPositionSeconds || 0));
    const values = {
      completed: nextCompleted,
      completedAt: nextCompleted ? existing?.completedAt || new Date() : null,
      lastPositionSeconds: nextPosition,
      updatedAt: new Date(),
    };

    const [progress] = existing
      ? await db.update(courseProgress).set(values).where(eq(courseProgress.id, existing.id)).returning()
      : await db.insert(courseProgress).values({
        id: crypto.randomUUID(),
        courseId,
        userId,
        lessonId,
        ...values,
      }).returning();

    const summary = await buildProgressSummary(courseId, userId);

    res.json({ progress, summary });
  } catch (err: any) {
    console.error('Update course progress error:', err);
    res.status(500).json({ error: 'Failed to update course progress' });
  }
};

export const buildProgressSummary = async (courseId: string, userId: string) => {
  const course = await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
    with: {
      modules: {
        with: {
          lessons: { columns: { id: true } },
        },
      },
    },
  });

  const lessonIds = (course as any)?.modules?.flatMap((module: any) => module.lessons?.map((lesson: any) => lesson.id) || []) || [];
  const rows = await db.select().from(courseProgress).where(and(eq(courseProgress.courseId, courseId), eq(courseProgress.userId, userId)));
  const completedRows = rows.filter((row) => row.completed && lessonIds.includes(row.lessonId));
  const progressByLesson = Object.fromEntries(rows.map((row) => [row.lessonId, row]));

  return {
    totalLessons: lessonIds.length,
    completedLessons: completedRows.length,
    progressPercent: lessonIds.length ? Math.round((completedRows.length / lessonIds.length) * 100) : 0,
    progressByLesson,
    lastProgress: rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] || null,
  };
};
