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

/**
 * GET /api/subjects/all
 * Fetch all subjects (admin) including inactive
 */
export const listAllSubjects = async (req: Request, res: Response) => {
  try {
    const allSubjects = await db.query.subjects.findMany({
      orderBy: (subjects, { asc }) => [asc(subjects.name)],
    });
    res.json(allSubjects);
  } catch (err: any) {
    (req.log || logger).error({ err }, 'subject.admin_list_failed');
    res.status(500).json({ error: 'Failed to fetch subjects: ' + err.message });
  }
};

/**
 * POST /api/subjects
 * Create a new subject (admin)
 */
export const createSubject = async (req: Request, res: Response) => {
  try {
    const { name, description, isActive } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Subject name is required' });
    }

    const existing = await db.query.subjects.findFirst({
      where: eq(subjects.name, name.trim()),
    });
    if (existing) {
      return res.status(409).json({ error: 'A subject with this name already exists' });
    }

    const id = `subj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const [created] = await db
      .insert(subjects)
      .values({
        id,
        name: name.trim(),
        description: description || null,
        isActive: isActive !== undefined ? isActive : true,
      })
      .returning();

    res.status(201).json(created);
  } catch (err: any) {
    (req.log || logger).error({ err }, 'subject.create_failed');
    res.status(500).json({ error: 'Failed to create subject: ' + err.message });
  }
};

/**
 * PUT /api/subjects/:id
 * Update a subject (admin)
 */
export const updateSubject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, isActive } = req.body;

    const existing = await db.query.subjects.findFirst({
      where: eq(subjects.id, id),
    });
    if (!existing) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    if (name && name.trim() !== existing.name) {
      const duplicate = await db.query.subjects.findFirst({
        where: eq(subjects.name, name.trim()),
      });
      if (duplicate) {
        return res.status(409).json({ error: 'A subject with this name already exists' });
      }
    }

    const [updated] = await db
      .update(subjects)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      })
      .where(eq(subjects.id, id))
      .returning();

    res.json(updated);
  } catch (err: any) {
    (req.log || logger).error({ err }, 'subject.update_failed');
    res.status(500).json({ error: 'Failed to update subject: ' + err.message });
  }
};

/**
 * DELETE /api/subjects/:id
 * Soft-delete a subject (admin) — sets isActive to false
 */
export const deleteSubject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await db.query.subjects.findFirst({
      where: eq(subjects.id, id),
    });
    if (!existing) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    await db
      .update(subjects)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(subjects.id, id));

    res.json({ message: 'Subject deactivated' });
  } catch (err: any) {
    (req.log || logger).error({ err }, 'subject.delete_failed');
    res.status(500).json({ error: 'Failed to deactivate subject: ' + err.message });
  }
};
