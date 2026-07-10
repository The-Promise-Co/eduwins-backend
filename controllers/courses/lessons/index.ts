import { Request, Response } from 'express';
import { db } from '../../../database/db';
import { courseLessons } from '../../../database/schema';
import { eq } from 'drizzle-orm';
import logger from '../../../utils/logger';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  }
}

// Add a Lesson to a Module
export const addLesson = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { moduleId } = req.params;
    const data = req.body;

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
