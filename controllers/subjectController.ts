import { Request, Response } from 'express';
import { db } from '../database/db';
import { subjects } from '../database/schema';
import { eq } from 'drizzle-orm';
import logger from '../utils/logger';

/**
 * GET /api/subjects
 * Fetch all active subjects publicly
 */
export const getPublicSubjects = async (req: Request, res: Response) => {
  try {
    const activeSubjects = await db.query.subjects.findMany({
      where: eq(subjects.isActive, true),
      orderBy: (subjects, { asc }) => [asc(subjects.name)],
    });

    res.json(activeSubjects);
  } catch (err: any) {
    (req.log || logger).error({ err }, 'subject.list_failed');
    res.status(500).json({ error: 'Failed to fetch subjects: ' + err.message });
  }
};
