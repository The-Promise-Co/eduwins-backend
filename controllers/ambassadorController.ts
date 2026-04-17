import { Request, Response } from 'express';
import { db } from '../database/db';
import { ambassadors, teacherProfiles, users } from '../database/schema';
import { eq, and, sql } from 'drizzle-orm';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  }
}

export const apply = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;
  const { mentorId } = req.body;

  try {
    const teacherProfile = await db.query.teacherProfiles.findFirst({
      where: eq(teacherProfiles.userId, teacherId),
    });

    if (!teacherProfile) {
      return res.status(403).json({ error: 'Only teachers can join ambassador program' });
    }

    const existing = await db.query.ambassadors.findFirst({
      where: eq(ambassadors.userId, teacherId),
    });

    if (existing) {
      return res.status(400).json({ error: 'Already in ambassador program' });
    }

    let level = 1;

    if (mentorId) {
      const mentor = await db.query.ambassadors.findFirst({
        where: and(eq(ambassadors.userId, mentorId), eq(ambassadors.status, 'active')),
      });

      if (!mentor) {
        return res.status(400).json({ error: 'Mentor not found or not active' });
      }
      level = 2;
    }

    const ambassadorId = Math.random().toString(36).substring(2, 15);
    await db.insert(ambassadors).values({
      id: ambassadorId,
      userId: teacherId,
      mentorId: mentorId || null,
      level,
      status: 'active',
      joinedAt: new Date(),
    });

    res.json({ message: 'Ambassador status granted', level });
  } catch (err: any) {
    console.error('Ambassador apply error:', err);
    res.status(500).json({ error: 'Could not apply for ambassador' });
  }
};

export const me = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await db.query.ambassadors.findFirst({
      where: eq(ambassadors.userId, req.user.id),
    });

    if (!result) {
      return res.status(404).json({ error: 'Not an ambassador yet' });
    }

    res.json(result);
  } catch (err: any) {
    console.error('Ambassador me error:', err);
    res.status(500).json({ error: 'Could not fetch ambassador data' });
  }
};

export const rewardReferral = async (req: Request, res: Response) => {
  try {
    const { referrerId, level } = req.body;
    if (!referrerId || ![1, 2].includes(level)) {
      return res.status(400).json({ error: 'referrerId and level (1 or 2) are required' });
    }

    const amount = level === 1 ? 1000 : 500;

    const ambassador = await db.query.ambassadors.findFirst({
      where: eq(ambassadors.userId, referrerId),
    });

    if (!ambassador) {
      return res.status(404).json({ error: 'Referrer is not an ambassador' });
    }

    const currentCredits = parseFloat(ambassador.earnedCredits?.toString() || '0');
    
    await db.update(ambassadors)
      .set({ 
        earnedCredits: (currentCredits + amount).toString(),
        updatedAt: new Date()
      })
      .where(eq(ambassadors.userId, referrerId));

    res.json({ message: 'Ambassador reward credited', amount });
  } catch (err: any) {
    console.error('Ambassador reward error:', err);
    res.status(500).json({ error: 'Could not reward ambassador' });
  }
};
