import { Request, Response } from 'express';
import { db } from '../../database/db';
import { courses, modules, courseLessons, courseEnrollments } from '../../database/schema';
import { eq, asc, sql, and } from 'drizzle-orm';
import { attachTeacherNames } from './attachTeacherNames';
import { buildProgressSummary } from './progress';

// List courses for a specific teacher
export const getCoursesByTeacher = async (req: Request, res: Response) => {
  try {
    const { teacherId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    let whereClause = eq(courses.teacher_id, teacherId);

    const user = (req as any).user;
    const isOwner = user?.id === teacherId;

    const [data, totalCount] = await Promise.all([
      db.query.courses.findMany({
        where: isOwner ? whereClause : eq(courses.status, 'published'),
        orderBy: [asc(courses.created_at)],
        with: {
          subject: true,
          modules: {
            with: {
              lessons: {
                columns: {
                  id: true
                }
              }
            }
          }
        },
        limit,
        offset,
      }),
      db.select({ count: sql<number>`count(*)` }).from(courses).where(isOwner ? whereClause : eq(courses.status, 'published'))
    ]);

    const total = totalCount[0]?.count || 0;

    const dataWithCount = data.map(course => {
      const lessonCount = (course as any).modules?.reduce((acc: number, mod: any) => acc + (mod.lessons?.length || 0), 0) || 0;
      const { modules, ...rest } = course as any;
      return {
        ...rest,
        lesson_count: lessonCount
      };
    });
    const dataWithTeacherNames = await attachTeacherNames(dataWithCount);

    res.status(200).json({
      data: dataWithTeacherNames,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err: any) {
    console.error('Get courses by teacher error:', err);
    res.status(500).json({ error: 'Failed to fetch teacher courses' });
  }
};

// List courses (all published for students)
export const listCourses = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;
    const offset = (page - 1) * limit;

    const [data, totalCount] = await Promise.all([
      db.query.courses.findMany({
        where: eq(courses.status, 'published'),
        orderBy: [asc(courses.created_at)],
        with: {
          subject: true,
          modules: {
            with: {
              lessons: {
                columns: {
                  id: true
                }
              }
            }
          }
        },
        limit,
        offset,
      }),
      db.select({ count: sql<number>`count(*)` }).from(courses).where(eq(courses.status, 'published'))
    ]);

    const total = totalCount[0]?.count || 0;

    const dataWithCount = data.map(course => {
      const lessonCount = (course as any).modules?.reduce((acc: number, mod: any) => acc + (mod.lessons?.length || 0), 0) || 0;
      const { modules, ...rest } = course as any;
      return {
        ...rest,
        lesson_count: lessonCount
      };
    });
    const dataWithTeacherNames = await attachTeacherNames(dataWithCount);

    res.status(200).json({
      data: dataWithTeacherNames,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err: any) {
    console.error('List courses error:', err);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
};

// Get course with full relations
export const getCourseById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const course = await db.query.courses.findFirst({
      where: eq(courses.id, id),
      with: {
        subject: true,
        modules: {
          orderBy: [asc(modules.order_index)],
          with: {
            lessons: {
              orderBy: [asc(courseLessons.order_index)]
            }
          }
        }
      }
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const [courseWithTeacherName] = await attachTeacherNames([course]);

    res.status(200).json(courseWithTeacherName);
  } catch (err: any) {
    console.error('Get course error:', err);
    res.status(500).json({ error: 'Failed to fetch course' });
  }
};

export const getCourseForLearning = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const course = await db.query.courses.findFirst({
      where: eq(courses.id, id),
      with: {
        subject: true,
        modules: {
          orderBy: [asc(modules.order_index)],
          with: {
            lessons: {
              orderBy: [asc(courseLessons.order_index)]
            }
          }
        }
      }
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const isOwner = course.teacher_id === user.id;
    const [enrollment] = await db.select({ id: courseEnrollments.id })
      .from(courseEnrollments)
      .where(and(eq(courseEnrollments.courseId, id), eq(courseEnrollments.userId, user.id)))
      .limit(1);

    if (!isOwner && !enrollment) {
      return res.status(403).json({ error: 'You must enroll in this course to access lessons' });
    }

    const [courseWithTeacherName] = await attachTeacherNames([course]);
    const progressSummary = await buildProgressSummary(id, user.id);

    res.status(200).json({
      ...courseWithTeacherName,
      enrolled_at: enrollment?.id ? undefined : null,
      access: isOwner ? 'owner' : 'enrolled',
      progress: progressSummary,
    });
  } catch (err: any) {
    console.error('Get learning course error:', err);
    res.status(500).json({ error: 'Failed to fetch course lessons' });
  }
};
