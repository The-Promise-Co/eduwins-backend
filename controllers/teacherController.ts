import { Request, Response } from 'express';
import { db } from '../database/db';
import { users, teacherProfiles, teacherCertifications, teacherEducations } from '../database/schema';
import { eq, sql, ilike, or, and, ne } from 'drizzle-orm';
import logger from '../utils/logger';

export const getTeacherById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [teacher] = await db.select({
      id: teacherProfiles.userId,
      userId: teacherProfiles.userId,
      full_name: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
      fullName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      photo: teacherProfiles.photoUrl,
      photoUrl: teacherProfiles.photoUrl,
      subjects: teacherProfiles.subjects,
      languages: teacherProfiles.languages,
      baseHourlyRate: teacherProfiles.baseHourlyRate,
      hourlyRate: teacherProfiles.baseHourlyRate,
      ratingAvg: teacherProfiles.ratingAvg,
      students: teacherProfiles.totalSessions,
      totalSessions: teacherProfiles.totalSessions,
      bio: teacherProfiles.bio,
      qualification: teacherProfiles.highestDegree,
      highestDegree: teacherProfiles.highestDegree,
      institution: teacherProfiles.institution,
      yearsOfExperience: teacherProfiles.yearsOfExperience,
      intro_video: teacherProfiles.videoVerified,
      isVerified: teacherProfiles.isVerified,
      educationLevels: teacherProfiles.educationLevels,
      sessionFormats: teacherProfiles.sessionFormats,
      deliveryModes: teacherProfiles.deliveryModes,
      availability: teacherProfiles.availability,
      availabilityConfig: teacherProfiles.availabilityConfig,
      locationState: teacherProfiles.locationState,
      locationLga: teacherProfiles.locationLga,
      locationArea: teacherProfiles.locationArea,
      location: sql<string>`COALESCE(${teacherProfiles.locationArea}, ${teacherProfiles.locationLga}, '')`,
      createdAt: teacherProfiles.createdAt,
      updatedAt: teacherProfiles.updatedAt,
    })
      .from(teacherProfiles)
      .innerJoin(users, eq(teacherProfiles.userId, users.id))
      .where(eq(teacherProfiles.userId, id))
      .limit(1);

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    const [certifications, education] = await Promise.all([
      db.query.teacherCertifications.findMany({ where: eq(teacherCertifications.userId, teacher.id) }),
      db.query.teacherEducations.findMany({ where: eq(teacherEducations.userId, teacher.id) }),
    ]);

    res.status(200).json({ ...teacher, certifications, education });
  } catch (err: any) {
    (req.log || logger).error({ err, teacherId: req.params.id }, 'teacher.get_failed');
    res.status(500).json({ error: 'Failed to fetch teacher' });
  }
};

export const searchTeachers = async (req: Request, res: Response) => {
  try {
    const { subject, lga, maxRate, locationState, locationLga } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const conditions = [
      eq(users.emailVerified, true),
      eq(users.role, 'teacher'),
      eq(users.status, 'active'),
    ];

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

    if (locationState && typeof locationState === 'string') {
      conditions.push(eq(teacherProfiles.locationState, locationState));
    }

    if (locationLga && typeof locationLga === 'string') {
      conditions.push(eq(teacherProfiles.locationLga, locationLga));
    }

    if (lga && typeof lga === 'string' && !locationLga) {
      conditions.push(ilike(teacherProfiles.locationLga, `%${lga}%`));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    const [data, totalResult] = await Promise.all([
      db.select({
        id: teacherProfiles.userId,
        full_name: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        photo: teacherProfiles.photoUrl,
        subjects: teacherProfiles.subjects,
        baseHourlyRate: teacherProfiles.baseHourlyRate,
        hourlyRate: teacherProfiles.baseHourlyRate,
        ratingAvg: teacherProfiles.ratingAvg,
        students: teacherProfiles.totalSessions,
        bio: teacherProfiles.bio,
        locationState: teacherProfiles.locationState,
        locationLga: teacherProfiles.locationLga,
        locationArea: teacherProfiles.locationArea,
        location: sql<string>`COALESCE(${teacherProfiles.locationArea}, ${teacherProfiles.locationLga}, '')`,
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
    (req.log || logger).error({ err, query: req.query }, 'teacher.search_failed');
    res.status(500).json({ error: 'Failed to search teachers' });
  }
};

// ── Get unique areas for a given state + LGA ────────────────────────
export const getTeacherAreas = async (req: Request, res: Response) => {
  try {
    const { state, lga } = req.query;

    if (!state || !lga) {
      return res.status(400).json({ error: 'state and lga are required' });
    }

    const rows = await db.selectDistinct({ area: teacherProfiles.locationArea })
      .from(teacherProfiles)
      .where(
        and(
          eq(teacherProfiles.locationState, state as string),
          eq(teacherProfiles.locationLga, lga as string),
          sql`${teacherProfiles.locationArea} IS NOT NULL AND ${teacherProfiles.locationArea} != ''`
        )
      );

    const areas = rows.map((r) => r.area).filter(Boolean) as string[];
    res.status(200).json({ areas });
  } catch (err: any) {
    (req.log || logger).error({ err, query: req.query }, 'teacher.get_areas_failed');
    res.status(500).json({ error: 'Failed to fetch areas' });
  }
};
