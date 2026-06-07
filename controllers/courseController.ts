import { Request, Response } from 'express';
import { db } from '../database/db';
import { courses, modules, courseLessons, courseEnrollments } from '../database/schema';
import { eq, asc, sql, and } from 'drizzle-orm';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  }
}

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

    res.status(200).json({
      data: dataWithCount,
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

    res.status(200).json({
      data: dataWithCount,
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

// Create a new course
export const createCourse = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = req.body;
    const teacher_id = req.user.id;

    // Default to draft explicitly
    data.status = 'draft';

    const [newCourse] = await db.insert(courses).values({
      title: data.title,
      description: data.description,
      subject: data.subject,
      level: data.level,
      duration_weeks: data.duration_weeks,
      price: data.price,
      is_free: data.is_free,
      status: data.status,
      teacher_id,
      tags: Array.isArray(data.tags) ? data.tags.join(',') : (data.tags || null),
      thumbnail_url: data.thumbnail_url,
    }).returning();

    res.status(201).json(newCourse);
  } catch (err: any) {
    console.error('Create course error:', err);
    res.status(500).json({ error: 'Failed to create course' });
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

    res.status(200).json(course);
  } catch (err: any) {
    console.error('Get course error:', err);
    res.status(500).json({ error: 'Failed to fetch course' });
  }
};

// Update existing course (e.g., Publish)
export const updateCourse = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const [updated] = await db.update(courses)
      .set({
        ...data,
        updated_at: new Date()
      })
      .where(eq(courses.id, id))
      .returning();

    res.status(200).json(updated);
  } catch (err: any) {
    console.error('Update course error:', err);
    res.status(500).json({ error: 'Failed to update course' });
  }
};

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
    console.error('Add module error:', err);
    res.status(500).json({ error: 'Failed to add module' });
  }
};

// Add a Lesson to a Module
export const addLesson = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { moduleId } = req.params;
    const data = req.body;

    const [newLesson] = await db.insert(courseLessons).values({
      module_id: moduleId,
      title: data.title,
      type: data.type,
      video_url: data.video_url || null,
      duration_seconds: data.duration_seconds || null,
      content: data.content || null,
      order_index: data.order_index || 0,
      is_preview: data.is_preview || false,
    }).returning();

    res.status(201).json(newLesson);
  } catch (err: any) {
    console.error('Add lesson error:', err);
    res.status(500).json({ error: 'Failed to add lesson' });
  }
};

// Update an existing Lesson
export const updateLesson = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { lessonId } = req.params;
    const { id, module_id, created_at, ...data } = req.body;

    const [updated] = await db.update(courseLessons)
      .set({
        ...data,
        updated_at: new Date()
      })
      .where(eq(courseLessons.id, lessonId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    res.status(200).json(updated);
  } catch (err: any) {
    console.error('Update lesson error:', err);
    res.status(500).json({ error: 'Failed to update lesson' });
  }
};

// Delete a Lesson
export const deleteLesson = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { lessonId } = req.params;

    const [deleted] = await db.delete(courseLessons)
      .where(eq(courseLessons.id, lessonId))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    res.status(200).json({ message: 'Lesson deleted successfully', deleted });
  } catch (err: any) {
    console.error('Delete lesson error:', err);
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
};

// Enroll in a course
export const enrollCourse = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: courseId } = req.params;
    const userId = req.user.id;

    const [existing] = await db.select({ id: courseEnrollments.id })
      .from(courseEnrollments)
      .where(
        and(
          eq(courseEnrollments.courseId, courseId),
          eq(courseEnrollments.userId, userId)
        )
      )
      .limit(1);

    if (existing) {
      return res.status(409).json({ error: 'Already enrolled in this course' });
    }

    const course = await db.select({ id: courses.id, enrolled_count: courses.enrolled_count })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course[0]) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const [enrollment] = await db.insert(courseEnrollments).values({
      courseId,
      userId,
    }).returning();

    await db.update(courses)
      .set({ enrolled_count: (course[0].enrolled_count || 0) + 1 })
      .where(eq(courses.id, courseId));

    res.status(201).json(enrollment);
  } catch (err: any) {
    console.error('Enroll course error:', err);
    res.status(500).json({ error: 'Failed to enroll in course' });
  }
};

// Get courses the authenticated user is enrolled in
export const getEnrolledCourses = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;
    const offset = (page - 1) * limit;

    const enrollmentRows = await db.query.courseEnrollments.findMany({
      where: eq(courseEnrollments.userId, userId),
      with: {
        course: {
          with: {
            subject: true,
            modules: {
              with: {
                lessons: {
                  columns: { id: true }
                }
              }
            }
          }
        }
      },
      limit,
      offset,
    });

    const totalResult = await db.select({ count: sql<number>`count(*)` })
      .from(courseEnrollments)
      .where(eq(courseEnrollments.userId, userId));

    const total = totalResult[0]?.count || 0;

    const data = enrollmentRows.map(row => {
      const course = row.course;
      const lessonCount = (course as any).modules?.reduce((acc: number, mod: any) => acc + (mod.lessons?.length || 0), 0) || 0;
      const { modules, ...rest } = course as any;
      return {
        ...rest,
        lesson_count: lessonCount,
        enrolled_at: row.createdAt,
      };
    });

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
    console.error('Get enrolled courses error:', err);
    res.status(500).json({ error: 'Failed to fetch enrolled courses' });
  }
};

