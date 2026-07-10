import { Request, Response } from 'express';
import { db } from '../../database/db';
import { courses } from '../../database/schema';
import { eq } from 'drizzle-orm';
import logger from '../../utils/logger';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  }
}

// Create a new course
export const createCourse = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = req.body;
    const teacher_id = req.user.id;

    data.status = 'draft';

    const [newCourse] = await db.insert(courses).values({
      title: data.title,
      description: data.description,
      subject: data.subject,
      level: data.level,
      duration_weeks: data.duration_weeks,
      price: data.price,
      is_free: data.is_free,
      status: data.status,
      teacher_id,
      tags: Array.isArray(data.tags) ? data.tags.join(',') : (data.tags || null),
      thumbnail_url: data.thumbnail_url,
    }).returning();

    res.status(201).json(newCourse);
  } catch (err: any) {
    (req.log || logger).error({ err, teacherId: req.user.id }, 'course.create_failed');
    res.status(500).json({ error: 'Failed to create course' });
  }
};

// Update existing course
export const updateCourse = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const [updated] = await db.update(courses)
      .set({
        ...data,
        updated_at: new Date()
      })
      .where(eq(courses.id, id))
      .returning();

    res.status(200).json(updated);
  } catch (err: any) {
    (req.log || logger).error({ err, courseId: req.params.id, teacherId: req.user.id }, 'course.update_failed');
    res.status(500).json({ error: 'Failed to update course' });
  }
};
