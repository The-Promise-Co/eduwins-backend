import { Request, Response } from 'express';
import { db } from '../database/db';
import { progressReports, parentProfiles, teacherProfiles, users } from '../database/schema';
import { eq, desc, sql } from 'drizzle-orm';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  }
}

export const createReport = async (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user.id;
  const { 
    studentId, 
    weekStart, 
    weekEnd, 
    performanceSummary, 
    attendanceScore, 
    skillImprovementScore, 
    homeworkCompletion, 
    notes 
  } = req.body;

  try {
    // Check if parent profile exists for the studentId
    const parentProfile = await db.query.parentProfiles.findFirst({
      where: eq(parentProfiles.userId, studentId),
    });

    if (!parentProfile) {
      return res.status(404).json({ error: 'Student parent profile not found' });
    }

    // Check if requester has a teacher profile
    const teacherProfile = await db.query.teacherProfiles.findFirst({
      where: eq(teacherProfiles.userId, teacherId),
    });

    if (!teacherProfile) {
      return res.status(403).json({ error: 'Only teachers can send progress reports' });
    }

    const reportId = Math.random().toString(36).substring(2, 15);
    const newReport = {
      id: reportId,
      studentId,
      teacherId,
      weekStart: new Date(weekStart),
      weekEnd: new Date(weekEnd),
      performanceSummary,
      attendanceScore,
      skillImprovementScore,
      homeworkCompletion,
      notes,
      createdAt: new Date(),
    };

    await db.insert(progressReports).values(newReport);

    res.status(201).json(newReport);
  } catch (err: any) {
    console.error('Create report error:', err);
    res.status(500).json({ error: 'Could not create progress report' });
  }
};

export const getReports = async (req: AuthenticatedRequest, res: Response) => {
  const parentId = req.user.id;

  try {
    const parent = await db.query.parentProfiles.findFirst({
      where: eq(parentProfiles.userId, parentId),
    });

    if (!parent) {
      return res.status(403).json({ error: 'Only parents can access progress reports' });
    }

    const reportsList = await db.select({
      id: progressReports.id,
      studentId: progressReports.studentId,
      teacherId: progressReports.teacherId,
      weekStart: progressReports.weekStart,
      weekEnd: progressReports.weekEnd,
      performanceSummary: progressReports.performanceSummary,
      attendanceScore: progressReports.attendanceScore,
      skillImprovementScore: progressReports.skillImprovementScore,
      homeworkCompletion: progressReports.homeworkCompletion,
      notes: progressReports.notes,
      createdAt: progressReports.createdAt,
      teacher_name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
    })
    .from(progressReports)
    .innerJoin(users, eq(progressReports.teacherId, users.id))
    .where(eq(progressReports.studentId, parentId))
    .orderBy(desc(progressReports.weekStart));

    res.json(reportsList);
  } catch (err: any) {
    console.error('Get reports error:', err);
    res.status(500).json({ error: 'Could not fetch progress reports' });
  }
};
