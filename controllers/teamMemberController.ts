import { Request, Response } from 'express';
import { asc, eq } from 'drizzle-orm';
import { db } from '../database/db';
import { teamMembers } from '../database/schema';
import logger from '../utils/logger';

const slugify = (value: string) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const parseMemberInput = (body: Record<string, unknown>) => {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const bio = typeof body.bio === 'string' ? body.bio.trim() : '';
  const providedSlug = typeof body.slug === 'string' ? body.slug : '';
  const slug = slugify(providedSlug || name);
  const photoUrl = typeof body.photoUrl === 'string' ? body.photoUrl.trim() : '';
  const displayOrder = Number(body.displayOrder ?? 0);
  const isPublished = body.isPublished === true || body.isPublished === 'true';

  return { name, title, bio, slug, photoUrl: photoUrl || null, displayOrder, isPublished };
};

const isValidMember = (member: ReturnType<typeof parseMemberInput>) =>
  member.name.length > 0 && member.title.length > 0 && member.bio.length > 0 &&
  member.slug.length > 0 && Number.isInteger(member.displayOrder);

export const listPublishedTeamMembers = async (req: Request, res: Response) => {
  try {
    const members = await db.select().from(teamMembers)
      .where(eq(teamMembers.isPublished, true))
      .orderBy(asc(teamMembers.displayOrder), asc(teamMembers.name));
    res.json(members);
  } catch (err) {
    (req.log || logger).error({ err }, 'team_members.public_list_failed');
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
};

export const getPublishedTeamMember = async (req: Request, res: Response) => {
  try {
    const [member] = await db.select().from(teamMembers)
      .where(eq(teamMembers.slug, req.params.slug))
      .limit(1);
    if (!member || !member.isPublished) return res.status(404).json({ error: 'Team member not found' });
    res.json(member);
  } catch (err) {
    (req.log || logger).error({ err, slug: req.params.slug }, 'team_members.public_detail_failed');
    res.status(500).json({ error: 'Failed to fetch team member' });
  }
};

export const listAllTeamMembers = async (req: Request, res: Response) => {
  try {
    const members = await db.select().from(teamMembers)
      .orderBy(asc(teamMembers.displayOrder), asc(teamMembers.name));
    res.json(members);
  } catch (err) {
    (req.log || logger).error({ err }, 'team_members.admin_list_failed');
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
};

export const createTeamMember = async (req: Request, res: Response) => {
  const member = parseMemberInput(req.body || {});
  if (!isValidMember(member)) {
    return res.status(400).json({ error: 'Name, title, bio, a valid slug, and an integer display order are required' });
  }

  try {
    const [created] = await db.insert(teamMembers).values({
      id: `member_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...member,
      updatedAt: new Date(),
    }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'A team member with this slug already exists' });
    (req.log || logger).error({ err }, 'team_members.create_failed');
    res.status(500).json({ error: 'Failed to create team member' });
  }
};

export const updateTeamMember = async (req: Request, res: Response) => {
  const member = parseMemberInput(req.body || {});
  if (!isValidMember(member)) {
    return res.status(400).json({ error: 'Name, title, bio, a valid slug, and an integer display order are required' });
  }

  try {
    const [updated] = await db.update(teamMembers)
      .set({ ...member, updatedAt: new Date() })
      .where(eq(teamMembers.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Team member not found' });
    res.json(updated);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'A team member with this slug already exists' });
    (req.log || logger).error({ err, id: req.params.id }, 'team_members.update_failed');
    res.status(500).json({ error: 'Failed to update team member' });
  }
};

export const deleteTeamMember = async (req: Request, res: Response) => {
  try {
    const [deleted] = await db.delete(teamMembers)
      .where(eq(teamMembers.id, req.params.id))
      .returning({ id: teamMembers.id });
    if (!deleted) return res.status(404).json({ error: 'Team member not found' });
    res.json({ message: 'Team member deleted' });
  } catch (err) {
    (req.log || logger).error({ err, id: req.params.id }, 'team_members.delete_failed');
    res.status(500).json({ error: 'Failed to delete team member' });
  }
};
