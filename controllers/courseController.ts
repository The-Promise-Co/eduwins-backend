import { Request, Response } from 'express';
import { db } from '../database/db';
import { courses, modules, courseLessons } from '../database/schema';
import { eq, asc, sql } from 'drizzle-orm';

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
        limit,
        offset,
      }),
      db.select({ count: sql<number>`count(*)` }).from(courses).where(isOwner ? whereClause : eq(courses.status, 'published'))
    ]);

    const total = totalCount[0]?.count || 0;

    res.status(200).json({
      data,
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
        limit,
        offset,
      }),
      db.select({ count: sql<number>`count(*)` }).from(courses).where(eq(courses.status, 'published'))
    ]);

    const total = totalCount[0]?.count || 0;

    res.status(200).json({
      data,
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
