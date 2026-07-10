import { Request, Response } from 'express';
import { db } from '../../../database/db';
import { modules } from '../../../database/schema';
import logger from '../../../utils/logger';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  }
}

// Add a Module
export const addModule = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: course_id } = req.params;
    const { title, description, order_index } = req.body;

    const [newModule] = await db.insert(modules).values({
      course_id,
      title,
      description,
      order_index: order_index || 0,
    }).returning();

    res.status(201).json(newModule);
  } catch (err: any) {
    (req.log || logger).error({ err, courseId: req.params.id, userId: req.user.id }, 'course.module_add_failed');
    res.status(500).json({ error: 'Failed to add module' });
  }
};
