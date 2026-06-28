import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../database/db';
import { children, users } from '../database/schema';
import { eq, and } from 'drizzle-orm';
import logger from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

function genId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 8);
}

/**
 * GET /api/children
 * Returns all children registered under the authenticated parent,
 * joined with their user account details.
 */
export const getChildren = async (req: AuthenticatedRequest, res: Response) => {
  const parentId = req.user.id;

  if (req.user.role !== 'parent') {
    return res.status(403).json({ error: 'Only parents can access children' });
  }

  try {
    // Join children → users to return child user details alongside metadata
    const rows = await db
      .select({
        // children table fields
        id: children.id,
        parentId: children.parentId,
        userId: children.userId,
        dateOfBirth: children.dateOfBirth,
        grade: children.grade,
        school: children.school,
        notes: children.notes,
        createdAt: children.createdAt,
        updatedAt: children.updatedAt,
        // users table fields
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        photoUrl: users.photoUrl,
      })
      .from(children)
      .innerJoin(users, eq(children.userId, users.id))
      .where(eq(children.parentId, parentId))
      .orderBy(users.firstName);

    res.json({ children: rows });
  } catch (err: any) {
    logger.error({ err }, 'Failed to fetch children');
    res.status(500).json({ error: 'Failed to fetch children' });
  }
};

/**
 * GET /api/children/:childId
 * Returns a single child profile with user details (must belong to the requesting parent).
 */
export const getChild = async (req: AuthenticatedRequest, res: Response) => {
  const parentId = req.user.id;
  const { childId } = req.params;

  if (req.user.role !== 'parent') {
    return res.status(403).json({ error: 'Only parents can access children' });
  }

  try {
    const rows = await db
      .select({
        id: children.id,
        parentId: children.parentId,
        userId: children.userId,
        dateOfBirth: children.dateOfBirth,
        grade: children.grade,
        school: children.school,
        notes: children.notes,
        createdAt: children.createdAt,
        updatedAt: children.updatedAt,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        photoUrl: users.photoUrl,
      })
      .from(children)
      .innerJoin(users, eq(children.userId, users.id))
      .where(and(eq(children.id, childId), eq(children.parentId, parentId)));

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Child not found' });
    }

    res.json({ child: rows[0] });
  } catch (err: any) {
    logger.error({ err }, 'Failed to fetch child');
    res.status(500).json({ error: 'Failed to fetch child' });
  }
};

/**
 * POST /api/children
 * Registers a new child under the authenticated parent.
 * Creates a user account (role=student) then links it via the children table.
 */
export const registerChild = async (req: AuthenticatedRequest, res: Response) => {
  const parentId = req.user.id;

  if (req.user.role !== 'parent') {
    return res.status(403).json({ error: 'Only parents can register children' });
  }

  const { firstName, lastName, email, phone, dateOfBirth, grade, school, notes } = req.body;

  if (!firstName || !lastName || !email || !dateOfBirth || !grade) {
    return res.status(400).json({ error: 'First name, last name, email, date of birth, and grade are required' });
  }

  try {
    // Check if email is already taken
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase().trim()),
    });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    // Create the child's user account (role = 'student', no password required — parent manages)
    const userId = genId();
    const tempPassword = await bcrypt.hash(genId() + Date.now(), 10); // random unguessable password

    await db.insert(users).values({
      id: userId,
      email: email.toLowerCase().trim(),
      phone: phone?.trim() || null,
      passwordHash: tempPassword,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: 'student',
      isVerified: true, // parent-registered children are pre-verified
      emailVerified: true,
      trustScore: 0,
      referralCount: 0,
      referralRewarded: false,
    });

    // Create the children link row
    const childId = genId();
    await db.insert(children).values({
      id: childId,
      parentId,
      userId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth: dateOfBirth || null,
      grade: grade || null,
      school: school || null,
      notes: notes || null,
    });

    logger.info({ parentId, childId, userId }, 'Child registered as user successfully');
    res.status(201).json({
      message: 'Child registered successfully',
      child: {
        id: childId,
        userId,
        parentId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.toLowerCase().trim(),
        dateOfBirth: dateOfBirth || null,
        grade: grade || null,
        school: school || null,
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to register child');
    res.status(500).json({ error: 'Failed to register child' });
  }
};

/**
 * PUT /api/children/:childId
 * Updates a child's metadata (grade, school, notes) and their user profile (name, phone).
 */
export const updateChild = async (req: AuthenticatedRequest, res: Response) => {
  const parentId = req.user.id;
  const { childId } = req.params;

  if (req.user.role !== 'parent') {
    return res.status(403).json({ error: 'Only parents can update children' });
  }

  const { firstName, lastName, phone, dateOfBirth, grade, school, notes } = req.body;

  try {
    const existing = await db.query.children.findFirst({
      where: and(eq(children.id, childId), eq(children.parentId, parentId)),
    });

    if (!existing) {
      return res.status(404).json({ error: 'Child not found' });
    }

    // Update users table (name, phone)
    const userUpdate: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (firstName !== undefined) userUpdate.firstName = firstName.trim();
    if (lastName !== undefined) userUpdate.lastName = lastName.trim();
    if (phone !== undefined) userUpdate.phone = phone?.trim() || null;

    await db.update(users).set(userUpdate).where(eq(users.id, existing.userId));

    // Update children metadata
    const childUpdate: Partial<typeof children.$inferInsert> = { updatedAt: new Date() };
    if (firstName !== undefined) childUpdate.firstName = firstName.trim();
    if (lastName !== undefined) childUpdate.lastName = lastName.trim();
    if (dateOfBirth !== undefined) childUpdate.dateOfBirth = dateOfBirth;
    if (grade !== undefined) childUpdate.grade = grade;
    if (school !== undefined) childUpdate.school = school;
    if (notes !== undefined) childUpdate.notes = notes;

    await db.update(children).set(childUpdate).where(eq(children.id, childId));

    logger.info({ parentId, childId }, 'Child profile updated');
    res.json({ message: 'Child updated successfully' });
  } catch (err: any) {
    logger.error({ err }, 'Failed to update child');
    res.status(500).json({ error: 'Failed to update child' });
  }
};

/**
 * DELETE /api/children/:childId
 * Removes the child link and deletes their user account.
 */
export const deleteChild = async (req: AuthenticatedRequest, res: Response) => {
  const parentId = req.user.id;
  const { childId } = req.params;

  if (req.user.role !== 'parent') {
    return res.status(403).json({ error: 'Only parents can remove children' });
  }

  try {
    const existing = await db.query.children.findFirst({
      where: and(eq(children.id, childId), eq(children.parentId, parentId)),
    });

    if (!existing) {
      return res.status(404).json({ error: 'Child not found' });
    }

    // Delete children row first (FK), then the user account
    await db.delete(children).where(eq(children.id, childId));
    await db.delete(users).where(eq(users.id, existing.userId));

    logger.info({ parentId, childId, userId: existing.userId }, 'Child and user account removed');
    res.json({ message: 'Child removed successfully' });
  } catch (err: any) {
    logger.error({ err }, 'Failed to delete child');
    res.status(500).json({ error: 'Failed to delete child' });
  }
};
