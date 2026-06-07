import { Request, Response } from 'express';
import { db } from '../database/db';
import { users, teacherProfiles } from '../database/schema';
import { eq, sql, ilike, or, and } from 'drizzle-orm';

export const searchTeachers = async (req: Request, res: Response) => {
  try {
    const { subject, lga, maxRate } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const conditions = [eq(teacherProfiles.isApproved, true)];

    if (subject && typeof subject === 'string') {
      conditions.push(
        sql`${teacherProfiles.subjects} && ARRAY[${subject}]::text[]`
      );
    }

    if (maxRate && typeof maxRate === 'string') {
      const rate = parseFloat(maxRate);
      if (!isNaN(rate)) {
        conditions.push(sql`${teacherProfiles.baseHourlyRate} <= ${rate}`);
      }
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    const [data, totalResult] = await Promise.all([
      db.select({
        id: teacherProfiles.userId,
        full_name: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        photo_url: sql<string>`COALESCE(${teacherProfiles.photoUrl}, '')`,
        subjects: teacherProfiles.subjects,
        baseHourlyRate: teacherProfiles.baseHourlyRate,
        rating: teacherProfiles.ratingAvg,
        students: teacherProfiles.totalSessions,
        bio: teacherProfiles.bio,
        location: sql<string>`''`,
      })
        .from(teacherProfiles)
        .innerJoin(users, eq(teacherProfiles.userId, users.id))
        .where(whereClause)
        .limit(limit)
        .offset(offset),

      db.select({ count: sql<number>`count(*)` })
        .from(teacherProfiles)
        .innerJoin(users, eq(teacherProfiles.userId, users.id))
        .where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;

    res.status(200).json({
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Search teachers error:', err);
    res.status(500).json({ error: 'Failed to search teachers' });
  }
};
