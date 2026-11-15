import { Request, Response } from 'express';
import { db } from '../../../database/db';
import { courses, courseLessons, modules } from '../../../database/schema';
import { eq, sql } from 'drizzle-orm';
import logger from '../../../utils/logger';
import { getEntitlements } from '../../../services/subscriptionService';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  }
}

/**
 * Subscription entitlement: total video minutes across all of a tutor's
 * courses (Free 50 / Silver 300 / Gold 1,000 / Platinum unlimited). Existing
 * lessons are grandfathered on downgrade, but new video beyond the cap is
 * rejected until they upgrade.
 */
const assertVideoLimit = async ({
  teacherId,
  newDurationSeconds,
  excludeLessonId,
}: {
  teacherId: string;
  newDurationSeconds: number;
  excludeLessonId?: string;
}) => {
  const entitlements = await getEntitlements(teacherId);
  if (entitlements.limits.totalVideoMinutes === 'unlimited') return null;

  const totals = await db
    .select({
      value: sql<number>`coalesce(sum(${courseLessons.duration_seconds}), 0)::int`,
    })
    .from(courseLessons)
    .innerJoin(modules, eq(courseLessons.module_id, modules.id))
    .innerJoin(courses, eq(modules.course_id, courses.id))
    .where(eq(courses.teacher_id, teacherId));

  const baseSeconds = Number(totals[0]?.value) || 0;
  const limitSeconds = entitlements.limits.totalVideoMinutes * 60;
  const existingSeconds = excludeLessonId
    ? Number(
        (
          await db
            .select({ value: sql<number>`coalesce(${courseLessons.duration_seconds}, 0)::int` })
            .from(courseLessons)
            .where(eq(courseLessons.id, excludeLessonId))
        )[0]?.value || 0,
      )
    : 0;

  if (baseSeconds - existingSeconds + newDurationSeconds > limitSeconds) {
    return {
      error: `Your ${entitlements.plan} plan allows ${entitlements.limits.totalVideoMinutes} minutes of total video. Upgrade to add more.`,
      code: 'video_limit_reached',
      plan: entitlements.plan,
      limitMinutes: entitlements.limits.totalVideoMinutes,
    };
  }
  return null;
};

/** Resolve the owning teacher of a lesson (lesson → module → course). */
const getLessonOwner = async (lessonId: string) => {
  const [row] = await db
    .select({ teacherId: courses.teacher_id, type: courseLessons.type })
    .from(courseLessons)
    .innerJoin(modules, eq(courseLessons.module_id, modules.id))
    .innerJoin(courses, eq(modules.course_id, courses.id))
    .where(eq(courseLessons.id, lessonId))
    .limit(1);
  return row || null;
};

/** Resolve the owning teacher of a module. */
const getModuleOwner = async (moduleId: string) => {
  const [row] = await db
    .select({ teacherId: courses.teacher_id })
    .from(modules)
    .innerJoin(courses, eq(modules.course_id, courses.id))
    .where(eq(modules.id, moduleId))
    .limit(1);
  return row || null;
};

// Add a Lesson to a Module
export const addLesson = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { moduleId } = req.params;
    const data = req.body;

    const owner = await getModuleOwner(moduleId);
    if (!owner) {
      return res.status(404).json({ error: 'Module not found' });
    }
    if (owner.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'You can only add lessons to your own courses' });
    }

    const durationSeconds = Number(data.duration_seconds) || 0;
    if (data.type === 'video' && durationSeconds > 0) {
      const limitError = await assertVideoLimit({
        teacherId: req.user.id,
        newDurationSeconds: durationSeconds,
      });
      if (limitError) {
        return res.status(403).json(limitError);
      }
    }

    const [newLesson] = await db.insert(courseLessons).values({
      module_id: moduleId,
      title: data.title,
      type: data.type,
      video_url: data.video_url || null,
      duration_seconds: data.duration_seconds || null,
      content: data.content || null,
      order_index: data.order_index || 0,
      is_preview: data.is_preview || false,
    }).returning();

    res.status(201).json(newLesson);
  } catch (err: any) {
    (req.log || logger).error({ err, moduleId: req.params.moduleId, userId: req.user.id }, 'course.lesson_add_failed');
    res.status(500).json({ error: 'Failed to add lesson' });
  }
};

// Update an existing Lesson
export const updateLesson = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { lessonId } = req.params;
    const { id, module_id, created_at, ...data } = req.body;

    const owner = await getLessonOwner(lessonId);
    if (!owner) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    if (owner.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit lessons in your own courses' });
    }

    const durationSeconds = Number(data.duration_seconds) || 0;
    if (durationSeconds > 0 && (data.type === 'video' || (!data.type && owner.type === 'video'))) {
      const limitError = await assertVideoLimit({
        teacherId: req.user.id,
        newDurationSeconds: durationSeconds,
        excludeLessonId: lessonId,
      });
      if (limitError) {
        return res.status(403).json(limitError);
      }
    }

    const [updated] = await db.update(courseLessons)
      .set({
        ...data,
        updated_at: new Date()
      })
      .where(eq(courseLessons.id, lessonId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    res.status(200).json(updated);
  } catch (err: any) {
    (req.log || logger).error({ err, lessonId: req.params.lessonId, userId: req.user.id }, 'course.lesson_update_failed');
    res.status(500).json({ error: 'Failed to update lesson' });
  }
};

// Delete a Lesson
export const deleteLesson = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { lessonId } = req.params;

    const owner = await getLessonOwner(lessonId);
    if (!owner) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    if (owner.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete lessons in your own courses' });
    }

    const [deleted] = await db.delete(courseLessons)
      .where(eq(courseLessons.id, lessonId))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    res.status(200).json({ message: 'Lesson deleted successfully', deleted });
  } catch (err: any) {
    (req.log || logger).error({ err, lessonId: req.params.lessonId, userId: req.user.id }, 'course.lesson_delete_failed');
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
};
